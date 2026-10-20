import type { LatLng } from './types';

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function headingDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function toXY(p: LatLng, ref: LatLng): { x: number; y: number } {
  const kx = 111320 * Math.cos(toRad(ref.lat));
  const ky = 110574;
  return { x: (p.lng - ref.lng) * kx, y: (p.lat - ref.lat) * ky };
}

export function pointToSegmentM(p: LatLng, a: LatLng, b: LatLng): { distM: number; t: number } {
  const P = toXY(p, a);
  const B = toXY(b, a);
  const len2 = B.x * B.x + B.y * B.y;
  if (len2 === 0) return { distM: Math.hypot(P.x, P.y), t: 0 };
  const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
  return { distM: Math.hypot(P.x - t * B.x, P.y - t * B.y), t };
}

/** Where p falls along segment a-b without clamping: below 0 is before a, above 1 is past b. */
export function segmentPosition(p: LatLng, a: LatLng, b: LatLng): number {
  const P = toXY(p, a);
  const B = toXY(b, a);
  const len2 = B.x * B.x + B.y * B.y;
  return len2 === 0 ? 0 : (P.x * B.x + P.y * B.y) / len2;
}

export function polylineLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

export function offsetPoint(p: LatLng, bearing: number, distanceM: number): LatLng {
  const delta = distanceM / (EARTH_RADIUS_KM * 1000);
  const theta = toRad(bearing);
  const lat1 = toRad(p.lat);
  const lng1 = toRad(p.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}
