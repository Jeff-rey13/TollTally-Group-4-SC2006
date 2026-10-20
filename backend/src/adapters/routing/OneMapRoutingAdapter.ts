import { haversineKm } from '../../domain/geo';
import type { LatLng, RoadSpan } from '../../domain/types';
import { ExternalServiceError } from '../../lib/errors';
import { fetchJson } from '../../lib/http';
import { validateRoute } from './validateRoute';
import type { LocationResult, RouteRequest, RouteResult, RoutingService } from './RoutingService';

/** Origins the browser loads map tiles and the OneMap logo from (used by the CSP). */
export const MAP_IMAGE_ORIGINS = ['https://www.onemap.gov.sg'];

const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const TOKEN_URL = 'https://www.onemap.gov.sg/api/auth/post/getToken';
const ROUTE_URL = 'https://www.onemap.gov.sg/api/public/routingsvc/route';

interface OneMapSearchResponse {
  results?: {
    SEARCHVAL?: string;
    BUILDING?: string;
    ADDRESS?: string;
    LATITUDE?: string;
    LONGITUDE?: string;
  }[];
}

interface OneMapRouteResponse {
  status_message?: string;
  route_geometry?: string;
  route_summary?: { total_time: number; total_distance: number };
  // Each step: [direction, road name, metres, "lat,lng", seconds, ...]
  route_instructions?: unknown[];
}

/**
 * Turns OneMap's turn instructions into road spans: each step's road starts at the polyline point
 * nearest the step's coordinate. Unexpected step formats are skipped, so a format change only
 * loses road names, never the route.
 */
export function roadSpansFromInstructions(
  instructions: unknown[] | undefined,
  geometry: LatLng[],
): RoadSpan[] {
  if (!Array.isArray(instructions) || geometry.length < 2) return [];
  const spans: RoadSpan[] = [];
  let searchFrom = 0;
  for (const step of instructions) {
    if (!Array.isArray(step)) continue;
    const name = typeof step[1] === 'string' ? step[1].trim() : '';
    const coord = typeof step[3] === 'string' ? step[3].split(',').map(Number) : [];
    if (!name || coord.length !== 2 || !coord.every(Number.isFinite)) continue;
    const point = { lat: coord[0], lng: coord[1] };
    let bestIndex = searchFrom;
    let bestKm = Infinity;
    for (let i = searchFrom; i < geometry.length; i++) {
      const km = haversineKm(point, geometry[i]);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = i;
      }
    }
    if (bestKm > 0.2) continue;
    searchFrom = bestIndex;
    if (spans.length && spans[spans.length - 1].name === name) continue;
    spans.push({ from: bestIndex, name });
  }
  return spans;
}

/**
 * «adapter» for the OneMap API: Singapore place search and driving routes.
 * Logs in with the account email and password and renews the access token automatically.
 */
export class OneMapRoutingAdapter implements RoutingService {
  readonly name = 'onemap';
  private token: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly opts: { email?: string; password?: string; timeoutMs: number }) {}

  async search(query: string): Promise<LocationResult[]> {
    const url = `${SEARCH_URL}?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const data = await fetchJson<OneMapSearchResponse>('routing', url, {}, this.opts.timeoutMs);
    if (!data || !Array.isArray(data.results))
      throw new ExternalServiceError(
        'routing',
        'MALFORMED',
        'The location search returned an invalid response. Try again.',
      );
    return data.results
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        name: r.SEARCHVAL || r.BUILDING || r.ADDRESS || 'Unnamed location',
        address: r.ADDRESS ?? '',
        lat: Number(r.LATITUDE),
        lng: Number(r.LONGITUDE),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .slice(0, 8);
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAtMs > Date.now() + 60_000) return this.token.value;
    if (!this.opts.email || !this.opts.password) {
      throw new ExternalServiceError(
        'routing',
        'UNAUTHORISED',
        'OneMap credentials are not configured',
      );
    }
    const data = await fetchJson<{ access_token: string; expiry_timestamp: string }>(
      'routing',
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.opts.email, password: this.opts.password }),
      },
      this.opts.timeoutMs,
    );
    if (!data || typeof data.access_token !== 'string' || !data.access_token)
      throw new ExternalServiceError('routing', 'MALFORMED', 'OneMap returned no token');
    this.token = { value: data.access_token, expiresAtMs: Number(data.expiry_timestamp) * 1000 };
    return data.access_token;
  }

  /** True when an email and password are set, so routes can be requested. */
  get isConfigured(): boolean {
    return Boolean(this.opts.email && this.opts.password);
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    try {
      return await this.routeOnce(request);
    } catch (err) {
      // One quick retry for a slow or dropped connection; a refused login is not retried.
      if (
        err instanceof ExternalServiceError &&
        (err.kind === 'TIMEOUT' || err.kind === 'UNAVAILABLE')
      ) {
        return this.routeOnce(request);
      }
      throw err;
    }
  }

  private async routeOnce(request: RouteRequest): Promise<RouteResult> {
    const token = await this.getToken();
    const { origin: o, destination: d } = request;
    const url = `${ROUTE_URL}?start=${o.lat},${o.lng}&end=${d.lat},${d.lng}&routeType=drive`;
    const data = await fetchJson<OneMapRouteResponse>(
      'routing',
      url,
      { headers: { Authorization: token } },
      this.opts.timeoutMs,
    );
    if (!data?.route_summary || !data.route_geometry) {
      throw new ExternalServiceError('routing', 'MALFORMED', 'OneMap returned no route');
    }
    const route = validateRoute(
      data.route_summary.total_distance / 1000,
      data.route_summary.total_time,
      data.route_geometry,
      'onemap',
    );
    const roads = roadSpansFromInstructions(data.route_instructions, route.geometry);
    return roads.length ? { ...route, roads } : route;
  }

  async alternatives(): Promise<RouteResult[]> {
    return [];
  }
}
