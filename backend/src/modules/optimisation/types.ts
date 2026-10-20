export interface CachedRouteOption {
  id: string;
  label: string;
  distanceKm: string;
  drivingTimeSec: number;
  encodedGeometry: string;
  provider: string;
  roads?: string | null;
  revision: number;
}
