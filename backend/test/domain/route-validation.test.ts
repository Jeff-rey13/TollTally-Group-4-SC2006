import { describe, expect, it } from 'vitest';
import { validateRoute } from '../../src/adapters/routing/validateRoute';
import { encodePolyline } from '../../src/lib/polyline';

const geometry = encodePolyline([
  { lat: 1.3, lng: 103.8 },
  { lat: 1.31, lng: 103.82 },
]);
describe('NFR-REL-02 malformed route responses', () => {
  it('preserves valid distance precision and rounds driving time to seconds', () => {
    const route = validateRoute(12.34567, 600.2, geometry, 'test');
    expect(route.distanceKm).toBe('12.34567');
    expect(route.drivingTimeSec).toBe(600);
    expect(route.geometry).toHaveLength(2);
  });
  it.each([
    [NaN, 600, geometry],
    [-1, 600, geometry],
    [12, NaN, geometry],
    [12, 0, geometry],
    [12, 600, ''],
    [12, 600, '_'],
    [12, 600, '~~~~~~~'],
    [12, 600, null],
  ])('rejects invalid values with a provider error (%s, %s)', (distance, duration, encoded) => {
    expect(() => validateRoute(distance as number, duration as number, encoded, 'test')).toThrow(
      'invalid route',
    );
  });
});
