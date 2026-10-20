export interface Timing {
  durationMs: number;
  budgetMs: number;
  withinBudget: boolean;
}

export function startTimer(): () => number {
  const started = performance.now();
  return () => Math.round(performance.now() - started);
}

/**
 * Reports a measured duration against its performance budget (NFR-PER-01, NFR-PER-02).
 */
export function timing(durationMs: number, budgetMs: number, label: string): Timing {
  const withinBudget = durationMs <= budgetMs;
  if (!withinBudget) {
    console.warn(`[budget] ${label} took ${durationMs} ms, over its ${budgetMs} ms budget`);
  }
  return { durationMs, budgetMs, withinBudget };
}
