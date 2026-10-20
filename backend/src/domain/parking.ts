import { Decimal, ZERO } from './money';

export type RoundingRule = 'CEIL' | 'FLOOR' | 'NEAREST';

export function normaliseRoundingRule(rule: string | null | undefined): RoundingRule {
  const upper = (rule ?? '').toUpperCase();
  return upper === 'FLOOR' || upper === 'NEAREST' ? upper : 'CEIL';
}

export function parkingPeriods(
  durationMin: number,
  chargingPeriodMin: number,
  rule: RoundingRule = 'CEIL',
): number {
  if (durationMin <= 0 || chargingPeriodMin <= 0) return 0;
  const exact = durationMin / chargingPeriodMin;
  switch (rule) {
    case 'FLOOR':
      return Math.floor(exact);
    case 'NEAREST':
      return Math.round(exact);
    default:
      return Math.ceil(exact);
  }
}

export interface ParkingInput {
  durationMin: number;
  ratePerPeriod: Decimal;
  chargingPeriodMin: number;
  roundingRule?: string | null;
}

/**
 * Parking cost = charging periods x rate, rounding part-periods by the carpark's rule (FR-EST-07).
 */
export function parkingCost(input: ParkingInput): { periods: number; cost: Decimal } {
  if (input.durationMin <= 0) return { periods: 0, cost: ZERO };
  const periods = parkingPeriods(
    input.durationMin,
    input.chargingPeriodMin,
    normaliseRoundingRule(input.roundingRule),
  );
  return { periods, cost: input.ratePerPeriod.times(periods) };
}
