import type { Prisma } from '@prisma/client';
import type {
  ComponentDto,
  ComponentType,
  EstimateDto,
  FuelLevelUnit,
  LegDto,
  LogComponentDto,
  TopUpPlanDto,
  TripDto,
  TripLogDto,
  VehicleDto,
} from '@tolltally/shared';
import { FUEL_TYPE_LABELS } from '@tolltally/shared';
import { fromLitres } from '../../domain/fuelLevel';
import {
  Decimal,
  formatLitres,
  formatMoney,
  formatMoneyOrNull,
  formatPercent,
  sum,
} from '../../domain/money';
import { variance } from '../../domain/variance';
import { toDecimal, toDecimalOrNull } from '../../lib/decimal';
import { decodePolyline } from '../../lib/polyline';
import { toVehicleDto } from '../vehicles/service';
import type { PricingPolicy } from './pricing';

export const tripInclude = {
  vehicleProfile: true,
  routes: true,
  estimate: {
    include: {
      components: { include: { crossings: { include: { chargePoint: true, erpRate: true } } } },
    },
  },
  log: true,
  topUpPlan: { include: { fuelPrice: true } },
} satisfies Prisma.TripInclude;

export type TripWithAll = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
type ComponentRow = TripWithAll['estimate'] extends infer E
  ? E extends { components: (infer C)[] }
    ? C
    : never
  : never;

const TYPE_ORDER: Record<ComponentType, number> = { FUEL: 0, ROAD_USAGE: 1, PARKING: 2 };

function parseDetail(raw: string | null): Record<string, string | number | null> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string | number | null>;
  } catch {
    return {};
  }
}

function formatKm(value: { toString(): string }): string {
  return toDecimal(value).toDecimalPlaces(2).toFixed(2);
}

export function serializeComponent(c: ComponentRow): ComponentDto {
  const crossings = [...c.crossings].sort(
    (a, b) => a.estimatedCrossingTime.getTime() - b.estimatedCrossingTime.getTime(),
  );
  return {
    type: c.type,
    isReturnLeg: c.isReturnLeg,
    amount: formatMoneyOrNull(toDecimalOrNull(c.amount)),
    lowerBound: formatMoneyOrNull(toDecimalOrNull(c.lowerBound)),
    upperBound: formatMoneyOrNull(toDecimalOrNull(c.upperBound)),
    isAvailable: c.isAvailable,
    unavailableReason: c.unavailableReason,
    exclusions: crossings.filter((x) => x.isExcluded).map((x) => x.exclusionReason ?? 'Excluded'),
    source: {
      recordId: c.fuelPriceId ?? c.parkingRateId,
      name: c.sourceName,
      recordedAt: c.sourceRecordedAt?.toISOString() ?? null,
      isStale: c.isStale,
    },
    detail: parseDetail(c.detail),
    crossings: crossings.map((x) => ({
      chargePointId: x.chargePointId,
      rateId: x.erpRateId,
      adjacentRateId: x.adjacentErpRateId,
      chargePointName: x.chargePointName ?? x.chargePoint.name,
      lat: x.chargePoint.lat,
      lng: x.chargePoint.lng,
      estimatedCrossingTime: x.estimatedCrossingTime.toISOString(),
      dayType: x.dayType,
      ratePeriod:
        x.chargePointName !== null
          ? x.ratePeriod
          : x.erpRate
            ? `${x.erpRate.startTime} to ${x.erpRate.endTime}`
            : null,
      charge: formatMoneyOrNull(toDecimalOrNull(x.charge)),
      lowerBound: formatMoneyOrNull(toDecimalOrNull(x.lowerBound)),
      upperBound: formatMoneyOrNull(toDecimalOrNull(x.upperBound)),
      nearPeriodBoundary: x.nearPeriodBoundary,
      isExcluded: x.isExcluded,
      exclusionReason: x.exclusionReason,
    })),
  };
}

export function rangeBasis(policy: PricingPolicy): string[] {
  return [
    `Fuel: ${policy.fuelRangePercent}% either side of the point value, for consumption-rate confidence`,
    `Road usage (ERP): a crossing within ${policy.erpToleranceMin} minutes of a period boundary counts both adjacent rates`,
    'Parking: the carpark rule gives a single value, so the bounds are equal',
    'Total: the sum of the component bounds; when a component is unavailable or excluded only a lower bound is shown',
  ];
}

/**
 * Builds the estimate DTO including the UC-10 derivation: sources, freshness flags, exclusions and range basis.
 */
export function serializeEstimate(trip: TripWithAll, policy: PricingPolicy): EstimateDto | null {
  const est = trip.estimate;
  if (!est) return null;
  if (est.pricingPolicy) policy = JSON.parse(est.pricingPolicy) as PricingPolicy;
  const legFlags = trip.isReturnTrip ? [false, true] : [false];
  const legs: LegDto[] = legFlags.map((isReturnLeg) => {
    const route = trip.routes.find((r) => r.isReturnLeg === isReturnLeg);
    const rows = est.components
      .filter((c) => c.isReturnLeg === isReturnLeg)
      .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
    const components = rows.map(serializeComponent);
    const available = rows
      .filter((c) => c.isAvailable && c.amount !== null)
      .map((c) => toDecimal(c.amount as Prisma.Decimal));
    const departure =
      isReturnLeg && trip.returnDepartureTime ? trip.returnDepartureTime : trip.departureTime;
    return {
      isReturnLeg,
      departureTime: departure.toISOString(),
      distanceKm: route ? formatKm(route.distanceKm) : '0.00',
      drivingTimeSec: route?.drivingTimeSec ?? 0,
      provider: route?.provider ?? 'unknown',
      geometry: route ? decodePolyline(route.geometry) : [],
      components,
      subtotal: formatMoney(sum(available)),
      subtotalIsLowerBound: components.some((c) => !c.isAvailable || c.exclusions.length > 0),
    };
  });
  let assumptions: string[] = [];
  try {
    assumptions = JSON.parse(est.assumptions) as string[];
  } catch {
    assumptions = [];
  }
  return {
    calculatedAt: est.calculatedAt.toISOString(),
    timing: {
      durationMs: est.durationMs,
      budgetMs: policy.estimateBudgetMs,
      withinBudget: est.durationMs <= policy.estimateBudgetMs,
    },
    total: formatMoney(toDecimal(est.total)),
    totalIsLowerBound: est.totalIsLowerBound,
    lowerBound: formatMoney(toDecimal(est.lowerBound)),
    upperBound: formatMoneyOrNull(toDecimalOrNull(est.upperBound)),
    legs,
    assumptions,
    unavailable: est.components
      .filter((c) => !c.isAvailable)
      .map((c) => ({
        type: c.type,
        isReturnLeg: c.isReturnLeg,
        reason: c.unavailableReason ?? 'Unavailable',
      })),
    exclusions: legs.flatMap((l) => l.components.flatMap((c) => c.exclusions)),
    rangeBasis: rangeBasis(policy),
  };
}

export function estimatedByType(components: ComponentRow[]): Record<ComponentType, Decimal | null> {
  const result: Record<ComponentType, Decimal | null> = {
    FUEL: null,
    ROAD_USAGE: null,
    PARKING: null,
  };
  for (const type of Object.keys(result) as ComponentType[]) {
    const rows = components.filter((c) => c.type === type);
    if (rows.length === 0) continue;
    if (
      rows.some((c) => !c.isAvailable || c.amount === null || c.crossings.some((x) => x.isExcluded))
    )
      continue;
    result[type] = sum(rows.map((c) => toDecimal(c.amount as Prisma.Decimal)));
  }
  return result;
}

/**
 * Builds the UC-15 log DTO with per-component and total variance.
 */
export function buildLogDto(trip: TripWithAll): TripLogDto | null {
  const log = trip.log;
  if (!log || !trip.estimate) return null;
  const estimated = estimatedByType(trip.estimate.components);
  const actuals: Record<ComponentType, Decimal | null> = {
    FUEL: toDecimalOrNull(log.actualFuelCost),
    ROAD_USAGE: toDecimalOrNull(log.actualRoadUsageCharge),
    PARKING: toDecimalOrNull(log.actualParkingFee),
  };
  const components: LogComponentDto[] = (['FUEL', 'ROAD_USAGE', 'PARKING'] as ComponentType[]).map(
    (type) => {
      const v = variance(estimated[type], actuals[type]);
      return {
        type,
        actual: formatMoneyOrNull(actuals[type]),
        estimated: formatMoneyOrNull(estimated[type]),
        status: v.status,
        variance:
          v.status === 'OK'
            ? {
                absolute: formatMoney(v.absolute),
                percent: v.percent ? formatPercent(v.percent) : null,
              }
            : null,
      };
    },
  );
  const varianceAbsolute = toDecimalOrNull(log.varianceAbsolute);
  const variancePercent = toDecimalOrNull(log.variancePercent);
  return {
    loggedAt: log.loggedAt.toISOString(),
    actualTotal: formatMoney(toDecimal(log.actualTotal)),
    components,
    totalVariance:
      varianceAbsolute === null
        ? null
        : {
            absolute: formatMoney(varianceAbsolute),
            percent: variancePercent ? formatPercent(variancePercent) : null,
          },
    totalVarianceBasis:
      'Actual minus estimate over the components that have both an actual value and an estimate',
  };
}

function formatInUnit(value: Decimal, unit: FuelLevelUnit): string {
  switch (unit) {
    case 'TANK_FRACTION':
      return value.toDecimalPlaces(3).toFixed(3);
    case 'PERCENT':
      return value.toDecimalPlaces(1).toFixed(1);
    default:
      return formatLitres(value);
  }
}

/**
 * Builds the UC-13 plan DTO with every level shown in both litres and the unit the Renter used (FR-REN-06).
 */
export function buildTopUpDto(trip: TripWithAll): TopUpPlanDto | null {
  const plan = trip.topUpPlan;
  if (!plan) return null;
  const source = plan.sourceSnapshot
    ? (JSON.parse(plan.sourceSnapshot) as {
        tankCapacity: string;
        price: string;
        name: string;
        recordedAt: string;
      })
    : null;
  const tank = toDecimal(source?.tankCapacity ?? trip.vehicleProfile.tankCapacity);
  const unit = plan.levelUnit;
  const both = (litres: Decimal) => ({
    litres: formatLitres(litres),
    inUnit: formatInUnit(fromLitres(litres, unit, tank), unit),
  });
  const projected = toDecimal(plan.projectedReturnVolume);
  const topUp = toDecimal(plan.topUpVolume);
  const shortfall = toDecimal(plan.shortfall);
  const outcome: TopUpPlanDto['outcome'] = projected.lt(0)
    ? 'REFUEL_EN_ROUTE'
    : topUp.isZero()
      ? 'NONE_NEEDED'
      : 'TOP_UP';
  const message =
    outcome === 'REFUEL_EN_ROUTE'
      ? `Buy ${formatLitres(topUp)} L in total to complete the trip and meet the return level. This includes at least ${formatLitres(shortfall)} L needed en route. Refuel before the tank runs empty.`
      : outcome === 'NONE_NEEDED'
        ? 'No top-up is needed: the projected return level already meets the requirement.'
        : `Buy ${formatLitres(topUp)} L before returning the vehicle to meet the required level.`;
  return {
    createdAt: plan.createdAt.toISOString(),
    unit,
    tankCapacityL: formatLitres(tank),
    pickUp: both(toDecimal(plan.pickUpVolume)),
    requiredReturn: both(toDecimal(plan.requiredReturnVolume)),
    tripFuel: both(toDecimal(plan.tripFuelVolume)),
    projectedReturn: both(projected),
    shortfall: both(shortfall),
    topUp: both(topUp),
    estimatedCost: formatMoney(toDecimal(plan.estimatedCost)),
    pricePerLitre: source?.price ?? plan.fuelPrice.price.toString(),
    fuelPriceSource: {
      name:
        source?.name ??
        `${plan.fuelPrice.brand} ${FUEL_TYPE_LABELS[plan.fuelPrice.fuelType]} price`,
      recordedAt: source?.recordedAt ?? plan.fuelPrice.recordedAt.toISOString(),
    },
    outcome,
    message,
  };
}

/**
 * Converts a stored trip into the TripDto the client shows: estimate, derivation, top-up plan and log.
 */
export function serializeTrip(trip: TripWithAll, policy: PricingPolicy): TripDto {
  return {
    id: trip.id,
    status: trip.status,
    origin: { name: trip.originName, lat: trip.originLat, lng: trip.originLng },
    destination: { name: trip.destinationName, lat: trip.destinationLat, lng: trip.destinationLng },
    departureTime: trip.departureTime.toISOString(),
    isReturnTrip: trip.isReturnTrip,
    returnDepartureTime: trip.returnDepartureTime?.toISOString() ?? null,
    parkingDurationMin: trip.parkingDurationMin,
    parkingDurationAssumed: trip.parkingDurationAssumed,
    vehicle: trip.vehicleSnapshot
      ? (JSON.parse(trip.vehicleSnapshot) as VehicleDto)
      : toVehicleDto(trip.vehicleProfile),
    savedAt: trip.savedAt?.toISOString() ?? null,
    createdAt: trip.createdAt.toISOString(),
    estimate: serializeEstimate(trip, policy),
    log: buildLogDto(trip),
    topUpPlan: buildTopUpDto(trip),
  };
}
