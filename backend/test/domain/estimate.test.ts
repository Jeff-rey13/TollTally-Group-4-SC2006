import { describe, expect, it } from 'vitest';
import { combine, symmetricRange, type ComponentResult } from '../../src/domain/estimate';
import { D } from '../../src/domain/money';

const component = (over: Partial<ComponentResult>): ComponentResult => ({
  type: 'FUEL',
  isReturnLeg: false,
  amount: D(1),
  lower: D(1),
  upper: D(1),
  isAvailable: true,
  unavailableReason: null,
  exclusions: [],
  ...over,
});

describe('estimate combination (SRS 7.3)', () => {
  it('FR-EST-09 the total is the sum of available components with summed bounds', () => {
    const result = combine([
      component({ type: 'FUEL', amount: D('4.2'), lower: D('3.99'), upper: D('4.41') }),
      component({ type: 'ROAD_USAGE', amount: D(3), lower: D(3), upper: D(3) }),
      component({ type: 'PARKING', amount: D(2), lower: D(2), upper: D(2) }),
    ]);
    expect(result.total.toString()).toBe('9.2');
    expect(result.lower.toString()).toBe('8.99');
    expect(result.upper?.toString()).toBe('9.41');
    expect(result.isLowerBound).toBe(false);
  });

  it('FR-EST-11 an unavailable component is named, excluded from the sum and makes the total a lower bound', () => {
    const result = combine([
      component({ type: 'FUEL', amount: D('4.2'), lower: D('4.2'), upper: D('4.2') }),
      component({ type: 'ROAD_USAGE', amount: D(0), lower: D(0), upper: D(0) }),
      component({
        type: 'PARKING',
        amount: null,
        lower: null,
        upper: null,
        isAvailable: false,
        unavailableReason: 'No carpark data',
      }),
    ]);
    expect(result.total.toString()).toBe('4.2');
    expect(result.upper).toBeNull();
    expect(result.isLowerBound).toBe(true);
    expect(result.unavailable).toEqual([
      { type: 'PARKING', isReturnLeg: false, reason: 'No carpark data' },
    ]);
  });

  it('FR-EST-05 an excluded charge point makes the total a lower bound even though the component is available', () => {
    const result = combine([
      component({ type: 'ROAD_USAGE', exclusions: ['No rate for motorcycle at CTE'] }),
    ]);
    expect(result.isLowerBound).toBe(true);
    expect(result.upper).toBeNull();
    expect(result.exclusions).toEqual(['No rate for motorcycle at CTE']);
  });

  it('TBD-05 the fuel range is a symmetric percentage band around the point value', () => {
    const range = symmetricRange(D('4.20'), 5);
    expect(range.lower.toString()).toBe('3.99');
    expect(range.upper.toString()).toBe('4.41');
  });
});
