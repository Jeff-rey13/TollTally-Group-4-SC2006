import { describe, expect, it } from 'vitest';
import { roadSpansFromInstructions } from '../../src/adapters/routing/OneMapRoutingAdapter';
import { detectCrossings, isSameRoad } from '../../src/domain/crossings';

// A straight eastbound road along latitude 1.30, about 2.2 km long.
const eastbound = [
  { lat: 1.3, lng: 103.8 },
  { lat: 1.3, lng: 103.81 },
  { lat: 1.3, lng: 103.82 },
];
const departure = new Date('2026-10-19T00:30:00Z');
// Gantry roughly 200 m north of the road, charging eastbound traffic.
const gantry = {
  id: 'aye',
  lat: 1.3018,
  lng: 103.81,
  headingDeg: 90,
  roads: 'AYER RAJAH EXPRESSWAY|AYE',
};
const options = { maxDistanceM: 60, maxHeadingDiffDeg: 60, sameRoadDistanceM: 350 };

describe('ERP gantries matched by road name', () => {
  it('recognises a road by its full name or its abbreviation as whole words', () => {
    expect(isSameRoad('AYER RAJAH EXPRESSWAY', gantry.roads)).toBe(true);
    expect(isSameRoad('AYE (TUAS)', gantry.roads)).toBe(true);
    expect(isSameRoad('LAYER ROAD', gantry.roads)).toBe(false);
  });

  it('counts a gantry 200 m from the line when OneMap says the route is on that road', () => {
    const roads = [{ from: 0, name: 'AYER RAJAH EXPRESSWAY' }];
    expect(detectCrossings(eastbound, [gantry], 600, departure, options)).toHaveLength(0);
    expect(
      detectCrossings(eastbound, [gantry], 600, departure, { ...options, roads }),
    ).toHaveLength(1);
  });

  it('does not use the wider limit on a different road or in the opposite direction', () => {
    const other = [{ from: 0, name: 'COMMONWEALTH AVENUE WEST' }];
    expect(
      detectCrossings(eastbound, [gantry], 600, departure, { ...options, roads: other }),
    ).toHaveLength(0);
    const westbound = [...eastbound].reverse();
    const roads = [{ from: 0, name: 'AYER RAJAH EXPRESSWAY' }];
    expect(
      detectCrossings(westbound, [gantry], 600, departure, { ...options, roads }),
    ).toHaveLength(0);
  });

  it('does not charge a route that joins the road after the gantry', () => {
    const joinsLater = [
      { lat: 1.29, lng: 103.812 },
      { lat: 1.3, lng: 103.812 },
      { lat: 1.3, lng: 103.83 },
    ];
    const roads = [
      { from: 0, name: 'CLEMENTI ROAD' },
      { from: 1, name: 'AYER RAJAH EXPRESSWAY' },
    ];
    expect(
      detectCrossings(joinsLater, [gantry], 600, departure, { ...options, roads }),
    ).toHaveLength(0);
  });

  it('reads road names from OneMap turn instructions and skips steps it cannot read', () => {
    const geometry = [
      { lat: 1.3, lng: 103.8 },
      { lat: 1.3, lng: 103.805 },
      { lat: 1.3, lng: 103.81 },
      { lat: 1.3, lng: 103.815 },
    ];
    const spans = roadSpansFromInstructions(
      [
        ['Head', 'CLEMENTI ROAD', 500, '1.3,103.8', 40, '500m', 'East', 'east', 'driving'],
        'not a step',
        ['Turn Right', 'AYER RAJAH EXPRESSWAY', 1000, '1.30001,103.81', 60, '1km'],
        ['Continue', 'AYER RAJAH EXPRESSWAY', 500, '1.3,103.815', 30, '500m'],
        ['Bad', 'NOWHERE', 0, 'not,a,point', 0, ''],
      ],
      geometry,
    );
    expect(spans).toEqual([
      { from: 0, name: 'CLEMENTI ROAD' },
      { from: 2, name: 'AYER RAJAH EXPRESSWAY' },
    ]);
    expect(roadSpansFromInstructions(undefined, geometry)).toEqual([]);
  });
});

describe('gantries LTA lists together', () => {
  const onLine = (id: string, lng: number, zoneId: string | null) => ({
    id,
    lat: 1.3,
    lng,
    headingDeg: 90,
    zoneId,
  });

  it('charges only the first of two gantries in the same zone on one pass', () => {
    const crossings = detectCrossings(
      eastbound,
      [onLine('g32', 103.805, 'G32+G45'), onLine('g45', 103.8052, 'G32+G45')],
      600,
      departure,
      options,
    );
    expect(crossings.map((c) => c.chargePointId)).toEqual(['g32']);
  });

  it('charges gantries in different zones, and zones passed again far apart', () => {
    expect(
      detectCrossings(
        eastbound,
        [onLine('a', 103.805, 'G1'), onLine('b', 103.8052, 'G2'), onLine('c', 103.806, null)],
        600,
        departure,
        options,
      ),
    ).toHaveLength(3);
    const long = [
      { lat: 1.3, lng: 103.8 },
      { lat: 1.3, lng: 103.9 },
    ];
    expect(
      detectCrossings(
        long,
        [onLine('x', 103.81, 'Z'), onLine('y', 103.89, 'Z')],
        600,
        departure,
        options,
      ),
    ).toHaveLength(2);
  });
});
