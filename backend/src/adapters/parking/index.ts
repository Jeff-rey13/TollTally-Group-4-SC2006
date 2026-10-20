import type { PrismaClient } from '@prisma/client';
import type { Config } from '../../config';
import { MockParkingAdapter } from './MockParkingAdapter';
import type { ParkingRateService } from './ParkingRateService';
import { TableParkingAdapter } from './TableParkingAdapter';

/**
 * Factory that picks the parking implementation from PARKING_PROVIDER (table or mock).
 */
export function buildParkingService(config: Config, prisma: PrismaClient): ParkingRateService {
  if (config.PARKING_PROVIDER === 'mock') return new MockParkingAdapter('fixed');
  return new TableParkingAdapter(prisma, config.PARKING_SEARCH_RADIUS_KM);
}

export * from './ParkingRateService';
export { MockParkingAdapter } from './MockParkingAdapter';
export { TableParkingAdapter } from './TableParkingAdapter';
