import type { ComponentType } from '@tolltally/shared';
import { Decimal, HUNDRED, ONE, ZERO } from './money';

export interface ComponentResult {
  type: ComponentType;
  isReturnLeg: boolean;
  amount: Decimal | null;
  lower: Decimal | null;
  upper: Decimal | null;
  isAvailable: boolean;
  unavailableReason: string | null;
  exclusions: string[];
}

export interface UnavailableComponent {
  type: ComponentType;
  isReturnLeg: boolean;
  reason: string;
}

export interface CombinedEstimate {
  total: Decimal;
  lower: Decimal;
  upper: Decimal | null;
  isLowerBound: boolean;
  unavailable: UnavailableComponent[];
  exclusions: string[];
}

/**
 * Sums the available components and their bounds. If any component is unavailable, the total
 * is a lower bound and no complete upper bound is claimed (FR-EST-09, FR-EST-11, NFR-ACCY-04).
 */
export function combine(components: ComponentResult[]): CombinedEstimate {
  let total = ZERO;
  let lower = ZERO;
  let upper = ZERO;
  const unavailable: UnavailableComponent[] = [];
  const exclusions: string[] = [];
  for (const c of components) {
    if (!c.isAvailable || c.amount === null) {
      unavailable.push({
        type: c.type,
        isReturnLeg: c.isReturnLeg,
        reason: c.unavailableReason ?? 'Unavailable',
      });
      continue;
    }
    total = total.plus(c.amount);
    lower = lower.plus(c.lower ?? c.amount);
    upper = upper.plus(c.upper ?? c.amount);
    exclusions.push(...c.exclusions);
  }
  const isLowerBound = unavailable.length > 0 || exclusions.length > 0;
  return {
    total,
    lower,
    upper: isLowerBound ? null : upper,
    isLowerBound,
    unavailable,
    exclusions,
  };
}

/**
 * A plus-or-minus percentage range around a value, used for the fuel component.
 */
export function symmetricRange(
  amount: Decimal,
  percent: number,
): { lower: Decimal; upper: Decimal } {
  const factor = new Decimal(String(percent)).div(HUNDRED);
  return { lower: amount.times(ONE.minus(factor)), upper: amount.times(ONE.plus(factor)) };
}
