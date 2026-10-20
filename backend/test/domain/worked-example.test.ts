import { describe, expect, it } from 'vitest';
import { tripFuelCost, tripFuelVolume } from '../../src/domain/fuel';
import { toLitres } from '../../src/domain/fuelLevel';
import { D, formatMoney, formatPercent } from '../../src/domain/money';
import { compareRoutes } from '../../src/domain/ranking';
import { planTopUp } from '../../src/domain/topUp';
import { variance } from '../../src/domain/variance';

const efficiency = D('7.5');
const price = D('2.80');

describe('SRS 7.5 worked route-comparison example (normal case)', () => {
  it('FR-EST-02 FR-EST-03 NFR-ACCY-02 Route A: 20 km uses 1.50 L costing SGD 4.20, total SGD 7.20 with SGD 3.00 road charge', () => {
    const volume = tripFuelVolume(D(20), efficiency);
    expect(volume.toString()).toBe('1.5');
    const cost = tripFuelCost(volume, price);
    expect(formatMoney(cost)).toBe('4.20');
    expect(formatMoney(cost.plus('3.00'))).toBe('7.20');
  });

  it('FR-EST-02 FR-EST-03 Route B: 24 km uses 1.80 L costing SGD 5.04 with no road charge', () => {
    const volume = tripFuelVolume(D(24), efficiency);
    expect(volume.toString()).toBe('1.8');
    expect(formatMoney(tripFuelCost(volume, price))).toBe('5.04');
  });

  it('FR-OPT-03 Route B is marked as the lower-cost option by SGD 2.16 and nothing is selected automatically', () => {
    const result = compareRoutes([
      { id: 'A', total: D('7.20'), lower: D('7.20'), upper: D('7.20') },
      { id: 'B', total: D('5.04'), lower: D('5.04'), upper: D('5.04') },
    ]);
    expect(result.cheapestId).toBe('B');
    expect(D('7.20').minus('5.04').toString()).toBe('2.16');
    expect(result).not.toHaveProperty('selectedId');
  });

  it('FR-REN-04 FR-REN-05 NFR-ACCY-02 renter extension: 50 L tank at 50% with a 50% return requirement needs 1.80 L costing SGD 5.04', () => {
    const tank = D(50);
    const pickUp = toLitres(D(50), 'PERCENT', tank);
    expect(pickUp.toString()).toBe('25');
    const plan = planTopUp({
      pickUpL: pickUp,
      requiredReturnL: pickUp,
      tripFuelL: D('1.8'),
      pricePerLitre: price,
    });
    expect(plan.projectedReturnL.toString()).toBe('23.2');
    expect(plan.topUpL.toString()).toBe('1.8');
    expect(formatMoney(plan.cost)).toBe('5.04');
    expect(plan.outcome).toBe('TOP_UP');
  });

  it('FR-REC-05 historical extension: an actual SGD 5.60 against the SGD 5.04 estimate is +0.56 or 11.11%', () => {
    const result = variance(D('5.04'), D('5.60'));
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(formatMoney(result.absolute)).toBe('0.56');
      expect(formatPercent(result.percent as NonNullable<typeof result.percent>)).toBe('11.11');
    }
  });
});
