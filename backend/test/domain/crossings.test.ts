import { describe, expect, it } from 'vitest';
import { detectCrossings, nearestApproach } from '../../src/domain/crossings';

const northbound = [
  { lat: 1.3, lng: 103.85 },
  { lat: 1.32, lng: 103.85 },
];
const departure = new Date('2026-09-16T00:00:00Z');

describe('charge-point crossing detection', () => {
  it('FR-EST-04 a charge point on the route facing the direction of travel is crossed at a time along the route', () => {
    const found = detectCrossings(
      northbound,
      [{ id: 'g', lat: 1.31, lng: 103.85, headingDeg: 0 }],
      600,
      departure,
    );
    expect(found).toHaveLength(1);
    expect(found[0].chargePointId).toBe('g');
    const elapsedSec = (found[0].crossingTime.getTime() - departure.getTime()) / 1000;
    expect(Math.abs(elapsedSec - 300)).toBeLessThan(5);
  });

  it('FR-EST-04 a charge point facing the opposite direction is not crossed', () => {
    expect(
      detectCrossings(
        northbound,
        [{ id: 'g', lat: 1.31, lng: 103.85, headingDeg: 180 }],
        600,
        departure,
      ),
    ).toHaveLength(0);
  });

  it('FR-EST-01 a charge point 100 m beside the route is not crossed', () => {
    expect(
      detectCrossings(
        northbound,
        [{ id: 'g', lat: 1.31, lng: 103.851, headingDeg: 0 }],
        600,
        departure,
      ),
    ).toHaveLength(0);
  });

  it('crossings are returned in route order', () => {
    const found = detectCrossings(
      northbound,
      [
        { id: 'far', lat: 1.315, lng: 103.85, headingDeg: 0 },
        { id: 'near', lat: 1.305, lng: 103.85, headingDeg: 0 },
      ],
      600,
      departure,
    );
    expect(found.map((c) => c.chargePointId)).toEqual(['near', 'far']);
  });

  it('a wider distance limit counts a gantry about 50 m from a live route', () => {
    const gantry = { id: 'g', lat: 1.31, lng: 103.85045, headingDeg: 0 };
    expect(detectCrossings(northbound, [gantry], 600, departure)).toHaveLength(0);
    expect(
      detectCrossings(northbound, [gantry], 600, departure, {
        maxDistanceM: 60,
        maxHeadingDiffDeg: 60,
      }),
    ).toHaveLength(1);
  });

  it('the wider limits still ignore a gantry on the opposite carriageway', () => {
    expect(
      detectCrossings(
        northbound,
        [{ id: 'g', lat: 1.31, lng: 103.8502, headingDeg: 180 }],
        600,
        departure,
        { maxDistanceM: 60, maxHeadingDiffDeg: 60 },
      ),
    ).toHaveLength(0);
  });

  it('nearestApproach reports the distance, the angle and the closest route point', () => {
    const near = nearestApproach(northbound, { id: 'g', lat: 1.31, lng: 103.851, headingDeg: 90 });
    expect(near).not.toBeNull();
    expect(near!.distM).toBeGreaterThan(105);
    expect(near!.distM).toBeLessThan(115);
    expect(near!.headingDiffDeg).toBeCloseTo(90, 0);
    expect(near!.point.lat).toBeCloseTo(1.31, 5);
    expect(near!.point.lng).toBeCloseTo(103.85, 5);
  });
});
