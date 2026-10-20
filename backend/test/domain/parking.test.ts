import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/money';
import { parkingCost, parkingPeriods } from '../../src/domain/parking';

describe('parking cost', () => {
  it('FR-EST-07 NFR-ACCY-01 90 minutes at a 30-minute period is 3 periods priced to the cent', () => {
    expect(parkingPeriods(90, 30)).toBe(3);
    expect(parkingPeriods(61, 30)).toBe(3);
    const { periods, cost } = parkingCost({
      durationMin: 61,
      ratePerPeriod: D('0.60'),
      chargingPeriodMin: 30,
    });
    expect(periods).toBe(3);
    expect(cost.toString()).toBe('1.8');
  });

  it('FR-EST-08 zero duration costs zero with no periods and no lookup needed', () => {
    const { periods, cost } = parkingCost({
      durationMin: 0,
      ratePerPeriod: D('1.20'),
      chargingPeriodMin: 30,
    });
    expect(periods).toBe(0);
    expect(cost.isZero()).toBe(true);
  });

  it('FR-EST-07 the carpark rounding rule is honoured', () => {
    expect(
      parkingCost({
        durationMin: 61,
        ratePerPeriod: D(1),
        chargingPeriodMin: 30,
        roundingRule: 'FLOOR',
      }).periods,
    ).toBe(2);
    expect(
      parkingCost({
        durationMin: 44,
        ratePerPeriod: D(1),
        chargingPeriodMin: 30,
        roundingRule: 'NEAREST',
      }).periods,
    ).toBe(1);
    expect(
      parkingCost({
        durationMin: 44,
        ratePerPeriod: D(1),
        chargingPeriodMin: 30,
        roundingRule: 'unknown',
      }).periods,
    ).toBe(2);
  });
});
