import type { LatLng, RoadSpan } from '../../domain/types';

export interface LocationResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  departureTime: Date;
}

export interface RouteResult {
  distanceKm: string;
  drivingTimeSec: number;
  geometry: LatLng[];
  encodedGeometry: string;
  provider: string;
  summary?: string;
  /** Road names along the route, when the provider gives turn instructions. */
  roads?: RoadSpan[];
}

/**
 * «interface» for routing providers (IRoutingService in the design).
 * Implementations hide provider formats from the rest of the system (NFR-MAI-01).
 */
export interface RoutingService {
  readonly name: string;
  search(query: string): Promise<LocationResult[]>;
  route(request: RouteRequest): Promise<RouteResult>;
  alternatives(request: RouteRequest, max: number): Promise<RouteResult[]>;
}
