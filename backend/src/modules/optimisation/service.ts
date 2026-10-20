import type { Session, SessionData } from 'express-session';
import type {
  CompareDto,
  ComponentType,
  OptimiseDto,
  RouteOptionDto,
  TripDto,
} from '@tolltally/shared';
import { ALTERNATIVE_ROUTE_OPTION_PREFIX, CURRENT_ROUTE_OPTION_ID } from '@tolltally/shared';
import type { RouteResult } from '../../adapters/routing';
import type { AppDeps } from '../../deps';
import { startTimer, timing } from '../../lib/budget';
import { formatMoney, formatMoneyOrNull, sum } from '../../domain/money';
import {
  compareRoutes as rankRoutes,
  recommendDeparture,
  type PricedSlot,
} from '../../domain/ranking';
import { addMinutes, formatSgTime } from '../../domain/time';
import { HttpError, notFound } from '../../lib/errors';
import { toDecimal } from '../../lib/decimal';
import { decodePolyline } from '../../lib/polyline';
import { loadReferenceData, policyFrom, priceLegs, type PricedComponent } from '../trips/pricing';
import {
  buildLegs,
  estimateTrip,
  getTrip,
  lookupParking,
  parseRoads,
  routeFromStored,
  vehicleLike,
} from '../trips/service';
import type { CachedRouteOption } from './types';

type SessionLike = Session & Partial<SessionData>;

async function loadPricedTrip(deps: AppDeps, tripId: string, userId: string) {
  const trip = await deps.prisma.trip.findFirst({
    where: { id: tripId, driverId: userId },
    include: { vehicleProfile: true, routes: true },
  });
  if (!trip) throw notFound('Trip');
  const outbound = trip.routes.find((r) => !r.isReturnLeg);
  if (!outbound) throw new HttpError(409, 'NO_ESTIMATE', 'Estimate the trip before optimising it');
  const inbound = trip.routes.find((r) => r.isReturnLeg) ?? null;
  return { trip, outbound, inbound };
}

function componentSummary(
  components: PricedComponent[],
): { type: ComponentType; amount: string | null }[] {
  return (['FUEL', 'ROAD_USAGE', 'PARKING'] as ComponentType[]).map((type) => {
    const rows = components.filter((c) => c.type === type);
    if (rows.length === 0 || rows.some((c) => !c.isAvailable || c.amount === null))
      return { type, amount: null };
    return { type, amount: formatMoney(sum(rows.map((c) => c.amount!))) };
  });
}

function isDistinct(candidate: RouteResult, reference: RouteResult): boolean {
  if (candidate.encodedGeometry === reference.encodedGeometry) return false;
  const a = Number(candidate.distanceKm);
  const b = Number(reference.distanceKm);
  return (
    Math.abs(a - b) / Math.max(b, 0.001) > 0.01 ||
    candidate.drivingTimeSec !== reference.drivingTimeSec
  );
}

/**
 * UC-11 Compare Routes. Requests distinct alternatives, prices each with the UC-06 rules and ranks them
 * without selecting one (FR-OPT-01 to FR-OPT-05). The options are cached in the session with the trip revision.
 */
export async function compareRouteOptions(
  deps: AppDeps,
  tripId: string,
  userId: string,
  session: SessionLike,
): Promise<CompareDto> {
  const elapsed = startTimer();
  const { trip, outbound, inbound } = await loadPricedTrip(deps, tripId, userId);
  const defaultRoute = routeFromStored(outbound);
  const inboundRoute = inbound ? routeFromStored(inbound) : null;
  const request = {
    origin: { lat: trip.originLat, lng: trip.originLng },
    destination: { lat: trip.destinationLat, lng: trip.destinationLng },
    departureTime: trip.departureTime,
  };
  let alternatives: RouteResult[] = [];
  let alternativesFailed = false;
  try {
    alternatives = await deps.routing.alternatives(request, deps.config.ROUTE_OPTION_COUNT);
  } catch {
    alternatives = [];
    alternativesFailed = true;
  }
  const distinct: RouteResult[] = [];
  for (const candidate of alternatives) {
    if (isDistinct(candidate, defaultRoute) && distinct.every((r) => isDistinct(candidate, r))) {
      distinct.push(candidate);
    }
    if (distinct.length === deps.config.ROUTE_OPTION_COUNT) break;
  }

  const options = [
    { id: CURRENT_ROUTE_OPTION_ID, label: 'Current route', route: defaultRoute },
    ...distinct.map((route, i) => ({
      id: `${ALTERNATIVE_ROUTE_OPTION_PREFIX}${i + 1}`,
      label: `Alternative ${i + 1}`,
      route,
    })),
  ];

  const ref = await loadReferenceData(deps.prisma, trip.vehicleProfile.fuelType);
  const parkingLookup = await lookupParking(deps, trip, trip.vehicleProfile.vehicleClass);
  const vehicle = vehicleLike(trip.vehicleProfile);
  const policy = policyFrom(deps.config);

  const priced = options.map((o) => {
    const legs = buildLegs(trip, o.route, inboundRoute, parkingLookup);
    const { components, combined } = priceLegs(ref, vehicle, legs, policy);
    return { ...o, components, combined };
  });
  const ranking = rankRoutes(
    priced.map((p) => ({
      id: p.id,
      total: p.combined.total,
      lower: p.combined.lower,
      upper: p.combined.upper,
    })),
  );

  const cached: CachedRouteOption[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    distanceKm: o.route.distanceKm,
    drivingTimeSec: o.route.drivingTimeSec,
    encodedGeometry: o.route.encodedGeometry,
    provider: o.route.provider,
    roads: o.route.roads?.length ? JSON.stringify(o.route.roads) : null,
    revision: trip.revision,
  }));
  const previous = Object.entries(session.routeOptions ?? {}).filter(([id]) => id !== tripId);
  session.routeOptions = Object.fromEntries([...previous.slice(-4), [tripId, cached]]);

  const dtoOptions: RouteOptionDto[] = priced.map((p) => {
    const incomplete = p.combined.upper === null;
    const reasons = [...p.combined.unavailable.map((u) => u.reason), ...p.combined.exclusions];
    return {
      id: p.id,
      label: p.label,
      distanceKm: toDecimal(p.route.distanceKm).toDecimalPlaces(2).toFixed(2),
      drivingTimeSec: p.route.drivingTimeSec,
      provider: p.route.provider,
      total: formatMoney(p.combined.total),
      lowerBound: formatMoney(p.combined.lower),
      upperBound: formatMoneyOrNull(p.combined.upper),
      isComplete: !incomplete,
      exclusionReason: incomplete
        ? `Excluded from the comparison: ${reasons.join('; ') || 'not fully priced'}`
        : null,
      components: componentSummary(p.components),
      isCheapest: ranking.cheapestId === p.id,
      isIndistinguishable: ranking.indistinguishableIds.includes(p.id),
    };
  });

  const complete = dtoOptions.filter((o) => o.isComplete);
  let message: string;
  if (distinct.length === 0) {
    message = alternativesFailed
      ? 'Alternative routes could not be loaded. Only the current route is shown. Try the comparison again shortly.'
      : 'The routing service returned no distinct alternative for this trip, so only the current route is shown.';
  } else if (complete.length === 0) {
    message = 'No route option could be fully priced, so none is marked as cheapest.';
  } else if (ranking.indistinguishableIds.length > 0) {
    message =
      'The lowest-cost options are indistinguishable on cost because their estimate ranges overlap. Choose by preference.';
  } else {
    message = 'The marked option has the lowest complete total. The choice of route is yours.';
  }

  return {
    options: dtoOptions,
    cheapestOptionId: ranking.cheapestId,
    indistinguishable: ranking.indistinguishableIds.length > 0,
    noAlternatives: distinct.length === 0,
    message,
    timing: timing(
      elapsed(),
      deps.config.COMPARISON_BUDGET_MS,
      `UC-11 comparison of ${options.length} options for trip ${tripId}`,
    ),
  };
}

/**
 * Applies a compared route the Driver picked ("Use this route") by re-estimating the trip on it.
 * Refuses an option from a comparison made before the trip changed.
 */
export async function chooseRouteOption(
  deps: AppDeps,
  tripId: string,
  userId: string,
  session: SessionLike,
  optionId: string,
): Promise<TripDto> {
  const cached = session.routeOptions?.[tripId]?.find((o) => o.id === optionId);
  if (!cached) {
    throw new HttpError(
      400,
      'OPTION_UNKNOWN',
      'That route option is no longer available. Compare routes again and choose from the list.',
    );
  }
  const trip = await deps.prisma.trip.findFirst({ where: { id: tripId, driverId: userId } });
  if (!trip) throw notFound('Trip');
  if (cached.revision !== trip.revision) {
    throw new HttpError(
      409,
      'OPTION_STALE',
      'This trip has changed. Compare routes again before choosing an option.',
    );
  }
  if (optionId === CURRENT_ROUTE_OPTION_ID) return getTrip(deps, tripId, userId);
  return estimateTrip(deps, tripId, userId, {
    outboundRoute: {
      distanceKm: cached.distanceKm,
      drivingTimeSec: cached.drivingTimeSec,
      geometry: decodePolyline(cached.encodedGeometry),
      encodedGeometry: cached.encodedGeometry,
      provider: cached.provider,
      roads: parseRoads(cached.roads),
    },
  });
}

/**
 * UC-12 Optimise Departure Time. Prices slots across the configured window and interval on the current route
 * and recommends the cheapest, with margin-of-error wording (FR-OPT-06 to FR-OPT-08).
 */
export async function optimiseDepartureTime(
  deps: AppDeps,
  tripId: string,
  userId: string,
): Promise<OptimiseDto> {
  const { trip, outbound, inbound } = await loadPricedTrip(deps, tripId, userId);
  const outboundRoute = routeFromStored(outbound);
  const inboundRoute = inbound ? routeFromStored(inbound) : null;
  const ref = await loadReferenceData(deps.prisma, trip.vehicleProfile.fuelType);
  const parkingLookup = await lookupParking(deps, trip, trip.vehicleProfile.vehicleClass);
  const vehicle = vehicleLike(trip.vehicleProfile);
  const policy = policyFrom(deps.config);

  const steps = Math.floor(deps.config.DEPARTURE_WINDOW_MIN / deps.config.DEPARTURE_INTERVAL_MIN);
  const now = Date.now();
  const times: Date[] = [];
  for (let k = -steps; k <= steps; k++) {
    const t = addMinutes(trip.departureTime, k * deps.config.DEPARTURE_INTERVAL_MIN);
    if (k !== 0 && t.getTime() <= now) continue;
    if (trip.returnDepartureTime && t.getTime() >= trip.returnDepartureTime.getTime()) continue;
    times.push(t);
  }

  const priced: PricedSlot[] = times.map((time) => {
    const legs = buildLegs(trip, outboundRoute, inboundRoute, parkingLookup, time);
    const { combined } = priceLegs(ref, vehicle, legs, policy);
    return { time, total: combined.total, lower: combined.lower, upper: combined.upper };
  });
  const rec = recommendDeparture(priced, trip.departureTime);

  let message: string;
  if (rec.bestTime === null) {
    message = 'No departure slot could be fully priced.';
  } else if (rec.saving === null) {
    message = `The lowest fully priced departure is ${formatSgTime(rec.bestTime)}. Your planned departure could not be fully priced, so a saving cannot be calculated.`;
  } else if (rec.allIdentical) {
    message =
      'Departure time does not affect the cost of this trip: every slot in the window prices the same.';
  } else if (rec.plannedIsCheapest) {
    message = 'Your planned departure is already the cheapest slot in the window.';
  } else if (rec.withinMargin) {
    message = `Leaving at ${formatSgTime(rec.bestTime)} would save about SGD ${formatMoney(rec.saving!)}, which is within the margin of error of the estimate.`;
  } else {
    message = `Leaving at ${formatSgTime(rec.bestTime)} saves SGD ${formatMoney(rec.saving!)} compared with your planned time.`;
  }

  return {
    slots: priced.map((s) => ({
      time: s.time.toISOString(),
      total: formatMoney(s.total),
      lowerBound: formatMoney(s.lower),
      upperBound: formatMoneyOrNull(s.upper),
      isComplete: s.upper !== null,
      isPlanned: s.time.getTime() === trip.departureTime.getTime(),
      isRecommended: rec.bestTime !== null && s.time.getTime() === rec.bestTime.getTime(),
    })),
    recommendedTime: rec.bestTime?.toISOString() ?? null,
    saving: rec.saving === null ? null : formatMoney(rec.saving),
    withinMargin: rec.withinMargin,
    plannedIsCheapest: rec.plannedIsCheapest,
    allIdentical: rec.allIdentical,
    message,
  };
}

/**
 * Re-estimates the trip at the departure slot the Driver picked ("Depart then").
 */
export async function applyDeparture(
  deps: AppDeps,
  tripId: string,
  userId: string,
  departureTime: string,
): Promise<TripDto> {
  const trip = await deps.prisma.trip.findFirst({ where: { id: tripId, driverId: userId } });
  if (!trip) throw notFound('Trip');
  if (trip.status === 'SAVED' || trip.status === 'COMPLETED') {
    throw new HttpError(
      409,
      'TRIP_SAVED',
      'A saved trip cannot be re-planned. Plan a new trip instead.',
    );
  }
  const when = new Date(departureTime);
  if (when.getTime() <= Date.now()) {
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
      departureTime: 'Departure must be in the future',
    });
  }
  if (trip.returnDepartureTime && when.getTime() >= trip.returnDepartureTime.getTime()) {
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
      departureTime: 'Departure must be before the return departure',
    });
  }
  return estimateTrip(deps, tripId, userId, { departureTime: when });
}
