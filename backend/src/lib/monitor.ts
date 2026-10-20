import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { TrafficIncidentService, WeatherService } from '../adapters/conditions';
import type { RoutingService } from '../adapters/routing';
import { ExternalServiceError } from './errors';
import type { Mailer } from './mailer';

/**
 * Endpoint label for each time the app is opened in a browser tab. The app asks /api/health?app=1
 * once when it starts; uptime monitors call /api/health without it and are not counted.
 */
export const APP_OPEN_ENDPOINT = 'APP OPEN';
/** The overview screen polls itself; counting that would make an idle site look busy. */
const NOT_COUNTED = new Set(['GET /api/admin/overview']);
/** Endpoint label for API paths that matched no route, so scans cannot create endless rows. */
export const UNKNOWN_API_ENDPOINT = 'API (unknown path)';

export type MonitoredService = 'routing' | 'mail' | 'traffic' | 'weather';

export interface ServiceStatus {
  calls: number;
  failures: number;
  lastOkAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  lastMs: number | null;
  /** Times of recent failures, kept for an hour, to show a failure count for the last hour. */
  recentFailures: Date[];
}

interface Bucket {
  hour: Date;
  endpoint: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  totalMs: number;
  maxMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const ID_SEGMENT = /^(?:[a-z0-9]{20,}|\d+)$/i;

function hourOf(at: Date): Date {
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}

/** "/api/trips/ckx.../estimate?x=1" becomes "/api/trips/:id/estimate". */
export function normalisePath(url: string): string {
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return String(err).slice(0, 300);
}

/**
 * Counts requests per hour and endpoint for the administrator's overview, and remembers how the
 * last calls to outside services went. Counts are kept in memory and written to the TrafficHour
 * table once a minute. Nothing about who made a request is recorded.
 */
export class Monitor {
  readonly startedAt = new Date();
  private pending = new Map<string, Bucket>();
  private services = new Map<MonitoredService, ServiceStatus>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly flushEveryMs = 60 * 1000,
  ) {}

  /** Starts the periodic write. The timer does not keep the process alive. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((err: unknown) =>
        console.error('[monitor] could not save traffic counts:', messageOf(err)),
      );
    }, this.flushEveryMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Express middleware that counts each finished request. */
  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const started = process.hrtime.bigint();
      res.on('finish', () => {
        const endpoint = this.endpointFor(req, res);
        if (!endpoint) return;
        const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
        this.record(endpoint, res.statusCode, ms);
      });
      next();
    };
  }

  private endpointFor(req: Request, res: Response): string | null {
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/api/')) return null;
    if (path === '/api/health') return req.query.app ? APP_OPEN_ENDPOINT : null;
    if (res.statusCode === 404 && !req.route) return UNKNOWN_API_ENDPOINT;
    const endpoint = `${req.method} ${normalisePath(path)}`;
    return NOT_COUNTED.has(endpoint) ? null : endpoint;
  }

  /** Adds one request to the current hour's counts. */
  record(endpoint: string, status: number, ms: number, at = new Date()): void {
    const hour = hourOf(at);
    const key = `${hour.toISOString()} ${endpoint}`;
    let bucket = this.pending.get(key);
    if (!bucket) {
      bucket = {
        hour,
        endpoint,
        requests: 0,
        clientErrors: 0,
        serverErrors: 0,
        rateLimited: 0,
        totalMs: 0,
        maxMs: 0,
      };
      this.pending.set(key, bucket);
    }
    bucket.requests += 1;
    if (status === 429) bucket.rateLimited += 1;
    else if (status >= 500) bucket.serverErrors += 1;
    else if (status >= 400) bucket.clientErrors += 1;
    const whole = Math.max(0, Math.round(ms));
    bucket.totalMs += whole;
    bucket.maxMs = Math.max(bucket.maxMs, whole);
  }

  /** Writes the counts gathered since the last write. Safe to call at any time. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(() => this.writePending());
    return this.flushing;
  }

  private async writePending(): Promise<void> {
    if (!this.pending.size) return;
    const buckets = [...this.pending.values()];
    this.pending = new Map();
    for (const b of buckets) {
      const where = { hour_endpoint: { hour: b.hour, endpoint: b.endpoint } };
      try {
        const existing = await this.prisma.trafficHour.findUnique({ where });
        await this.prisma.trafficHour.upsert({
          where,
          create: { ...b },
          update: {
            requests: { increment: b.requests },
            clientErrors: { increment: b.clientErrors },
            serverErrors: { increment: b.serverErrors },
            rateLimited: { increment: b.rateLimited },
            totalMs: { increment: b.totalMs },
            maxMs: Math.max(existing?.maxMs ?? 0, b.maxMs),
          },
        });
      } catch (err) {
        console.error('[monitor] could not save traffic counts:', messageOf(err));
      }
    }
  }

  /** Remembers the outcome of a call to an outside service. */
  recordCall(service: MonitoredService, ok: boolean, ms: number, error?: unknown): void {
    const now = new Date();
    const s = this.serviceStatus(service);
    s.calls += 1;
    s.lastMs = Math.round(ms);
    if (ok) {
      s.lastOkAt = now;
    } else {
      s.failures += 1;
      s.lastFailureAt = now;
      s.lastError = messageOf(error);
      s.recentFailures.push(now);
    }
    s.recentFailures = s.recentFailures.filter((t) => now.getTime() - t.getTime() <= HOUR_MS);
  }

  serviceStatus(service: MonitoredService): ServiceStatus {
    let s = this.services.get(service);
    if (!s) {
      s = {
        calls: 0,
        failures: 0,
        lastOkAt: null,
        lastFailureAt: null,
        lastError: null,
        lastMs: null,
        recentFailures: [],
      };
      this.services.set(service, s);
    }
    const now = Date.now();
    s.recentFailures = s.recentFailures.filter((t) => now - t.getTime() <= HOUR_MS);
    return s;
  }

  /**
   * Times a call to an outside service and keeps its outcome. Only provider failures count
   * against the service; "no route found" and similar answers are the provider working normally.
   */
  private tracker(service: MonitoredService, anyErrorFails = false) {
    return async <T>(call: () => Promise<T>): Promise<T> => {
      const started = Date.now();
      try {
        const result = await call();
        this.recordCall(service, true, Date.now() - started);
        return result;
      } catch (err) {
        const failed = anyErrorFails || err instanceof ExternalServiceError;
        this.recordCall(service, !failed, Date.now() - started, failed ? err : undefined);
        throw err;
      }
    };
  }

  /** Wraps a routing provider so every search and route call is timed and its outcome kept. */
  trackRouting(inner: RoutingService): RoutingService {
    const track = this.tracker('routing');
    return {
      get name() {
        return inner.name;
      },
      search: (query) => track(() => inner.search(query)),
      route: (request) => track(() => inner.route(request)),
      alternatives: (request, max) => track(() => inner.alternatives(request, max)),
    };
  }

  /** Wraps a traffic incident source so its failures show on the overview. */
  trackTraffic(inner: TrafficIncidentService): TrafficIncidentService {
    const track = this.tracker('traffic', true);
    return { name: inner.name, incidents: () => track(() => inner.incidents()) };
  }

  /** Wraps a weather source so its failures show on the overview. */
  trackWeather(inner: WeatherService): WeatherService {
    const track = this.tracker('weather', true);
    return {
      name: inner.name,
      twoHour: () => track(() => inner.twoHour()),
      daily: () => track(() => inner.daily()),
    };
  }

  /** Wraps a mailer so delivery failures show on the overview. */
  trackMail(inner: Mailer): Mailer {
    return {
      delivers: inner.delivers,
      verify: inner.verify?.bind(inner),
      send: async (message) => {
        const started = Date.now();
        try {
          await inner.send(message);
          this.recordCall('mail', true, Date.now() - started);
        } catch (err) {
          this.recordCall('mail', false, Date.now() - started, err);
          throw err;
        }
      },
    };
  }
}
