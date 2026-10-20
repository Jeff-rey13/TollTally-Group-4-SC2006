import type { Route, Trip, VehicleProfile } from '@prisma/client';
import type { TripDto, TripInput, VehicleClass } from '@tolltally/shared';
import type { ParkingLookup } from '../../adapters/parking';
import type { RouteResult } from '../../adapters/routing';
import type { RoadSpan } from '../../domain/types';
import type { AppDeps } from '../../deps';
import { startTimer, timing } from '../../lib/budget';
import { ExternalServiceError, HttpError, notFound } from '../../lib/errors';
import { toDb, toDbOrNull, toDecimal } from '../../lib/decimal';
import { decodePolyline } from '../../lib/polyline';
import {
  type LegSpec,
  type ReferenceData,
  type RouteLike,
  type VehicleLike,
  loadReferenceData,
  policyFrom,
  priceLegs,
} from './pricing';
import { serializeTrip, tripInclude, type TripWithAll } from './serialize';
import { toVehicleDto } from '../vehicles/service';

export interface PlanTripResult {
  trip: TripDto;
  estimateError: { message: string; retryable: boolean } | null;
}

/**
 * Loads one of the Driver's trips with everything needed to serialise or re-price it.
 */
export async function loadTrip(
  deps: AppDeps,
  tripId: string,
  userId: string,
): Promise<TripWithAll> {
  const trip = await deps.prisma.trip.findFirst({
    where: { id: tripId, driverId: userId },
    include: tripInclude,
  });
  if (!trip) throw notFound('Trip');
  return trip;
}

/**
 * Returns one of the Driver's trips as a DTO, or 404 if it belongs to someone else (NFR-SEC-05).
 */
export async function getTrip(deps: AppDeps, tripId: string, userId: string): Promise<TripDto> {
  return serializeTrip(await loadTrip(deps, tripId, userId), policyFrom(deps.config));
}

export function vehicleLike(v: VehicleProfile): VehicleLike {
  return {
    consumptionRate: toDecimal(v.consumptionRate),
    fuelType: v.fuelType,
    vehicleClass: v.vehicleClass,
  };
}

export function routeFromResult(r: RouteResult): RouteLike {
  return {
    distanceKm: toDecimal(r.distanceKm),
    drivingTimeSec: r.drivingTimeSec,
    geometry: r.geometry,
    roads: r.roads,
  };
}

/** Reads the stored road names of a route; old rows and providers without them give undefined. */
export function parseRoads(value: string | null | undefined): RoadSpan[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (s): s is RoadSpan =>
        typeof s === 'object' &&
        s !== null &&
        Number.isInteger((s as RoadSpan).from) &&
        typeof (s as RoadSpan).name === 'string',
    );
  } catch {
    return undefined;
  }
}

export function routeFromStored(r: Route): RouteResult {
  return {
    distanceKm: r.distanceKm.toString(),
    drivingTimeSec: r.drivingTimeSec,
    geometry: decodePolyline(r.geometry),
    encodedGeometry: r.geometry,
    provider: r.provider,
    roads: parseRoads(r.roads),
  };
}

/**
 * Asks the Parking Rate Service for the destination carpark, or skips the call for zero parking time (FR-EST-08).
 */
export async function lookupParking(
  deps: AppDeps,
  trip: Trip,
  vehicleClass?: VehicleClass,
): Promise<ParkingLookup | null> {
  if (trip.parkingDurationMin <= 0) return null;
  try {
    return await deps.parking.nearest(
      { lat: trip.destinationLat, lng: trip.destinationLng },
      vehicleClass,
    );
  } catch (err) {
    const reason =
      err instanceof ExternalServiceError ? err.message : 'The parking rate service failed';
    return { ok: false, kind: 'SERVICE_FAILURE', reason };
  }
}

/**
 * Builds the outbound and, for a return trip, the inbound leg, each priced at its own departure time (FR-SET-07).
 */
export function buildLegs(
  trip: Trip,
  outbound: RouteResult,
  inbound: RouteResult | null,
  parkingLookup: ParkingLookup | null,
  departureOverride?: Date,
): LegSpec[] {
  const legs: LegSpec[] = [
    {
      isReturnLeg: false,
      departureTime: departureOverride ?? trip.departureTime,
      route: routeFromResult(outbound),
      parking: { durationMin: trip.parkingDurationMin, lookup: parkingLookup },
    },
  ];
  if (inbound && trip.returnDepartureTime) {
    legs.push({
      isReturnLeg: true,
      departureTime: trip.returnDepartureTime,
      route: routeFromResult(inbound),
      parking: null,
    });
  }
  return legs;
}

/**
 * Turns a routing failure into a message that says what actually went wrong. Outside production
 * it also says how to fix a configuration problem, because the person reading it is the developer.
 */
export function routingFailureMessage(err: ExternalServiceError, isProduction: boolean): string {
  const kept = 'Your trip is still planned; try the estimate again.';
  if (err.kind === 'UNAUTHORISED') {
    if (isProduction) return `Route planning is unavailable right now. ${kept}`;
    return err.message.includes('not configured')
      ? 'Live routing needs a OneMap login. Add ONEMAP_EMAIL and ONEMAP_PASSWORD to backend/.env, then restart TollTally.'
      : 'OneMap did not accept the login in backend/.env. Check ONEMAP_EMAIL and ONEMAP_PASSWORD (your OneMap account email and password), then restart TollTally.';
  }
  if (err.kind === 'TIMEOUT') return `OneMap took too long to answer. ${kept}`;
  if (err.kind === 'MALFORMED')
    return 'OneMap found no driving route between these places. Try an address nearer a road.';
  return `OneMap could not be reached. Check the internet connection. ${kept}`;
}

function routingFailure(err: unknown, isProduction: boolean): never {
  if (err instanceof ExternalServiceError) {
    console.warn(`[routing] ${err.kind}: ${err.message}`);
    throw new HttpError(
      503,
      'ROUTING_UNAVAILABLE',
      routingFailureMessage(err, isProduction),
      undefined,
      err.kind !== 'UNAUTHORISED',
    );
  }
  throw err;
}

export interface EstimateOptions {
  outboundRoute?: RouteResult;
  departureTime?: Date;
}

/**
 * UC-06 View Trip Estimate. Gets a route per leg, prices fuel, ERP and parking (UC-07 to UC-09),
 * combines the ranges and stores everything in one transaction guarded by Trip.revision.
 * A saved trip is never re-estimated (409 TRIP_SAVED).
 * @param options an alternative route or departure time chosen in UC-11 or UC-12
 */
export async function estimateTrip(
  deps: AppDeps,
  tripId: string,
  userId: string,
  options: EstimateOptions = {},
): Promise<TripDto> {
  const elapsed = startTimer();
  const storedTrip = await deps.prisma.trip.findFirst({
    where: { id: tripId, driverId: userId },
    include: { vehicleProfile: true },
  });
  if (!storedTrip) throw notFound('Trip');
  const trip = { ...storedTrip, departureTime: options.departureTime ?? storedTrip.departureTime };
  if (trip.status === 'SAVED' || trip.status === 'COMPLETED') {
    throw new HttpError(
      409,
      'TRIP_SAVED',
      'A saved estimate is a snapshot and is never recomputed. Plan a new trip instead.',
    );
  }
  const origin = { lat: trip.originLat, lng: trip.originLng };
  const destination = { lat: trip.destinationLat, lng: trip.destinationLng };

  let outbound: RouteResult;
  let inbound: RouteResult | null = null;
  try {
    outbound =
      options.outboundRoute ??
      (await deps.routing.route({ origin, destination, departureTime: trip.departureTime }));
    if (trip.isReturnTrip && trip.returnDepartureTime) {
      inbound = await deps.routing.route({
        origin: destination,
        destination: origin,
        departureTime: trip.returnDepartureTime,
      });
    }
  } catch (err) {
    routingFailure(err, deps.config.NODE_ENV === 'production');
  }

  const ref: ReferenceData = await loadReferenceData(deps.prisma, trip.vehicleProfile.fuelType);
  const parkingLookup = await lookupParking(deps, trip, trip.vehicleProfile.vehicleClass);
  const legs = buildLegs(trip, outbound, inbound, parkingLookup);
  const { components, combined } = priceLegs(
    ref,
    vehicleLike(trip.vehicleProfile),
    legs,
    policyFrom(deps.config),
  );
  const assumptions = trip.parkingDurationAssumed
    ? [`Parking duration defaulted to ${trip.parkingDurationMin} minutes because none was entered`]
    : [];

  const referencedRateIds = [
    ...new Set(components.map((c) => c.parkingRateId).filter((id): id is string => id !== null)),
  ];
  const parkingRateIds = new Set(
    referencedRateIds.length
      ? (
          await deps.prisma.parkingRate.findMany({
            where: { id: { in: referencedRateIds } },
            select: { id: true },
          })
        ).map((r) => r.id)
      : [],
  );

  await deps.prisma.$transaction(async (tx) => {
    const claimed = await tx.trip.updateMany({
      where: {
        id: tripId,
        driverId: userId,
        revision: trip.revision,
        status: { in: ['PLANNED', 'ESTIMATED'] },
      },
      data: {
        revision: { increment: 1 },
        status: 'ESTIMATED',
        departureTime: trip.departureTime,
        vehicleSnapshot: JSON.stringify(toVehicleDto(trip.vehicleProfile)),
      },
    });
    if (!claimed.count)
      throw new HttpError(
        409,
        'TRIP_CHANGED',
        'This trip changed while the estimate was being calculated. Reload it before trying again.',
      );
    await tx.fuelTopUpPlan.deleteMany({ where: { tripId } });
    await tx.route.deleteMany({ where: { tripId } });
    await tx.costEstimate.deleteMany({ where: { tripId } });
    const routeRows = [
      { isReturnLeg: false, r: outbound },
      ...(inbound ? [{ isReturnLeg: true, r: inbound }] : []),
    ];
    for (const row of routeRows) {
      await tx.route.create({
        data: {
          tripId,
          isReturnLeg: row.isReturnLeg,
          distanceKm: row.r.distanceKm,
          drivingTimeSec: row.r.drivingTimeSec,
          geometry: row.r.encodedGeometry,
          provider: row.r.provider,
          roads: row.r.roads?.length ? JSON.stringify(row.r.roads) : null,
        },
      });
    }
    await tx.costEstimate.create({
      data: {
        tripId,
        total: toDb(combined.total),
        totalIsLowerBound: combined.isLowerBound,
        lowerBound: toDb(combined.lower),
        upperBound: toDbOrNull(combined.upper),
        assumptions: JSON.stringify(assumptions),
        pricingPolicy: JSON.stringify(policyFrom(deps.config)),
        durationMs: elapsed(),
        components: {
          create: components.map((c) => ({
            type: c.type,
            isReturnLeg: c.isReturnLeg,
            amount: toDbOrNull(c.amount),
            lowerBound: toDbOrNull(c.lower),
            upperBound: toDbOrNull(c.upper),
            isAvailable: c.isAvailable,
            unavailableReason: c.unavailableReason,
            sourceName: c.sourceName,
            sourceRecordedAt: c.sourceRecordedAt,
            isStale: c.isStale,
            detail: JSON.stringify(c.detail),
            fuelPriceId: c.fuelPriceId,
            parkingRateId:
              c.parkingRateId && parkingRateIds.has(c.parkingRateId) ? c.parkingRateId : null,
            crossings: {
              create: c.crossings.map((x) => ({
                chargePointId: x.chargePointId,
                chargePointName: x.chargePointName,
                ratePeriod: x.ratePeriod,
                erpRateId: x.erpRateId,
                adjacentErpRateId: x.adjacentErpRateId,
                estimatedCrossingTime: x.estimatedCrossingTime,
                dayType: x.dayType,
                charge: toDbOrNull(x.charge),
                lowerBound: toDbOrNull(x.lower),
                upperBound: toDbOrNull(x.upper),
                nearPeriodBoundary: x.nearPeriodBoundary,
                isExcluded: x.isExcluded,
                exclusionReason: x.exclusionReason,
              })),
            },
          })),
        },
      },
    });
  });

  const durationMs = elapsed();
  timing(durationMs, deps.config.ESTIMATE_BUDGET_MS, `UC-06 estimate for trip ${tripId}`);

  return getTrip(deps, tripId, userId);
}

/**
 * UC-05 Plan Trip. Validates and re-resolves the locations, stores the Trip and always performs
 * UC-06 (FR-SET-09). A routing failure leaves the trip PLANNED with a retryable error instead of a total.
 * @returns the trip and, if routing failed, the estimate error
 */
export async function planTrip(
  deps: AppDeps,
  userId: string,
  input: TripInput,
): Promise<PlanTripResult> {
  const vehicle = await deps.prisma.vehicleProfile.findFirst({
    where: { id: input.vehicleProfileId, driverId: userId },
  });
  if (!vehicle) {
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
      vehicleProfileId: 'Choose one of your vehicles',
    });
  }
  if (vehicle.isArchived) {
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
      vehicleProfileId: 'This vehicle is archived; choose another',
    });
  }
  try {
    const places = [input.origin, input.destination];
    const matches = await Promise.all(places.map((place) => deps.routing.search(place.name)));
    const fields: Record<string, string> = {};
    places.forEach((place, index) => {
      if (
        !matches[index].some(
          (match) =>
            match.name === place.name &&
            Math.abs(match.lat - place.lat) < 0.000001 &&
            Math.abs(match.lng - place.lng) < 0.000001,
        )
      ) {
        fields[index === 0 ? 'origin.name' : 'destination.name'] =
          'Choose a location from the current search suggestions';
      }
    });
    if (Object.keys(fields).length)
      throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', fields);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw new HttpError(
        503,
        'SEARCH_UNAVAILABLE',
        'The selected locations could not be verified. Your entries are unchanged; try again shortly.',
        undefined,
        true,
      );
    }
    throw error;
  }
  const parkingAssumed = input.parkingDurationMin === undefined;
  const trip = await deps.prisma.trip.create({
    data: {
      driverId: userId,
      vehicleProfileId: vehicle.id,
      originName: input.origin.name,
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      destinationName: input.destination.name,
      destinationLat: input.destination.lat,
      destinationLng: input.destination.lng,
      departureTime: new Date(input.departureTime),
      isReturnTrip: input.isReturnTrip,
      returnDepartureTime:
        input.isReturnTrip && input.returnDepartureTime
          ? new Date(input.returnDepartureTime)
          : null,
      parkingDurationMin: input.parkingDurationMin ?? deps.config.DEFAULT_PARKING_DURATION_MIN,
      parkingDurationAssumed: parkingAssumed,
      status: 'PLANNED',
    },
  });
  try {
    return { trip: await estimateTrip(deps, trip.id, userId), estimateError: null };
  } catch (err) {
    if (err instanceof HttpError && err.code === 'ROUTING_UNAVAILABLE') {
      return {
        trip: await getTrip(deps, trip.id, userId),
        estimateError: { message: err.message, retryable: true },
      };
    }
    throw err;
  }
}
