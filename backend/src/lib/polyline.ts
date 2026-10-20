import type { LatLng } from '../domain/types';

/**
 * Decodes an encoded polyline into points, rejecting truncated input.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = Math.pow(10, precision);
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const nextByte = (): number => {
    if (index >= encoded.length) throw new Error('Incomplete route geometry');
    const byte = encoded.charCodeAt(index++) - 63;
    if (byte < 0 || byte > 63) throw new Error('Invalid route geometry');
    return byte;
  };
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (shift > 30) throw new Error('Invalid route geometry');
      byte = nextByte();
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      if (shift > 30) throw new Error('Invalid route geometry');
      byte = nextByte();
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/**
 * Encodes points as a polyline string for storage and the route map.
 */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const factor = Math.pow(10, precision);
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
