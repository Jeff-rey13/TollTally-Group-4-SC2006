import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  /** Label used in the bucket key, so separate limiters never share counts. */
  name: string;
  /** Length of the counting window in milliseconds. */
  windowMs: number;
  /** Requests allowed per key in one window. */
  max: number;
  /** Builds the key a request is counted under, such as the client address or the signed-in user. */
  key: (req: Request) => string;
  /** Message shown to the person when the limit is reached. */
  message?: string;
  /** When false the limiter does nothing (used by tests that create many accounts). */
  enabled?: boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 50_000;

/**
 * Fixed-window request limiter kept in memory. TollTally runs as one server process, so an
 * in-process count is enough to slow down password guessing, mass sign-ups and attempts to
 * use up the OneMap quota through the location search and estimate endpoints.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < options.windowMs && buckets.size < MAX_KEYS) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    // Still full after expiring old windows: drop the oldest entries rather than grow without limit.
    if (buckets.size >= MAX_KEYS) {
      const excess = buckets.size - MAX_KEYS + 1000;
      let removed = 0;
      for (const key of buckets.keys()) {
        if (removed++ >= excess) break;
        buckets.delete(key);
      }
    }
    lastSweep = now;
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.enabled === false) return next();
    const now = Date.now();
    sweep(now);
    const key = `${options.name}:${options.key(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message:
            options.message ??
            `Too many requests. Wait ${retryAfterSec > 90 ? `${Math.ceil(retryAfterSec / 60)} minutes` : `${retryAfterSec} seconds`} and try again.`,
          retryable: true,
        },
      });
      return;
    }
    next();
  };
}

/** The client address as Express sees it (behind one trusted proxy in production). */
export const byIp = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/** The signed-in user, falling back to the client address. */
export const byUser = (req: Request): string => req.session?.userId ?? byIp(req);

/** The client address together with the email being tried, so one account cannot be guessed at. */
export const byIpAndEmail = (req: Request): string => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return `${byIp(req)}|${typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : ''}`;
};
