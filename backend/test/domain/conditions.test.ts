import { describe, expect, it } from 'vitest';
import { parseDaily, parseIncidents, parseTwoHour } from '../../src/adapters/conditions';
import { incidentsNearRoute, isRain, nearestArea, regionOf } from '../../src/domain/conditions';
import { offsetPoint } from '../../src/domain/geo';
import { ExternalServiceError } from '../../src/lib/errors';

// A straight 2 km road running east from Clementi.
const A = { lat: 1.315, lng: 103.76 };
const B = offsetPoint(A, 90, 2000);
const ROUTE = [A, offsetPoint(A, 90, 1000), B];

describe('incidentsNearRoute (FR-EST-17)', () => {
  it('keeps incidents within the distance limit, in the order the route meets them', () => {
    const far = { type: 'Roadwork', message: 'far', ...offsetPoint(A, 0, 900) };
    const late = {
      type: 'Accident',
      message: 'late',
      ...offsetPoint(offsetPoint(A, 90, 1800), 0, 40),
    };
    const early = {
      type: 'Vehicle breakdown',
      message: 'early',
      ...offsetPoint(offsetPoint(A, 90, 300), 180, 250),
    };
    const near = incidentsNearRoute(ROUTE, [far, late, early], 300);
    expect(near.map((i) => i.message)).toEqual(['early', 'late']);
    expect(near[0].alongKm).toBeCloseTo(0.3, 1);
    expect(near[0].distanceFromRouteM).toBeGreaterThan(240);
    expect(near[0].distanceFromRouteM).toBeLessThanOrEqual(300);
    expect(near[1].distanceFromRouteM).toBeLessThan(50);
  });

  it('boundary: an incident just inside the limit is kept and one just outside is not', () => {
    const inside = { type: 'x', message: 'in', ...offsetPoint(offsetPoint(A, 90, 1000), 0, 295) };
    const outside = { type: 'x', message: 'out', ...offsetPoint(offsetPoint(A, 90, 1000), 0, 305) };
    expect(incidentsNearRoute(ROUTE, [inside, outside], 300).map((i) => i.message)).toEqual(['in']);
  });

  it('returns nothing for a route with fewer than two points', () => {
    expect(incidentsNearRoute([A], [{ type: 'x', message: 'm', ...A }], 300)).toEqual([]);
  });
});

describe('forecast helpers (FR-EST-18)', () => {
  it('reads showers, thundery showers, rain and drizzle as rain, and nothing else', () => {
    for (const t of [
      'Light Showers',
      'Thundery Showers',
      'Heavy Rain',
      'Drizzle',
      'Passing Showers',
    ])
      expect(isRain(t)).toBe(true);
    for (const t of ['Fair (Day)', 'Partly Cloudy (Night)', 'Cloudy', 'Hazy', 'Windy', ''])
      expect(isRain(t)).toBe(false);
  });

  it('picks the nearest forecast area and the right region', () => {
    const areas = [
      { name: 'Clementi', lat: 1.315, lng: 103.76 },
      { name: 'Changi', lat: 1.357, lng: 103.987 },
    ];
    expect(nearestArea({ lat: 1.36, lng: 103.99 }, areas)?.name).toBe('Changi');
    expect(nearestArea(A, [])).toBeNull();
    expect(regionOf({ lat: 1.436, lng: 103.786 })).toBe('north');
    expect(regionOf({ lat: 1.357, lng: 103.987 })).toBe('east');
    expect(regionOf({ lat: 1.333, lng: 103.743 })).toBe('west');
    expect(regionOf({ lat: 1.2834, lng: 103.8607 })).toBe('south');
    expect(regionOf({ lat: 1.3343, lng: 103.8563 })).toBe('central');
  });
});

describe('provider answers', () => {
  it('parses LTA incidents and drops rows without a usable position', () => {
    const rows = parseIncidents([
      {
        Type: 'Accident',
        Latitude: 1.3163,
        Longitude: 103.7587,
        Message: ' (18/10)08:01 Accident on AYE. ',
      },
      { Type: 'Roadwork', Latitude: 0, Longitude: 0, Message: 'no position' },
      { Type: '', Latitude: '1.35', Longitude: '103.9', Message: 'x'.repeat(400) },
      { Latitude: 'abc', Longitude: 103.9 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      type: 'Accident',
      message: '(18/10)08:01 Accident on AYE.',
      lat: 1.3163,
      lng: 103.7587,
    });
    expect(rows[1].type).toBe('Incident');
    expect(rows[1].message).toHaveLength(300);
  });

  it('parses the data.gov.sg 2-hour forecast, matching areas to their label points', () => {
    const f = parseTwoHour({
      code: 0,
      data: {
        area_metadata: [
          { name: 'Clementi', label_location: { latitude: 1.315, longitude: 103.76 } },
          { name: 'City', label_location: { latitude: 1.292, longitude: 103.844 } },
        ],
        items: [
          {
            valid_period: {
              start: '2026-10-18T08:00:00+08:00',
              end: '2026-10-18T10:00:00+08:00',
              text: '8 to 10 am',
            },
            forecasts: [
              { area: 'Clementi', forecast: 'Cloudy' },
              { area: 'City', forecast: 'Light Showers' },
              { area: 'Nowhere', forecast: 'Fair' },
            ],
          },
        ],
      },
    });
    expect(f.validFrom.toISOString()).toBe('2026-10-18T00:00:00.000Z');
    expect(f.areas.map((a) => a.name)).toEqual(['Clementi', 'City']);
    expect(f.periodText).toBe('8 to 10 am');
  });

  it('parses the 24-hour forecast by region', () => {
    const f = parseDaily({
      data: {
        records: [
          {
            periods: [
              {
                timePeriod: {
                  start: '2026-10-18T06:00:00+08:00',
                  end: '2026-10-18T12:00:00+08:00',
                  text: '6 am to Midday 18 Oct',
                },
                regions: {
                  west: { text: 'Showers' },
                  east: { text: 'Cloudy' },
                  north: { text: 'Cloudy' },
                  south: { text: 'Cloudy' },
                  central: { text: 'Cloudy' },
                },
              },
            ],
          },
        ],
      },
    });
    expect(f.periods).toHaveLength(1);
    expect(f.periods[0].regions.west).toBe('Showers');
  });

  it('raises a weather service error for an answer with no forecast', () => {
    expect(() => parseTwoHour({ code: 0, data: { items: [] } })).toThrow(ExternalServiceError);
    expect(() => parseDaily({ data: { records: [] } })).toThrow(ExternalServiceError);
  });
});
