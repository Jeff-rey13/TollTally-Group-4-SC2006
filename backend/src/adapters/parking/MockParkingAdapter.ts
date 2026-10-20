import type { VehicleClass } from '@tolltally/shared';
import type { LatLng } from '../../domain/types';
import type { ParkingLookup, ParkingRateService } from './ParkingRateService';

export type MockParkingMode = 'fixed' | 'unavailable' | 'failure';

/**
 * Parking provider for tests: a fixed rate, no data, or a simulated failure.
 */
export class MockParkingAdapter implements ParkingRateService {
  readonly name = 'mock';

  constructor(private readonly mode: MockParkingMode = 'fixed') {}

  async nearest(destination: LatLng, vehicleClass?: VehicleClass): Promise<ParkingLookup> {
    if (this.mode === 'failure') {
      return {
        ok: false,
        kind: 'SERVICE_FAILURE',
        reason: 'The parking rate service did not respond',
      };
    }
    if (this.mode === 'unavailable') {
      return {
        ok: false,
        kind: 'NO_DATA',
        reason: 'No carpark rate is recorded near the destination',
      };
    }
    return {
      ok: true,
      rate: {
        id: 'mock-carpark',
        carparkName: 'Mock destination carpark',
        lat: destination.lat,
        lng: destination.lng,
        ratePerPeriod: vehicleClass === 'MOTORCYCLE' ? '0.65' : '1.20',
        chargingPeriodMin: vehicleClass === 'MOTORCYCLE' ? 1440 : 30,
        roundingRule: 'CEIL',
        source: 'mock',
        recordedAt: new Date('2026-09-01T00:00:00Z'),
        distanceKm: 0.1,
      },
    };
  }
}
