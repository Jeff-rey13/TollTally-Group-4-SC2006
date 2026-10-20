import type { VehicleClass } from '@tolltally/shared';
import type { LatLng } from '../../domain/types';

export interface ParkingRateResult {
  id: string;
  carparkName: string;
  lat: number;
  lng: number;
  ratePerPeriod: string;
  chargingPeriodMin: number;
  roundingRule: string;
  source: string;
  recordedAt: Date;
  distanceKm: number;
}

export type ParkingLookup =
  | { ok: true; rate: ParkingRateResult }
  | { ok: false; kind: 'NO_DATA' | 'SERVICE_FAILURE'; reason: string };

/**
 * «interface» for carpark rate providers (IParkingRateService in the design).
 */
export interface ParkingRateService {
  readonly name: string;
  /**
   * The nearest carpark with a rate for this kind of vehicle. Motorcycles use motorcycle lot
   * rates; every other class uses the car rate.
   */
  nearest(destination: LatLng, vehicleClass?: VehicleClass): Promise<ParkingLookup>;
}
