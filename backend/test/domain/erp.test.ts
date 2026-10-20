import { describe, expect, it } from 'vitest';
import type { DetectedCrossing } from '../../src/domain/crossings';
import { periodsOverlap, roadUsage, selectRate, type RateLike } from '../../src/domain/erp';
import { D } from '../../src/domain/money';
import { sgLocal } from '../../src/domain/time';

const CP = 'cp-cte-braddell';
const rate = (over: Partial<RateLike>): RateLike => ({
  id: 'r',
  chargePointId: CP,
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  dayType: 'WEEKDAY',
  startTime: '07:30',
  endTime: '08:00',
  rate: D(1),
  effectiveDate: sgLocal(2026, 8, 3),
  isWithdrawn: false,
  recordedAt: sgLocal(2026, 8, 1),
  ...over,
});

const RATES: RateLike[] = [
  rate({ id: 'a', startTime: '07:30', endTime: '08:00', rate: D(1) }),
  rate({ id: 'b', startTime: '08:00', endTime: '09:00', rate: D(2) }),
  rate({ id: 'c', startTime: '09:00', endTime: '09:30', rate: D(1) }),
];

const wed = (h: number, m: number): Date => sgLocal(2026, 9, 16, h, m);
const car = {
  chargePointId: CP,
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI' as const,
  dayType: 'WEEKDAY' as const,
};
const crossingAt = (t: Date): DetectedCrossing => ({
  chargePointId: CP,
  distanceAlongKm: 1,
  crossingTime: t,
});
const NO_HOLIDAYS = new Set<string>();

describe('ERP rate selection and road usage', () => {
  it('FR-EST-04 selects the rate whose period contains the estimated crossing time', () => {
    const s = selectRate(RATES, car, wed(8, 30), 5);
    expect(s.rate?.id).toBe('b');
    expect(s.nearBoundary).toBe(false);
    expect(s.missing).toBe(false);
  });

  it('FR-EST-06 rate-boundary: a crossing within 5 minutes of 08:00 keeps both adjacent rates as bounds', () => {
    const s = selectRate(RATES, car, wed(7, 57), 5);
    expect(s.rate?.id).toBe('a');
    expect(s.nearBoundary).toBe(true);
    expect(s.adjacent?.id).toBe('b');
    const usage = roadUsage(
      [crossingAt(wed(7, 57))],
      RATES,
      'PASSENGER_CAR_LGV_TAXI',
      NO_HOLIDAYS,
      5,
    );
    expect(usage.subtotal.toString()).toBe('1');
    expect(usage.lower.toString()).toBe('1');
    expect(usage.upper.toString()).toBe('2');
    expect(usage.items[0].nearBoundary).toBe(true);
  });

  it('FR-EST-06 a crossing at the end of operating hours widens towards zero', () => {
    const s = selectRate(RATES, car, wed(9, 27), 5);
    expect(s.rate?.id).toBe('c');
    expect(s.nearBoundary).toBe(true);
    expect(s.adjacent).toBeNull();
    expect(s.adjacentRate?.toString()).toBe('0');
  });

  it('FR-EST-05 zero-charge: outside operating hours the charge is zero, not unavailable', () => {
    const usage = roadUsage(
      [crossingAt(wed(6, 0))],
      RATES,
      'PASSENGER_CAR_LGV_TAXI',
      NO_HOLIDAYS,
      5,
    );
    expect(usage.items[0].charge?.toString()).toBe('0');
    expect(usage.items[0].excluded).toBe(false);
    expect(usage.excluded).toHaveLength(0);
  });

  it('FR-EST-05 zero-charge: a route crossing no charge point returns zero', () => {
    const usage = roadUsage([], RATES, 'PASSENGER_CAR_LGV_TAXI', NO_HOLIDAYS, 5);
    expect(usage.subtotal.isZero()).toBe(true);
    expect(usage.items).toHaveLength(0);
  });

  it('FR-EST-05 missing-rate: a vehicle class without a rate inside operating hours is named and excluded', () => {
    const usage = roadUsage(
      [crossingAt(wed(8, 30))],
      RATES,
      'MOTORCYCLE',
      NO_HOLIDAYS,
      5,
      () => 'CTE Braddell',
    );
    expect(usage.excluded).toHaveLength(1);
    expect(usage.excluded[0].reason).toContain('CTE Braddell');
    expect(usage.excluded[0].reason).toContain('motorcycle');
    expect(usage.subtotal.isZero()).toBe(true);
  });

  it('FR-EST-04 Sunday and public-holiday crossings are not charged', () => {
    const sunday = sgLocal(2026, 9, 20, 8, 30);
    expect(
      roadUsage(
        [crossingAt(sunday)],
        RATES,
        'PASSENGER_CAR_LGV_TAXI',
        NO_HOLIDAYS,
        5,
      ).subtotal.isZero(),
    ).toBe(true);
    const nationalDayObserved = sgLocal(2026, 8, 10, 8, 30);
    const holidays = new Set(['2026-08-10']);
    const usage = roadUsage(
      [crossingAt(nationalDayObserved)],
      RATES,
      'PASSENGER_CAR_LGV_TAXI',
      holidays,
      5,
    );
    expect(usage.items[0].dayType).toBe('SUNDAY_PUBLIC_HOLIDAY');
    expect(usage.subtotal.isZero()).toBe(true);
  });

  it('FR-ADM-06 a future revision is stored alongside and applies only from its effective date', () => {
    const future = rate({
      id: 'f',
      startTime: '08:00',
      endTime: '09:00',
      rate: D(5),
      effectiveDate: sgLocal(2026, 10, 1),
    });
    const all = [...RATES, future];
    expect(selectRate(all, car, wed(8, 30), 5).rate?.id).toBe('b');
    expect(selectRate(all, car, sgLocal(2026, 10, 7, 8, 30), 5).rate?.id).toBe('f');
  });

  it('FR-ADM-03 a withdrawn rate is retained but ignored by the calculation', () => {
    const motorcycle = rate({
      id: 'm',
      vehicleClass: 'MOTORCYCLE',
      startTime: '08:00',
      endTime: '09:00',
      rate: D('1'),
    });
    const all = [...RATES.map((r) => (r.id === 'b' ? { ...r, isWithdrawn: true } : r)), motorcycle];
    const s = selectRate(all, car, wed(8, 30), 5);
    expect(s.rate).toBeNull();
    expect(s.missing).toBe(true);
    expect(selectRate([...RATES, motorcycle], car, wed(8, 30), 5).rate?.id).toBe('b');
  });

  it('FR-ADM-05 overlapping-rate: overlapping periods are detected and adjacent periods are not', () => {
    expect(
      periodsOverlap(
        { startTime: '07:30', endTime: '08:00' },
        { startTime: '07:45', endTime: '08:15' },
      ),
    ).toBe(true);
    expect(
      periodsOverlap(
        { startTime: '07:30', endTime: '08:00' },
        { startTime: '08:00', endTime: '09:00' },
      ),
    ).toBe(false);
    expect(
      periodsOverlap(
        { startTime: '08:00', endTime: '09:00' },
        { startTime: '08:15', endTime: '08:30' },
      ),
    ).toBe(true);
  });

  it('FR-ADM-05 a zero rate is valid and prices as zero without exclusion', () => {
    const zero = [rate({ id: 'z', startTime: '10:00', endTime: '11:00', rate: D(0) })];
    const usage = roadUsage(
      [crossingAt(wed(10, 30))],
      zero,
      'PASSENGER_CAR_LGV_TAXI',
      NO_HOLIDAYS,
      5,
    );
    expect(usage.excluded).toHaveLength(0);
    expect(usage.items[0].rateId).toBe('z');
    expect(usage.subtotal.isZero()).toBe(true);
  });

  it('FR-EST-13 NFR-ACCY-03 pricing the same crossings twice gives identical results', () => {
    const crossings = [crossingAt(wed(7, 57)), crossingAt(wed(8, 30))];
    const first = roadUsage(crossings, RATES, 'PASSENGER_CAR_LGV_TAXI', NO_HOLIDAYS, 5);
    const second = roadUsage(crossings, RATES, 'PASSENGER_CAR_LGV_TAXI', NO_HOLIDAYS, 5);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
