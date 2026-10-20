import { Decimal, ZERO } from './money';

export type TopUpOutcome = 'TOP_UP' | 'NONE_NEEDED' | 'REFUEL_EN_ROUTE';

export interface TopUpInput {
  pickUpL: Decimal;
  requiredReturnL: Decimal;
  tripFuelL: Decimal;
  pricePerLitre: Decimal;
}

export interface TopUpPlan {
  projectedReturnL: Decimal;
  shortfallL: Decimal;
  topUpL: Decimal;
  cost: Decimal;
  outcome: TopUpOutcome;
}

/**
 * Renter top-up maths (FR-REN-04, FR-REN-05, FR-REN-07):
 * projected = pick-up - trip fuel; shortfall = |projected| when negative;
 * top-up = max(0, required - projected); cost = top-up x price.
 */
export function planTopUp(input: TopUpInput): TopUpPlan {
  const projectedReturnL = input.pickUpL.minus(input.tripFuelL);
  const shortfallL = projectedReturnL.lt(0) ? projectedReturnL.abs() : ZERO;
  const topUpL = Decimal.max(ZERO, input.requiredReturnL.minus(projectedReturnL));
  const cost = topUpL.times(input.pricePerLitre);
  const outcome: TopUpOutcome = projectedReturnL.lt(0)
    ? 'REFUEL_EN_ROUTE'
    : topUpL.isZero()
      ? 'NONE_NEEDED'
      : 'TOP_UP';
  return { projectedReturnL, shortfallL, topUpL, cost, outcome };
}
