import { describe, expect, it } from 'vitest';
import { roadUsage, selectRate, type RateLike } from '../../src/domain/erp';
import { D } from '../../src/domain/money';
import { sgLocal } from '../../src/domain/time';

const key = {
  chargePointId: 'test-point',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  dayType: 'WEEKDAY',
} as const;
const rate: RateLike = {
  ...key,
  id: 'test-rate',
  startTime: '08:00',
  endTime: '09:00',
  rate: D(2),
  effectiveDate: sgLocal(2026, 1, 1),
  isWithdrawn: false,
};

describe('ERP review regressions', () => {
  it('FR-EST-05 missing weekday reference data is excluded instead of treated as free', () => {
    expect(selectRate([], key, sgLocal(2026, 9, 16, 8, 30), 5).missing).toBe(true);
  });
  it.each([
    [7, 57],
    [9, 3],
  ])('FR-EST-06 widens the zero charge just outside operating hours at %s:%s', (h, m) => {
    const usage = roadUsage(
      [
        {
          chargePointId: key.chargePointId,
          distanceAlongKm: 1,
          crossingTime: sgLocal(2026, 9, 16, h, m),
        },
      ],
      [rate],
      key.vehicleClass,
      new Set(),
      5,
    );
    expect(usage.subtotal.toString()).toBe('0');
    expect(usage.upper.toString()).toBe('2');
    expect(usage.items[0].nearBoundary).toBe(true);
  });
  it('FR-EST-06 includes the exact tolerance boundary', () => {
    expect(selectRate([rate], key, sgLocal(2026, 9, 16, 8, 5), 5).nearBoundary).toBe(true);
  });
});
