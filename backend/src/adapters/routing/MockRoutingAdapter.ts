import chargePointFile from '../../../prisma/data/charge-points.json';
import {
  bearingDeg,
  haversineKm,
  headingDiffDeg,
  offsetPoint,
  pointToSegmentM,
  polylineLengthKm,
} from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import { ExternalServiceError } from '../../lib/errors';
import { encodePolyline } from '../../lib/polyline';
import type { LocationResult, RouteRequest, RouteResult, RoutingService } from './RoutingService';

export const MOCK_PLACES: LocationResult[] = [
  {
    name: 'Jurong East MRT Station',
    address: '10 Jurong East Street 12, Singapore 609690',
    lat: 1.3331,
    lng: 103.7422,
  },
  {
    name: 'NTU Nanyang Technological University',
    address: '50 Nanyang Avenue, Singapore 639798',
    lat: 1.3483,
    lng: 103.6831,
  },
  {
    name: 'Toa Payoh Central',
    address: '190 Lorong 6 Toa Payoh, Singapore 310190',
    lat: 1.3329,
    lng: 103.8474,
  },
  {
    name: 'Ang Mo Kio Hub',
    address: '53 Ang Mo Kio Avenue 3, Singapore 569933',
    lat: 1.3691,
    lng: 103.8483,
  },
  { name: 'ION Orchard', address: '2 Orchard Turn, Singapore 238801', lat: 1.304, lng: 103.8318 },
  {
    name: 'Marina Bay Sands',
    address: '10 Bayfront Avenue, Singapore 018956',
    lat: 1.2834,
    lng: 103.8607,
  },
  {
    name: 'Raffles Place MRT Station',
    address: '5 Raffles Place, Singapore 048618',
    lat: 1.284,
    lng: 103.8514,
  },
  {
    name: 'Suntec City',
    address: '3 Temasek Boulevard, Singapore 038983',
    lat: 1.295,
    lng: 103.859,
  },
  {
    name: 'Changi Airport Terminal 3',
    address: '65 Airport Boulevard, Singapore 819663',
    lat: 1.3564,
    lng: 103.9868,
  },
  {
    name: 'Tampines Mall',
    address: '4 Tampines Central 5, Singapore 529510',
    lat: 1.3526,
    lng: 103.9447,
  },
  {
    name: 'Woodlands Civic Centre',
    address: '900 South Woodlands Drive, Singapore 730900',
    lat: 1.436,
    lng: 103.786,
  },
  {
    name: 'VivoCity',
    address: '1 HarbourFront Walk, Singapore 098585',
    lat: 1.2644,
    lng: 103.8222,
  },
  {
    name: 'Bishan Junction 8',
    address: '9 Bishan Place, Singapore 579837',
    lat: 1.3505,
    lng: 103.8486,
  },
  {
    name: 'Punggol Waterway Point',
    address: '83 Punggol Central, Singapore 828761',
    lat: 1.4066,
    lng: 103.9022,
  },
  {
    name: 'Bukit Panjang Plaza',
    address: '1 Jelebu Road, Singapore 677743',
    lat: 1.3796,
    lng: 103.7642,
  },
  {
    name: 'Bugis Junction',
    address: '200 Victoria Street, Singapore 188021',
    lat: 1.2995,
    lng: 103.8555,
  },
  {
    name: 'Mock Timeout Point (testing)',
    address: 'Simulates a routing service timeout',
    lat: 1.35,
    lng: 103.82,
  },
];

interface Gantry {
  code: string;
  lat: number;
  lng: number;
  headingDeg: number;
}

const GANTRIES: Gantry[] = chargePointFile.chargePoints.map((c) => ({
  code: c.code,
  lat: c.lat,
  lng: c.lng,
  headingDeg: c.headingDeg,
}));

/**
 * Offline routing provider for tests and rehearsals. Builds deterministic routes between fixed
 * Singapore places that pass through the seeded ERP gantries, plus a place that simulates a timeout.
 */
export class MockRoutingAdapter implements RoutingService {
  readonly name = 'mock';

  async search(query: string): Promise<LocationResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return MOCK_PLACES.filter((p) => {
      const haystack = `${p.name} ${p.address}`.toLowerCase();
      if (p.name.startsWith('Mock Timeout') && !q.includes('timeout')) return false;
      return haystack.includes(q);
    }).slice(0, 8);
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    this.guard(request);
    return this.buildRoutes(request)[0];
  }

  async alternatives(request: RouteRequest, max: number): Promise<RouteResult[]> {
    this.guard(request);
    return this.buildRoutes(request).slice(1, 1 + max);
  }

  private guard(request: RouteRequest): void {
    const timeoutPoint = MOCK_PLACES[MOCK_PLACES.length - 1];
    const near = (p: LatLng): boolean => haversineKm(p, timeoutPoint) < 0.05;
    if (near(request.origin) || near(request.destination)) {
      throw new ExternalServiceError('routing', 'TIMEOUT', 'Mock routing timeout');
    }
  }

  private buildRoutes(request: RouteRequest): RouteResult[] {
    const { origin, destination } = request;
    const gantries = gantriesAlong(origin, destination);
    const routes: RouteResult[] = [];
    routes.push(makeRoute(throughGantries(origin, destination, gantries), 1.12, 35));
    routes.push(makeRoute(viaOffset(origin, destination, 1.5), 1.25, 42));
    if (gantries.length > 1) {
      routes.push(makeRoute(throughGantries(origin, destination, gantries.slice(0, 1)), 1.15, 36));
    } else {
      routes.push(makeRoute(viaOffset(origin, destination, -1.2), 1.2, 38));
    }
    return routes;
  }
}

function gantriesAlong(origin: LatLng, destination: LatLng): Gantry[] {
  if (haversineKm(origin, destination) < 0.5) return [];
  const direction = bearingDeg(origin, destination);
  return (
    GANTRIES.map((g) => ({ g, proj: pointToSegmentM(g, origin, destination) }))
      .filter((x) => x.proj.distM <= 1500 && x.proj.t > 0.05 && x.proj.t < 0.95)
      // Only gantries that charge traffic heading roughly the way this trip goes.
      .filter((x) => headingDiffDeg(x.g.headingDeg, direction) <= 90)
      .sort((a, b) => a.proj.t - b.proj.t)
      .slice(0, 3)
      .map((x) => x.g)
  );
}

function throughGantries(origin: LatLng, destination: LatLng, gantries: Gantry[]): LatLng[] {
  const points: LatLng[] = [origin];
  for (const g of gantries) {
    const at = { lat: g.lat, lng: g.lng };
    points.push(offsetPoint(at, (g.headingDeg + 180) % 360, 300));
    points.push(at);
    points.push(offsetPoint(at, g.headingDeg, 150));
  }
  points.push(destination);
  return points;
}

function viaOffset(origin: LatLng, destination: LatLng, km: number): LatLng[] {
  const mid = { lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 };
  const perpendicular = (bearingDeg(origin, destination) + 90) % 360;
  return [origin, offsetPoint(mid, perpendicular, km * 1000), destination];
}

function makeRoute(geometry: LatLng[], roadFactor: number, speedKmh: number): RouteResult {
  const km = polylineLengthKm(geometry) * roadFactor;
  const seconds = Math.round((km / speedKmh) * 3600) + 60;
  return {
    distanceKm: km.toFixed(3),
    drivingTimeSec: seconds,
    geometry,
    encodedGeometry: encodePolyline(geometry),
    provider: 'mock',
  };
}
