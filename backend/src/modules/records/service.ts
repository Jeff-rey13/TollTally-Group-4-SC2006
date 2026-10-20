import type {
  ComponentType,
  HistoryDto,
  HistoryItemDto,
  HistoryQuery,
  TripDto,
  TripLogInput,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { Decimal, formatMoney, formatMoneyOrNull, formatPercent, sum } from '../../domain/money';
import { aggregateSpend } from '../../domain/spend';
import { sgDayEnd, sgDayStart } from '../../domain/time';
import { variance } from '../../domain/variance';
import { toDb, toDbOrNull, toDecimal, toDecimalOrNull } from '../../lib/decimal';
import { HttpError } from '../../lib/errors';
import { estimatedByType } from '../trips/serialize';
import { getTrip, loadTrip } from '../trips/service';

const TYPES: ComponentType[] = ['FUEL', 'ROAD_USAGE', 'PARKING'];

/**
 * UC-14 Save Trip. Marks the estimated trip SAVED, guarded by the trip revision. The stored estimate
 * is a snapshot and is never recomputed (FR-REC-01, FR-REC-02).
 */
export async function saveTrip(deps: AppDeps, tripId: string, userId: string): Promise<TripDto> {
  const trip = await loadTrip(deps, tripId, userId);
  if (!trip.estimate) throw new HttpError(409, 'NO_ESTIMATE', 'Estimate the trip before saving it');

  if (trip.status === 'SAVED' || trip.status === 'COMPLETED') return getTrip(deps, tripId, userId);
  const saved = await deps.prisma.trip.updateMany({
    where: { id: tripId, driverId: userId, revision: trip.revision, status: 'ESTIMATED' },
    data: { status: 'SAVED', savedAt: new Date(), revision: { increment: 1 } },
  });
  if (!saved.count)
    throw new HttpError(
      409,
      'TRIP_CHANGED',
      'This trip has changed. Reload the estimate before saving it.',
    );
  return getTrip(deps, tripId, userId);
}

/**
 * UC-15 Log Actual Trip Costs. Stores the amounts entered, computes comparable variance and marks the
 * trip COMPLETED. Unentered components are 'not logged'; unpriced ones are 'not applicable' (FR-REC-03 to FR-REC-06).
 */
export async function logActualCosts(
  deps: AppDeps,
  tripId: string,
  userId: string,
  input: TripLogInput,
): Promise<TripDto> {
  const trip = await loadTrip(deps, tripId, userId);
  if (!trip.estimate)
    throw new HttpError(409, 'NO_ESTIMATE', 'The trip has no estimate to compare against');
  if (trip.status !== 'SAVED' && trip.status !== 'COMPLETED') {
    throw new HttpError(409, 'NOT_SAVED', 'Save the trip before logging its actual costs');
  }
  const estimated = estimatedByType(trip.estimate.components);
  const dec = (v: number | undefined): Decimal | null =>
    v === undefined ? null : new Decimal(String(v));
  const actual: Record<ComponentType, Decimal | null> = {
    FUEL: dec(input.actualFuelCost),
    ROAD_USAGE: dec(input.actualRoadUsageCharge),
    PARKING: dec(input.actualParkingFee),
  };
  const entered = TYPES.filter((t) => actual[t] !== null);
  const actualTotal = sum(entered.map((t) => actual[t] as Decimal));
  const comparable = entered.filter((t) => estimated[t] !== null);
  let varianceAbsolute: Decimal | null = null;
  let variancePercent: Decimal | null = null;
  if (comparable.length) {
    const v = variance(
      sum(comparable.map((t) => estimated[t] as Decimal)),
      sum(comparable.map((t) => actual[t] as Decimal)),
    );
    if (v.status === 'OK') {
      varianceAbsolute = v.absolute;
      variancePercent = v.percent;
    }
  }
  const data = {
    actualFuelCost: toDbOrNull(actual.FUEL),
    actualRoadUsageCharge: toDbOrNull(actual.ROAD_USAGE),
    actualParkingFee: toDbOrNull(actual.PARKING),
    actualTotal: toDb(actualTotal),
    varianceAbsolute: toDbOrNull(varianceAbsolute),
    variancePercent: toDbOrNull(variancePercent),
    loggedAt: new Date(),
  };
  await deps.prisma.$transaction([
    deps.prisma.tripLog.upsert({ where: { tripId }, create: { tripId, ...data }, update: data }),
    deps.prisma.trip.update({ where: { id: tripId }, data: { status: 'COMPLETED' } }),
  ]);
  return getTrip(deps, tripId, userId);
}

/**
 * UC-16 View Trip History and Spend Report. Lists the Driver's saved trips in the date range and
 * aggregates logged actual spend only (FR-REC-07 to FR-REC-09).
 */
export async function tripHistory(
  deps: AppDeps,
  userId: string,
  query: HistoryQuery,
): Promise<HistoryDto> {
  const trips = await deps.prisma.trip.findMany({
    where: {
      driverId: userId,
      status: { in: ['SAVED', 'COMPLETED'] },
      ...(query.from || query.to
        ? {
            departureTime: {
              ...(query.from ? { gte: sgDayStart(query.from) } : {}),
              ...(query.to ? { lte: sgDayEnd(query.to) } : {}),
            },
          }
        : {}),
    },
    include: { vehicleProfile: true, estimate: true, log: true },
    orderBy: { departureTime: 'desc' },
  });

  const items: HistoryItemDto[] = trips.map((t) => {
    const percent = toDecimalOrNull(t.log?.variancePercent);
    return {
      id: t.id,
      status: t.status,
      departureTime: t.departureTime.toISOString(),
      origin: t.originName,
      destination: t.destinationName,
      vehicleName: t.vehicleSnapshot
        ? (JSON.parse(t.vehicleSnapshot) as { displayName: string }).displayName
        : t.vehicleProfile.displayName,
      estimatedTotal: t.estimate ? formatMoney(toDecimal(t.estimate.total)) : '0.00',
      totalIsLowerBound: t.estimate?.totalIsLowerBound ?? true,
      log: t.log
        ? {
            actualTotal: formatMoney(toDecimal(t.log.actualTotal)),
            varianceAbsolute: formatMoneyOrNull(toDecimalOrNull(t.log.varianceAbsolute)),
            variancePercent: percent ? formatPercent(percent) : null,
          }
        : null,
    };
  });

  const logged = trips
    .filter((t) => t.log)
    .map((t) => ({
      actualTotal: toDecimal(t.log!.actualTotal),
      varianceAbsolute: toDecimalOrNull(t.log!.varianceAbsolute),
    }));
  if (logged.length === 0) {
    return {
      trips: items,
      report: null,
      message: items.length
        ? 'Log actual costs for a saved trip to see a spend report for this period. Estimates are never counted as spend.'
        : 'No saved trips in this period. Save an estimate to start your history.',
    };
  }
  const agg = aggregateSpend(logged);
  return {
    trips: items,
    report: {
      from: query.from ?? null,
      to: query.to ?? null,
      tripCount: items.length,
      loggedCount: agg.count,
      actualSpend: formatMoney(agg.total),
      varianceTotal: formatMoneyOrNull(agg.varianceTotal),
    },
    message: null,
  };
}
