import { Decimal, HUNDRED } from './money';

/**
 * Trip fuel volume in litres = distance (km) x consumption (L/100 km) / 100 (FR-EST-02).
 */
export function tripFuelVolume(distanceKm: Decimal, consumptionLPer100Km: Decimal): Decimal {
  return distanceKm.times(consumptionLPer100Km).div(HUNDRED);
}

/**
 * Trip fuel cost = volume (L) x price (SGD/L) (FR-EST-03).
 */
export function tripFuelCost(volumeL: Decimal, pricePerLitre: Decimal): Decimal {
  return volumeL.times(pricePerLitre);
}
