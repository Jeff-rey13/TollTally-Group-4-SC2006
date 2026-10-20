import type { ChargePoint, FuelPrice, PrismaClient } from '@prisma/client';
import type { ComponentType, DayType, FuelType, VehicleClass } from '@tolltally/shared';
import { FUEL_TYPE_LABELS } from '@tolltally/shared';
import type { ParkingLookup } from '../../adapters/parking';
import type { Config } from '../../config';
import { detectCrossings } from '../../domain/crossings';
import {
  combine,
  symmetricRange,
  type CombinedEstimate,
  type ComponentResult,
} from '../../domain/estimate';
import { roadUsage, type RateLike } from '../../domain/erp';
import { tripFuelCost, tripFuelVolume } from '../../domain/fuel';
import { Decimal, ZERO, formatExact } from '../../domain/money';
import { parkingCost } from '../../domain/parking';
import { daysBetween } from '../../domain/time';
import type { LatLng, RoadSpan } from '../../domain/types';
import { toDecimal } from '../../lib/decimal';

export interface ReferenceData {
  fuelPrice: FuelPrice | null;
  chargePoints: ChargePoint[];
  rates: RateLike[];
  holidays: Set<string>;
  now: Date;
}

export interface VehicleLike {
  consumptionRate: Decimal;
  fuelType: FuelType;
  vehicleClass: VehicleClass;
}

export interface RouteLike {
  distanceKm: Decimal;
  drivingTimeSec: number;
  geometry: LatLng[];
  roads?: RoadSpan[];
}

export interface LegSpec {
  isReturnLeg: boolean;
  departureTime: Date;
  route: RouteLike;
  parking: { durationMin: number; lookup: ParkingLookup | null } | null;
}

export interface PricedCrossing {
  chargePointId: string;
  chargePointName: string;
  estimatedCrossingTime: Date;
  dayType: DayType;
  erpRateId: string | null;
  adjacentErpRateId: string | null;
  ratePeriod: string | null;
  charge: Decimal | null;
  lower: Decimal | null;
  upper: Decimal | null;
  nearPeriodBoundary: boolean;
  isExcluded: boolean;
  exclusionReason: string | null;
}

export interface PricedComponent extends ComponentResult {
  sourceName: string | null;
  sourceRecordedAt: Date | null;
  isStale: boolean;
  detail: Record<string, string | number | null>;
  fuelPriceId: string | null;
  parkingRateId: string | null;
  crossings: PricedCrossing[];
}

export interface PricingPolicy {
  fuelRangePercent: number;
  erpToleranceMin: number;
  estimateBudgetMs: number;
  freshnessFuelDays: number;
  freshnessErpDays: number;
  freshnessParkingDays: number;
  /** Maximum distance in metres between a route and a gantry for a crossing (optional in old snapshots). */
  crossingDistanceM?: number;
  /** Maximum angle in degrees between route direction and the gantry's charged direction. */
  crossingHeadingDeg?: number;
  /** Wider distance allowed when the route is known to be on the gantry's road. */
  sameRoadDistanceM?: number;
}

/**
 * Extracts the calculation policy (tolerance, fuel range, freshness thresholds, budget) from configuration.
 */
export function policyFrom(config: Config): PricingPolicy {
  return {
    fuelRangePercent: config.FUEL_RANGE_PERCENT,
    erpToleranceMin: config.ERP_BOUNDARY_TOLERANCE_MIN,
    estimateBudgetMs: config.ESTIMATE_BUDGET_MS,
    freshnessFuelDays: config.FRESHNESS_FUEL_DAYS,
    freshnessErpDays: config.FRESHNESS_ERP_DAYS,
    freshnessParkingDays: config.FRESHNESS_PARKING_DAYS,
    crossingDistanceM: config.ERP_CROSSING_DISTANCE_M,
    crossingHeadingDeg: config.ERP_CROSSING_HEADING_DEG,
    sameRoadDistanceM: config.ERP_SAME_ROAD_DISTANCE_M,
  };
}

/**
 * Loads the current fuel price, charge points, ERP rates and public holidays once per pricing run.
 */
export async function loadReferenceData(
  prisma: PrismaClient,
  fuelType: FuelType,
): Promise<ReferenceData> {
  const [fuelPrice, chargePoints, rates, holidays] = await Promise.all([
    prisma.fuelPrice.findFirst({
      where: { fuelType, isWithdrawn: false },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.chargePoint.findMany({ where: { isActive: true } }),
    prisma.erpRate.findMany({ where: { isWithdrawn: false } }),
    prisma.publicHoliday.findMany(),
  ]);
  return {
    fuelPrice,
    chargePoints,
    rates: rates.map((r) => ({ ...r, rate: toDecimal(r.rate) })),
    holidays: new Set(holidays.map((h) => h.date)),
    now: new Date(),
  };
}

function base(type: ComponentType, isReturnLeg: boolean) {
  return {
    type,
    isReturnLeg,
    exclusions: [] as string[],
    sourceName: null as string | null,
    sourceRecordedAt: null as Date | null,
    isStale: false,
    detail: {} as Record<string, string | number | null>,
    fuelPriceId: null as string | null,
    parkingRateId: null as string | null,
    crossings: [] as PricedCrossing[],
  };
}

/**
 * Prices one leg into fuel, road-usage and parking components with ranges and sources (UC-07, UC-08, UC-09).
 */
export function priceLeg(
  ref: ReferenceData,
  vehicle: VehicleLike,
  leg: LegSpec,
  policy: PricingPolicy,
): PricedComponent[] {
  const out: PricedComponent[] = [];
  const fuelLabel = FUEL_TYPE_LABELS[vehicle.fuelType];

  const volume = tripFuelVolume(leg.route.distanceKm, vehicle.consumptionRate);
  const fuelDetail = {
    distanceKm: formatExact(leg.route.distanceKm),
    consumptionRate: formatExact(vehicle.consumptionRate),
    volumeL: formatExact(volume),
  };
  if (!ref.fuelPrice) {
    out.push({
      ...base('FUEL', leg.isReturnLeg),
      amount: null,
      lower: null,
      upper: null,
      isAvailable: false,
      unavailableReason: `No current ${fuelLabel} price is recorded; an administrator must add one`,
      detail: fuelDetail,
    });
  } else {
    const price = toDecimal(ref.fuelPrice.price);
    const cost = tripFuelCost(volume, price);
    const range = symmetricRange(cost, policy.fuelRangePercent);
    out.push({
      ...base('FUEL', leg.isReturnLeg),
      amount: cost,
      lower: range.lower,
      upper: range.upper,
      isAvailable: true,
      unavailableReason: null,
      sourceName: `${ref.fuelPrice.brand} ${fuelLabel} price`,
      sourceRecordedAt: ref.fuelPrice.recordedAt,
      isStale: daysBetween(ref.fuelPrice.recordedAt, ref.now) > policy.freshnessFuelDays,
      detail: {
        ...fuelDetail,
        pricePerLitre: formatExact(price),
        brand: ref.fuelPrice.brand,
        fuelType: fuelLabel,
      },
      fuelPriceId: ref.fuelPrice.id,
    });
  }

  const crossings = detectCrossings(
    leg.route.geometry,
    ref.chargePoints,
    leg.route.drivingTimeSec,
    leg.departureTime,
    {
      maxDistanceM: policy.crossingDistanceM,
      maxHeadingDiffDeg: policy.crossingHeadingDeg,
      sameRoadDistanceM: policy.sameRoadDistanceM,
      roads: leg.route.roads,
    },
  );
  const nameOf = (id: string): string => ref.chargePoints.find((c) => c.id === id)?.name ?? id;
  const usage = roadUsage(
    crossings,
    ref.rates,
    vehicle.vehicleClass,
    ref.holidays,
    policy.erpToleranceMin,
    nameOf,
  );
  out.push({
    ...base('ROAD_USAGE', leg.isReturnLeg),
    amount: usage.subtotal,
    lower: usage.lower,
    upper: usage.upper,
    isAvailable: true,
    unavailableReason: null,
    exclusions: usage.excluded.map((i) => i.reason ?? 'Excluded'),
    sourceName: crossings.length
      ? 'Administrator ERP rate table'
      : 'Route crosses no ERP charge point',
    sourceRecordedAt: usage.latestRecordedAt,
    isStale: usage.latestRecordedAt
      ? daysBetween(usage.latestRecordedAt, ref.now) > policy.freshnessErpDays
      : false,
    detail: {
      crossingCount: crossings.length,
      chargedCount: usage.items.filter((i) => i.charge !== null && i.charge.gt(0)).length,
      excludedCount: usage.excluded.length,
    },
    crossings: usage.items.map((i) => ({
      chargePointId: i.chargePointId,
      chargePointName: nameOf(i.chargePointId),
      estimatedCrossingTime: i.crossingTime,
      dayType: i.dayType,
      erpRateId: i.rateId,
      adjacentErpRateId: i.adjacentRateId,
      ratePeriod: i.ratePeriod,
      charge: i.charge,
      lower: i.lower,
      upper: i.upper,
      nearPeriodBoundary: i.nearBoundary,
      isExcluded: i.excluded,
      exclusionReason: i.reason,
    })),
  });

  if (leg.parking) {
    const { durationMin, lookup } = leg.parking;
    if (durationMin <= 0) {
      out.push({
        ...base('PARKING', leg.isReturnLeg),
        amount: ZERO,
        lower: ZERO,
        upper: ZERO,
        isAvailable: true,
        unavailableReason: null,
        sourceName: 'No parking planned',
        detail: { durationMin: 0 },
      });
    } else if (!lookup || !lookup.ok) {
      out.push({
        ...base('PARKING', leg.isReturnLeg),
        amount: null,
        lower: null,
        upper: null,
        isAvailable: false,
        unavailableReason: lookup ? lookup.reason : 'The parking rate was not looked up',
        detail: { durationMin },
      });
    } else {
      const rate = lookup.rate;
      const ratePerPeriod = toDecimal(rate.ratePerPeriod);
      const { periods, cost } = parkingCost({
        durationMin,
        ratePerPeriod,
        chargingPeriodMin: rate.chargingPeriodMin,
        roundingRule: rate.roundingRule,
      });
      out.push({
        ...base('PARKING', leg.isReturnLeg),
        amount: cost,
        lower: cost,
        upper: cost,
        isAvailable: true,
        unavailableReason: null,
        sourceName: `${rate.carparkName} (${rate.source})`,
        sourceRecordedAt: rate.recordedAt,
        isStale: daysBetween(rate.recordedAt, ref.now) > policy.freshnessParkingDays,
        detail: {
          carparkName: rate.carparkName,
          distanceFromDestinationKm: rate.distanceKm.toFixed(2),
          ratePerPeriod: formatExact(ratePerPeriod),
          chargingPeriodMin: rate.chargingPeriodMin,
          periods,
          roundingRule: rate.roundingRule,
          durationMin,
        },
        parkingRateId: rate.id,
      });
    }
  }

  return out;
}

/**
 * Prices every leg and combines the components into the trip total, range and lower-bound flag (FR-EST-09 to FR-EST-11).
 */
export function priceLegs(
  ref: ReferenceData,
  vehicle: VehicleLike,
  legs: LegSpec[],
  policy: PricingPolicy,
): { components: PricedComponent[]; combined: CombinedEstimate } {
  const components = legs.flatMap((leg) => priceLeg(ref, vehicle, leg, policy));
  return { components, combined: combine(components) };
}
