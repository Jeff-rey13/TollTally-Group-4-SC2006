import { bearingDeg, haversineKm, headingDiffDeg, pointToSegmentM, segmentPosition } from './geo';
import type { LatLng, RoadSpan } from './types';

export interface ChargePointLike {
  id: string;
  lat: number;
  lng: number;
  headingDeg: number;
  /** Names of the road the gantry stands on, separated by "|", e.g. "AYER RAJAH EXPRESSWAY|AYE". */
  roads?: string | null;
  /**
   * LTA zone. Gantries LTA lists together (main carriageway and slip roads into the same charging
   * point) share one, and a trip pays only the first of them it passes.
   */
  zoneId?: string | null;
}

/** Gantries of one zone passed within this distance along the route count as one passage. */
export const SAME_ZONE_SPAN_KM = 3;

export interface DetectedCrossing {
  chargePointId: string;
  distanceAlongKm: number;
  crossingTime: Date;
}

export interface CrossingOptions {
  maxDistanceM?: number;
  maxHeadingDiffDeg?: number;
  /** Road names along the route, when the routing provider supplies them. */
  roads?: RoadSpan[];
  /**
   * Distance allowed when the route is on the gantry's own road. Gantry positions are approximate,
   * so knowing the road lets the match be wider without picking up parallel roads.
   */
  sameRoadDistanceM?: number;
}

const normaliseRoad = (name: string): string =>
  ` ${name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()} `;

/** True when the route's road name contains one of the gantry's road names as whole words. */
export function isSameRoad(routeRoad: string, gantryRoads: string): boolean {
  const road = normaliseRoad(routeRoad);
  return gantryRoads
    .split('|')
    .map((alias) => alias.trim())
    .filter(Boolean)
    .some((alias) => road.includes(normaliseRoad(alias)));
}

/** Road name for each polyline segment (segment i joins points i-1 and i), or null when unknown. */
function segmentRoads(pointCount: number, spans: RoadSpan[] | undefined): (string | null)[] {
  const out: (string | null)[] = new Array(pointCount).fill(null);
  if (!spans?.length) return out;
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let k = -1;
  for (let i = 1; i < pointCount; i++) {
    while (k + 1 < sorted.length && sorted[k + 1].from <= i - 1) k++;
    out[i] = k >= 0 ? sorted[k].name : null;
  }
  return out;
}

/**
 * Finds the charge points a route passes within the distance limit and in the charged direction,
 * and estimates each crossing time from the share of driving time to that point (FR-EST-04).
 */
export function detectCrossings(
  polyline: LatLng[],
  chargePoints: ChargePointLike[],
  drivingTimeSec: number,
  departureTime: Date,
  options: CrossingOptions = {},
): DetectedCrossing[] {
  const maxDistanceM = options.maxDistanceM ?? 25;
  const maxHeadingDiff = options.maxHeadingDiffDeg ?? 45;
  const sameRoadDistanceM = Math.max(options.sameRoadDistanceM ?? 350, maxDistanceM);
  if (polyline.length < 2) return [];
  const roadOf = segmentRoads(polyline.length, options.roads);

  const cumulativeKm: number[] = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumulativeKm[i] = cumulativeKm[i - 1] + haversineKm(polyline[i - 1], polyline[i]);
  }
  const totalKm = cumulativeKm[cumulativeKm.length - 1];
  if (totalKm <= 0) return [];

  const found: DetectedCrossing[] = [];
  for (const cp of chargePoints) {
    let best: { distM: number; alongKm: number } | null = null;
    for (let i = 1; i < polyline.length; i++) {
      const a = polyline[i - 1];
      const b = polyline[i];
      const { distM, t } = pointToSegmentM(cp, a, b);
      // The wider same-road limit only applies where the gantry lies beside this stretch of road,
      // not beyond its ends, so a route that joins the road after the gantry is not charged.
      const position = segmentPosition(cp, a, b);
      const beside = position >= 0 && position <= 1;
      const onGantryRoad =
        beside && Boolean(cp.roads && roadOf[i] && isSameRoad(roadOf[i]!, cp.roads));
      if (distM > (onGantryRoad ? sameRoadDistanceM : maxDistanceM)) continue;
      if (headingDiffDeg(bearingDeg(a, b), cp.headingDeg) > maxHeadingDiff) continue;
      const alongKm = cumulativeKm[i - 1] + t * (cumulativeKm[i] - cumulativeKm[i - 1]);
      if (!best || distM < best.distM) best = { distM, alongKm };
    }
    if (best) {
      const elapsedMs = Math.round((best.alongKm / totalKm) * drivingTimeSec * 1000);
      found.push({
        chargePointId: cp.id,
        distanceAlongKm: best.alongKm,
        crossingTime: new Date(departureTime.getTime() + elapsedMs),
      });
    }
  }
  found.sort((x, y) => x.distanceAlongKm - y.distanceAlongKm);
  return onePerZonePassage(found, chargePoints);
}

/**
 * Keeps the first gantry of a zone and drops others of the same zone passed within
 * SAME_ZONE_SPAN_KM after it, so parallel gantries on a slip road and the main carriageway are not
 * both charged. Gantries without a zone are always kept.
 */
function onePerZonePassage(
  sorted: DetectedCrossing[],
  chargePoints: ChargePointLike[],
): DetectedCrossing[] {
  const zoneOf = new Map(chargePoints.map((cp) => [cp.id, cp.zoneId ?? null]));
  const lastKeptKm = new Map<string, number>();
  return sorted.filter((c) => {
    const zone = zoneOf.get(c.chargePointId);
    if (!zone) return true;
    const last = lastKeptKm.get(zone);
    if (last !== undefined && c.distanceAlongKm - last <= SAME_ZONE_SPAN_KM) return false;
    lastKeptKm.set(zone, c.distanceAlongKm);
    return true;
  });
}

export interface NearestApproach {
  /** Shortest distance in metres from the charge point to the route. */
  distM: number;
  /** Angle between the route direction at that spot and the charged direction. */
  headingDiffDeg: number;
  /** Route direction (degrees from north) at the closest spot. */
  routeBearingDeg: number;
  /** The closest point on the route. */
  point: LatLng;
}

/**
 * Finds where a route comes closest to a charge point, ignoring direction. Used by the ERP
 * diagnostic and calibration scripts to explain why a gantry was or was not counted.
 */
export function nearestApproach(polyline: LatLng[], cp: ChargePointLike): NearestApproach | null {
  let best: NearestApproach | null = null;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const { distM, t } = pointToSegmentM(cp, a, b);
    if (best && distM >= best.distM) continue;
    const routeBearing = bearingDeg(a, b);
    best = {
      distM,
      headingDiffDeg: headingDiffDeg(routeBearing, cp.headingDeg),
      routeBearingDeg: routeBearing,
      point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
    };
  }
  return best;
}
