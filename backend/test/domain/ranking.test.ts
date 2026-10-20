import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/money';
import { compareRoutes, recommendDeparture } from '../../src/domain/ranking';

const t = (minutes: number): Date => new Date(Date.UTC(2026, 8, 16, 0, minutes));

describe('route comparison', () => {
  it('FR-OPT-04 route-range-overlap: overlapping ranges are indistinguishable and no option is marked cheapest', () => {
    const result = compareRoutes([
      { id: 'A', total: D('5.00'), lower: D('4.75'), upper: D('5.25') },
      { id: 'B', total: D('5.20'), lower: D('4.94'), upper: D('5.46') },
    ]);
    expect(result.cheapestId).toBeNull();
    expect(result.indistinguishableIds).toEqual(['A', 'B']);
  });

  it('FR-OPT-03 a clearly cheaper option is marked, and the choice is left to the Driver', () => {
    const result = compareRoutes([
      { id: 'A', total: D('7.20'), lower: D('6.99'), upper: D('7.41') },
      { id: 'B', total: D('5.04'), lower: D('4.79'), upper: D('5.29') },
    ]);
    expect(result.cheapestId).toBe('B');
    expect(result.indistinguishableIds).toEqual([]);
    expect(result.rankedIds).toEqual(['B', 'A']);
  });

  it('FR-OPT-05 an option without a complete upper bound is excluded from the ranking', () => {
    const result = compareRoutes([
      { id: 'A', total: D('3.00'), lower: D('3.00'), upper: null },
      { id: 'B', total: D('5.00'), lower: D('5.00'), upper: D('5.00') },
    ]);
    expect(result.cheapestId).toBe('B');
    expect(result.rankedIds).toEqual(['B']);
  });
});

describe('departure optimisation', () => {
  it('FR-OPT-07 reports that the planned time is already cheapest instead of a zero saving', () => {
    const rec = recommendDeparture(
      [
        { time: t(0), total: D(5), lower: D(5), upper: D(5) },
        { time: t(15), total: D(6), lower: D(6), upper: D(6) },
      ],
      t(0),
    );
    expect(rec.plannedIsCheapest).toBe(true);
    expect(rec.saving?.isZero()).toBe(true);
    expect(rec.bestTime?.getTime()).toBe(t(0).getTime());
  });

  it('FR-OPT-07 reports the lowest-cost slot and its saving against the planned time', () => {
    const rec = recommendDeparture(
      [
        { time: t(0), total: D(7), lower: D(7), upper: D(7) },
        { time: t(15), total: D(5), lower: D(5), upper: D(5) },
        { time: t(30), total: D(6), lower: D(6), upper: D(6) },
      ],
      t(0),
    );
    expect(rec.bestTime?.getTime()).toBe(t(15).getTime());
    expect(rec.saving?.toString()).toBe('2');
    expect(rec.withinMargin).toBe(false);
    expect(rec.plannedIsCheapest).toBe(false);
  });

  it('FR-OPT-08 a saving smaller than the estimate-range width is within the margin of error', () => {
    const rec = recommendDeparture(
      [
        { time: t(0), total: D('5.30'), lower: D('4.80'), upper: D('5.80') },
        { time: t(15), total: D('5.00'), lower: D('4.50'), upper: D('5.50') },
      ],
      t(0),
    );
    expect(rec.saving?.toString()).toBe('0.3');
    expect(rec.withinMargin).toBe(true);
  });

  it('FR-OPT-08 identical slot prices mean departure time does not affect the cost', () => {
    const rec = recommendDeparture(
      [
        { time: t(0), total: D(4), lower: D(4), upper: D(4) },
        { time: t(15), total: D(4), lower: D(4), upper: D(4) },
      ],
      t(0),
    );
    expect(rec.allIdentical).toBe(true);
    expect(rec.plannedIsCheapest).toBe(true);
  });
});
