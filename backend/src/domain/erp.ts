import type { DayType, VehicleClass } from '@tolltally/shared';
import { DAY_TYPE_LABELS, VEHICLE_CLASS_LABELS } from '@tolltally/shared';
import type { DetectedCrossing } from './crossings';
import { dayTypeFor } from './dayType';
import { Decimal, ZERO, sum } from './money';
import { formatSgTime, parseHHMM, sgParts } from './time';

export interface RateLike {
  id: string;
  chargePointId: string;
  vehicleClass: VehicleClass;
  dayType: DayType;
  startTime: string;
  endTime: string;
  rate: Decimal;
  effectiveDate: Date;
  isWithdrawn: boolean;
  recordedAt?: Date;
}

export interface RateKey {
  chargePointId: string;
  vehicleClass: VehicleClass;
  dayType: DayType;
}

export interface RateSelection {
  rate: RateLike | null;
  adjacent: RateLike | null;
  adjacentRate: Decimal | null;
  nearBoundary: boolean;
  outsideOperatingHours: boolean;
  missing: boolean;
}

const byEffectiveDesc = (a: RateLike, b: RateLike): number =>
  b.effectiveDate.getTime() - a.effectiveDate.getTime();

export function effectiveRates(
  rates: RateLike[],
  chargePointId: string,
  dayType: DayType,
  at: Date,
): RateLike[] {
  return rates.filter(
    (r) =>
      !r.isWithdrawn &&
      r.chargePointId === chargePointId &&
      r.dayType === dayType &&
      r.effectiveDate.getTime() <= at.getTime(),
  );
}

/**
 * Selects the ERP rate for one crossing by charge point, vehicle class, day type and time (FR-EST-04).
 * Within the boundary tolerance it also returns the adjacent period's rate so the range can be widened
 * (FR-EST-06). A missing weekday or Saturday schedule is reported as missing, not free.
 */
export function selectRate(
  rates: RateLike[],
  key: RateKey,
  crossingTime: Date,
  toleranceMin: number,
): RateSelection {
  const none: RateSelection = {
    rate: null,
    adjacent: null,
    adjacentRate: null,
    nearBoundary: false,
    outsideOperatingHours: true,
    missing: false,
  };
  const effective = effectiveRates(rates, key.chargePointId, key.dayType, crossingTime);
  if (effective.length === 0) {
    return key.dayType === 'SUNDAY_PUBLIC_HOLIDAY'
      ? none
      : { ...none, outsideOperatingHours: false, missing: true };
  }

  const minute = sgParts(crossingTime).minutesOfDay + crossingTime.getUTCSeconds() / 60;
  const containing = effective.filter(
    (r) => parseHHMM(r.startTime) <= minute && minute < parseHHMM(r.endTime),
  );
  if (containing.length === 0) {
    const nearby = effective
      .filter(
        (r) =>
          r.vehicleClass === key.vehicleClass &&
          (Math.abs(parseHHMM(r.startTime) - minute) <= toleranceMin ||
            Math.abs(parseHHMM(r.endTime) - minute) <= toleranceMin),
      )
      .sort(byEffectiveDesc)[0];
    return nearby
      ? { ...none, adjacent: nearby, adjacentRate: nearby.rate, nearBoundary: true }
      : none;
  }

  const forClass = containing
    .filter((r) => r.vehicleClass === key.vehicleClass)
    .sort(byEffectiveDesc)[0];
  if (!forClass) return { ...none, outsideOperatingHours: false, missing: true };

  const start = parseHHMM(forClass.startTime);
  const end = parseHHMM(forClass.endTime);
  const classRates = effective.filter((r) => r.vehicleClass === key.vehicleClass);
  let adjacent: RateLike | null = null;
  let nearBoundary = false;
  if (minute - start <= toleranceMin) {
    nearBoundary = true;
    adjacent =
      classRates.filter((r) => r.endTime === forClass.startTime).sort(byEffectiveDesc)[0] ?? null;
  } else if (end - minute <= toleranceMin) {
    nearBoundary = true;
    adjacent =
      classRates.filter((r) => r.startTime === forClass.endTime).sort(byEffectiveDesc)[0] ?? null;
  }
  return {
    rate: forClass,
    adjacent,
    adjacentRate: nearBoundary ? (adjacent ? adjacent.rate : ZERO) : null,
    nearBoundary,
    outsideOperatingHours: false,
    missing: false,
  };
}

export interface RoadUsageItem {
  chargePointId: string;
  crossingTime: Date;
  dayType: DayType;
  rateId: string | null;
  adjacentRateId: string | null;
  ratePeriod: string | null;
  charge: Decimal | null;
  lower: Decimal | null;
  upper: Decimal | null;
  nearBoundary: boolean;
  excluded: boolean;
  reason: string | null;
}

export interface RoadUsageResult {
  items: RoadUsageItem[];
  subtotal: Decimal;
  lower: Decimal;
  upper: Decimal;
  excluded: RoadUsageItem[];
  latestRecordedAt: Date | null;
}

/**
 * Prices every crossing, sums the ERP subtotal and range, and names any crossing without a rate (FR-EST-05).
 */
export function roadUsage(
  crossings: DetectedCrossing[],
  rates: RateLike[],
  vehicleClass: VehicleClass,
  holidays: ReadonlySet<string>,
  toleranceMin: number,
  nameOf: (chargePointId: string) => string = (id) => id,
): RoadUsageResult {
  const items: RoadUsageItem[] = crossings.map((crossing) => {
    const dayType = dayTypeFor(crossing.crossingTime, holidays);
    const selection = selectRate(
      rates,
      { chargePointId: crossing.chargePointId, vehicleClass, dayType },
      crossing.crossingTime,
      toleranceMin,
    );
    const base = {
      chargePointId: crossing.chargePointId,
      crossingTime: crossing.crossingTime,
      dayType,
      nearBoundary: selection.nearBoundary,
      adjacentRateId: selection.adjacent?.id ?? null,
    };
    if (selection.missing) {
      return {
        ...base,
        rateId: null,
        ratePeriod: null,
        charge: null,
        lower: null,
        upper: null,
        excluded: true,
        reason: `No ERP rate for ${VEHICLE_CLASS_LABELS[vehicleClass].toLowerCase()} at ${nameOf(crossing.chargePointId)} at ${formatSgTime(crossing.crossingTime)} on a ${DAY_TYPE_LABELS[dayType].toLowerCase()}`,
      };
    }
    if (selection.outsideOperatingHours || !selection.rate) {
      return {
        ...base,
        rateId: null,
        ratePeriod: null,
        charge: ZERO,
        lower: ZERO,
        upper: selection.adjacentRate ?? ZERO,
        excluded: false,
        reason: null,
      };
    }
    const charge = selection.rate.rate;
    const alt = selection.adjacentRate ?? charge;
    return {
      ...base,
      rateId: selection.rate.id,
      ratePeriod: `${selection.rate.startTime} to ${selection.rate.endTime}`,
      charge,
      lower: Decimal.min(charge, alt),
      upper: Decimal.max(charge, alt),
      excluded: false,
      reason: null,
    };
  });

  const priced = items.filter((i) => !i.excluded);
  const recorded = priced
    .flatMap((i) => [i.rateId, i.adjacentRateId])
    .map((id) => rates.find((r) => r.id === id)?.recordedAt)
    .filter((d): d is Date => d instanceof Date);
  return {
    items,
    subtotal: sum(priced.map((i) => i.charge as Decimal)),
    lower: sum(priced.map((i) => i.lower as Decimal)),
    upper: sum(priced.map((i) => i.upper as Decimal)),
    excluded: items.filter((i) => i.excluded),
    latestRecordedAt: recorded.length
      ? new Date(Math.min(...recorded.map((d) => d.getTime())))
      : null,
  };
}

/**
 * True when two HH:MM periods overlap; used to reject overlapping ERP records (FR-ADM-05).
 */
export function periodsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return (
    parseHHMM(a.startTime) < parseHHMM(b.endTime) && parseHHMM(b.startTime) < parseHHMM(a.endTime)
  );
}
