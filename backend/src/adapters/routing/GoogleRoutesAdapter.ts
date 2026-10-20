import { ExternalServiceError } from '../../lib/errors';
import { fetchJson } from '../../lib/http';
import { validateRoute } from './validateRoute';
import type { LocationResult, RouteRequest, RouteResult, RoutingService } from './RoutingService';

const COMPUTE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

interface GoogleRoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    description?: string;
    polyline?: { encodedPolyline?: string };
  }[];
}

/**
 * «adapter» for the Google Routes API, used to obtain distinct alternative routes for UC-11.
 */
export class GoogleRoutesAdapter implements RoutingService {
  readonly name = 'google';

  constructor(private readonly opts: { apiKey: string; timeoutMs: number }) {}

  async search(): Promise<LocationResult[]> {
    return [];
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const routes = await this.compute(request, false);
    if (routes.length === 0)
      throw new ExternalServiceError('routing', 'MALFORMED', 'Google Routes returned no route');
    return routes[0];
  }

  async alternatives(request: RouteRequest, max: number): Promise<RouteResult[]> {
    const routes = await this.compute(request, true);
    return routes.slice(0, max + 1);
  }

  private async compute(request: RouteRequest, alternatives: boolean): Promise<RouteResult[]> {
    const body = {
      origin: {
        location: { latLng: { latitude: request.origin.lat, longitude: request.origin.lng } },
      },
      destination: {
        location: {
          latLng: { latitude: request.destination.lat, longitude: request.destination.lng },
        },
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: alternatives,
      polylineEncoding: 'ENCODED_POLYLINE',
    };
    const data = await fetchJson<GoogleRoutesResponse>(
      'routing',
      COMPUTE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.opts.apiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description',
        },
        body: JSON.stringify(body),
      },
      this.opts.timeoutMs,
    );
    if (!data || (data.routes !== undefined && !Array.isArray(data.routes)))
      throw new ExternalServiceError(
        'routing',
        'MALFORMED',
        'Google Routes returned an invalid response',
      );
    return (data.routes ?? []).map((r) => {
      const duration =
        typeof r?.duration === 'string' && /^\d+(\.\d+)?s$/.test(r.duration)
          ? Number(r.duration.slice(0, -1))
          : NaN;
      return {
        ...validateRoute(
          typeof r?.distanceMeters === 'number' ? r.distanceMeters / 1000 : NaN,
          duration,
          r?.polyline?.encodedPolyline,
          'google',
        ),
        summary: r.description,
      };
    });
  }
}
