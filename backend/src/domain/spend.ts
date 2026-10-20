import { Decimal, sum } from './money';

export interface LoggedTrip {
  actualTotal: Decimal;
  varianceAbsolute: Decimal | null;
}

export interface SpendAggregate {
  total: Decimal;
  varianceTotal: Decimal | null;
  count: number;
}

/**
 * Totals logged actual spend and variance over a period. Unlogged trips are excluded (FR-REC-08).
 */
export function aggregateSpend(logs: LoggedTrip[]): SpendAggregate {
  const withVariance = logs.filter((l) => l.varianceAbsolute !== null);
  return {
    total: sum(logs.map((l) => l.actualTotal)),
    varianceTotal: withVariance.length
      ? sum(withVariance.map((l) => l.varianceAbsolute as Decimal))
      : null,
    count: logs.length,
  };
}
