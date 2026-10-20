import { haversineKm, pointToSegmentM } from './geo';
import type { LatLng } from './types';

/** One reported traffic incident: its kind, where it starts and LTA's description. */
export interface TrafficIncident {
  type: string;
  message: string;
  lat: number;
  lng: number;
}

export interface IncidentOnRoute extends TrafficIncident {
  /** Shortest distance from the incident to the route, in metres. */
  distanceFromRouteM: number;
  /** How far along the route the closest point is, in kilometres from the start. */
  alongKm: number;
}

/**
 * The incidents within `maxDistanceM` of the route, in the order the route meets them.
 * Direction is not checked: LTA's incident position is a single point and its message says which
 * way the traffic is affected, so the Driver reads that.
 */
export function incidentsNearRoute(
  route: LatLng[],
  incidents: TrafficIncident[],
  maxDistanceM: number,
): IncidentOnRoute[] {
  if (route.length < 2) return [];
  const cumulative: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversineKm(route[i - 1], route[i]);
  }
  const near: IncidentOnRoute[] = [];
  for (const incident of incidents) {
    let best: { distM: number; alongKm: number } | null = null;
    for (let i = 1; i < route.length; i++) {
      const { distM, t } = pointToSegmentM(incident, route[i - 1], route[i]);
      if (!best || distM < best.distM) {
        best = { distM, alongKm: cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]) };
      }
    }
    if (best && best.distM <= maxDistanceM) {
      near.push({ ...incident, distanceFromRouteM: Math.round(best.distM), alongKm: best.alongKm });
    }
  }
  return near.sort((a, b) => a.alongKm - b.alongKm);
}

/** True when a forecast text means rain: showers, rain, thundery or drizzle. */
export function isRain(forecast: string): boolean {
  return /shower|rain|thunder|drizzle/i.test(forecast);
}

export interface ForecastArea {
  name: string;
  lat: number;
  lng: number;
}

/** The forecast area whose label point is closest to the given place. */
export function nearestArea<T extends ForecastArea>(place: LatLng, areas: T[]): T | null {
  let best: { area: T; km: number } | null = null;
  for (const area of areas) {
    const km = haversineKm(place, area);
    if (!best || km < best.km) best = { area, km };
  }
  return best?.area ?? null;
}

export type ForecastRegion = 'north' | 'south' | 'east' | 'west' | 'central';

/**
 * The 24-hour forecast region a place falls in. The national forecast divides Singapore into five
 * regions without published boundaries, so these cut-offs are an approximation.
 */
export function regionOf(place: LatLng): ForecastRegion {
  if (place.lat >= 1.4) return 'north';
  if (place.lng >= 103.9) return 'east';
  if (place.lng <= 103.77) return 'west';
  if (place.lat <= 1.29) return 'south';
  return 'central';
}
