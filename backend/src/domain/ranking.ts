import { Decimal } from './money';

export interface PricedRange {
  total: Decimal;
  lower: Decimal;
  upper: Decimal | null;
}

export interface PricedOption extends PricedRange {
  id: string;
}

export interface RouteComparison {
  cheapestId: string | null;
  indistinguishableIds: string[];
  rankedIds: string[];
}

/**
 * True when two fully priced ranges overlap, so the options are indistinguishable on cost (FR-OPT-04).
 */
export function rangesOverlap(a: PricedRange, b: PricedRange): boolean {
  if (a.upper === null || b.upper === null) return false;
  return a.lower.lte(b.upper) && b.lower.lte(a.upper);
}

/**
 * Ranks fully priced route options and marks the cheapest only if no other range overlaps it.
 * Never selects a route for the Driver (FR-OPT-03 to FR-OPT-05).
 */
export function compareRoutes(options: PricedOption[]): RouteComparison {
  const complete = options.filter((o) => o.upper !== null);
  if (complete.length === 0) return { cheapestId: null, indistinguishableIds: [], rankedIds: [] };
  const ranked = [...complete].sort((a, b) => a.total.comparedTo(b.total));
  const best = ranked[0];
  const overlapping = ranked.slice(1).filter((o) => rangesOverlap(best, o));
  if (overlapping.length > 0) {
    return {
      cheapestId: null,
      indistinguishableIds: [best.id, ...overlapping.map((o) => o.id)],
      rankedIds: ranked.map((o) => o.id),
    };
  }
  return { cheapestId: best.id, indistinguishableIds: [], rankedIds: ranked.map((o) => o.id) };
}

export interface PricedSlot extends PricedRange {
  time: Date;
}

export interface DepartureRecommendation {
  bestTime: Date | null;
  saving: Decimal | null;
  withinMargin: boolean;
  plannedIsCheapest: boolean;
  allIdentical: boolean;
}

/**
 * Recommends the cheapest fully priced departure slot and its saving against the planned time,
 * and flags a planned time that is already cheapest or a saving within the margin of error (FR-OPT-07, FR-OPT-08).
 */
export function recommendDeparture(
  slots: PricedSlot[],
  plannedTime: Date,
): DepartureRecommendation {
  const complete = slots.filter((s) => s.upper !== null);
  if (complete.length === 0) {
    return {
      bestTime: null,
      saving: null,
      withinMargin: false,
      plannedIsCheapest: false,
      allIdentical: false,
    };
  }
  const allIdentical = complete.every((s) => s.total.eq(complete[0].total));
  const planned = complete.find((s) => s.time.getTime() === plannedTime.getTime()) ?? null;
  let best = complete[0];
  for (const s of complete) if (s.total.lt(best.total)) best = s;
  if (planned && planned.total.eq(best.total)) best = planned;

  const saving = planned ? planned.total.minus(best.total) : null;
  const plannedIsCheapest = planned !== null && saving !== null && saving.lte(0);
  const width = (s: PricedSlot): Decimal => (s.upper as Decimal).minus(s.lower);
  const margin = planned ? Decimal.max(width(best), width(planned)) : width(best);
  const withinMargin = !plannedIsCheapest && saving !== null && saving.lt(margin);
  return { bestTime: best.time, saving, withinMargin, plannedIsCheapest, allIdentical };
}
