import { ExternalServiceError } from '../../lib/errors';
import { decodePolyline } from '../../lib/polyline';
import type { RouteResult } from './RoutingService';

/**
 * Rejects provider routes with impossible distances, durations or geometry before they are priced or stored.
 */
export function validateRoute(
  distanceKm: number,
  durationSec: number,
  encoded: unknown,
  provider: string,
): RouteResult {
  try {
    if (
      !Number.isFinite(distanceKm) ||
      distanceKm <= 0 ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0 ||
      !Number.isSafeInteger(Math.round(durationSec)) ||
      typeof encoded !== 'string' ||
      encoded.length > 1_000_000
    ) {
      throw new Error('Invalid route values');
    }
    const geometry = decodePolyline(encoded);
    if (
      geometry.length < 2 ||
      geometry.some((p) => Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
    ) {
      throw new Error('Invalid route geometry');
    }
    return {
      distanceKm: String(distanceKm),
      drivingTimeSec: Math.round(durationSec),
      encodedGeometry: encoded,
      geometry,
      provider,
    };
  } catch {
    throw new ExternalServiceError(
      'routing',
      'MALFORMED',
      'The routing service returned an invalid route. Try again.',
    );
  }
}
