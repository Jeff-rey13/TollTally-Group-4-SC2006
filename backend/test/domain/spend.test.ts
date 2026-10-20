import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/money';
import { aggregateSpend } from '../../src/domain/spend';
import { variance } from '../../src/domain/variance';

describe('variance and historical spend', () => {
  it('FR-REC-08 history-aggregation sums only logged trips and never substitutes estimates', () => {
    const agg = aggregateSpend([
      { actualTotal: D('10.00'), varianceAbsolute: D('1.00') },
      { actualTotal: D('5.50'), varianceAbsolute: null },
    ]);
    expect(agg.total.toString()).toBe('15.5');
    expect(agg.varianceTotal?.toString()).toBe('1');
    expect(agg.count).toBe(2);
    const empty = aggregateSpend([]);
    expect(empty.total.isZero()).toBe(true);
    expect(empty.varianceTotal).toBeNull();
  });

  it('FR-REC-06 a component the estimate did not contain is marked not applicable', () => {
    expect(variance(null, D(3)).status).toBe('NOT_APPLICABLE');
  });

  it('FR-REC-03 an unentered component is marked not logged', () => {
    expect(variance(D(3), null).status).toBe('NOT_LOGGED');
  });

  it('FR-REC-05 percentage variance is omitted when the estimated value is zero', () => {
    const result = variance(D(0), D(2));
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.absolute.toString()).toBe('2');
      expect(result.percent).toBeNull();
    }
  });
});
