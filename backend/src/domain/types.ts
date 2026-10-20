export interface LatLng {
  lat: number;
  lng: number;
}

/** The road a route is on from polyline point `from` until the next span starts. */
export interface RoadSpan {
  from: number;
  name: string;
}
