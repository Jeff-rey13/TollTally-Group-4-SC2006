import { describe, expect, it } from 'vitest';
import { fromLitres, toLitres } from '../../src/domain/fuelLevel';
import { D } from '../../src/domain/money';
import { planTopUp } from '../../src/domain/topUp';

const price = D('2.78');

describe('renter fuel top-up', () => {
  it('FR-REN-02 converts litres, tank fractions and percentages and back again', () => {
    const tank = D(40);
    expect(toLitres(D('0.25'), 'TANK_FRACTION', tank).toString()).toBe('10');
    expect(toLitres(D(50), 'PERCENT', tank).toString()).toBe('20');
    expect(toLitres(D('12.5'), 'LITRES', tank).toString()).toBe('12.5');
    expect(fromLitres(D(10), 'TANK_FRACTION', tank).toString()).toBe('0.25');
    expect(fromLitres(D(20), 'PERCENT', tank).toString()).toBe('50');
  });

  it('FR-REN-07 zero-top-up: a return requirement already met needs no top-up', () => {
    const plan = planTopUp({
      pickUpL: D(40),
      requiredReturnL: D(10),
      tripFuelL: D(5),
      pricePerLitre: price,
    });
    expect(plan.outcome).toBe('NONE_NEEDED');
    expect(plan.topUpL.isZero()).toBe(true);
    expect(plan.cost.isZero()).toBe(true);
    expect(plan.projectedReturnL.toString()).toBe('35');
  });

  it('FR-REN-07 insufficient-fuel: a projected level below zero warns with the shortfall', () => {
    const plan = planTopUp({
      pickUpL: D(2),
      requiredReturnL: D(10),
      tripFuelL: D(5),
      pricePerLitre: price,
    });
    expect(plan.outcome).toBe('REFUEL_EN_ROUTE');
    expect(plan.projectedReturnL.toString()).toBe('-3');
    expect(plan.shortfallL.toString()).toBe('3');
    expect(plan.topUpL.toString()).toBe('13');
  });

  it('FR-REN-05 top-up volume is max(0, required minus projected) priced at the current fuel price', () => {
    const plan = planTopUp({
      pickUpL: D(20),
      requiredReturnL: D(25),
      tripFuelL: D('1.8'),
      pricePerLitre: price,
    });
    expect(plan.outcome).toBe('TOP_UP');
    expect(plan.topUpL.toString()).toBe('6.8');
    expect(plan.cost.toString()).toBe('18.904');
  });
});
