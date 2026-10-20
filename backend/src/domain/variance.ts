import { Decimal, HUNDRED } from './money';

export type VarianceResult =
  | { status: 'OK'; absolute: Decimal; percent: Decimal | null }
  | { status: 'NOT_LOGGED' }
  | { status: 'NOT_APPLICABLE' };

/**
 * Absolute and percentage variance of an actual amount against its estimate, only when both exist (FR-REC-05).
 */
export function variance(estimated: Decimal | null, actual: Decimal | null): VarianceResult {
  if (actual === null) return { status: 'NOT_LOGGED' };
  if (estimated === null) return { status: 'NOT_APPLICABLE' };
  const absolute = actual.minus(estimated);
  const percent = estimated.gt(0) ? absolute.div(estimated).times(HUNDRED) : null;
  return { status: 'OK', absolute, percent };
}
