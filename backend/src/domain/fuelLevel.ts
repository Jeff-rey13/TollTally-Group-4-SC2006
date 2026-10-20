import type { FuelLevelUnit } from '@tolltally/shared';
import { Decimal, HUNDRED } from './money';

/**
 * Converts a fuel level entered in litres, as a tank fraction or as a percentage into litres (FR-REN-02).
 */
export function toLitres(value: Decimal, unit: FuelLevelUnit, tankCapacityL: Decimal): Decimal {
  switch (unit) {
    case 'LITRES':
      return value;
    case 'TANK_FRACTION':
      return value.times(tankCapacityL);
    case 'PERCENT':
      return value.div(HUNDRED).times(tankCapacityL);
  }
}

/**
 * Converts litres back into the unit the Renter used (FR-REN-06).
 */
export function fromLitres(litres: Decimal, unit: FuelLevelUnit, tankCapacityL: Decimal): Decimal {
  switch (unit) {
    case 'LITRES':
      return litres;
    case 'TANK_FRACTION':
      return litres.div(tankCapacityL);
    case 'PERCENT':
      return litres.div(tankCapacityL).times(HUNDRED);
  }
}
