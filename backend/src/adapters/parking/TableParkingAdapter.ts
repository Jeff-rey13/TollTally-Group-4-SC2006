import type { PrismaClient } from '@prisma/client';
import { haversineKm } from '../../domain/geo';
import type { VehicleClass } from '@tolltally/shared';
import type { LatLng } from '../../domain/types';
import type { ParkingLookup, ParkingRateService } from './ParkingRateService';

/**
 * «adapter» that finds the nearest seeded carpark within the search radius of the destination.
 */
export class TableParkingAdapter implements ParkingRateService {
  readonly name = 'table';

  constructor(
    private readonly prisma: PrismaClient,
    private readonly radiusKm: number,
  ) {}

  async nearest(
    destination: LatLng,
    vehicleClass: VehicleClass = 'PASSENGER_CAR_LGV_TAXI',
  ): Promise<ParkingLookup> {
    const motorcycle = vehicleClass === 'MOTORCYCLE';
    let rows;
    try {
      rows = await this.prisma.parkingRate.findMany({
        where: motorcycle
          ? { vehicleClass: 'MOTORCYCLE' }
          : { vehicleClass: { not: 'MOTORCYCLE' } },
      });
    } catch {
      return {
        ok: false,
        kind: 'SERVICE_FAILURE',
        reason: 'The parking rate table could not be read',
      };
    }
    let best: { row: (typeof rows)[number]; distanceKm: number } | null = null;
    for (const row of rows) {
      const distanceKm = haversineKm(destination, { lat: row.lat, lng: row.lng });
      if (distanceKm <= this.radiusKm && (!best || distanceKm < best.distanceKm))
        best = { row, distanceKm };
    }
    if (!best) {
      return {
        ok: false,
        kind: 'NO_DATA',
        reason: motorcycle
          ? `No motorcycle parking rate is recorded within ${this.radiusKm} km of the destination`
          : `No carpark rate is recorded within ${this.radiusKm} km of the destination`,
      };
    }
    const { row, distanceKm } = best;
    return {
      ok: true,
      rate: {
        id: row.id,
        carparkName: row.carparkName,
        lat: row.lat,
        lng: row.lng,
        ratePerPeriod: row.ratePerPeriod.toString(),
        chargingPeriodMin: row.chargingPeriodMin,
        roundingRule: row.roundingRule,
        source: row.source,
        recordedAt: row.recordedAt,
        distanceKm,
      },
    };
  }
}
