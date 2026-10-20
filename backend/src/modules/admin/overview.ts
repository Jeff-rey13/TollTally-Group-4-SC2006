import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  type AdminOverviewDto,
  type DayCountDto,
  type HealthCheckDto,
  type HealthStatus,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { formatSgTime, sgDateString, sgParts } from '../../domain/time';
import type { Mailer } from '../../lib/mailer';
import { Monitor, APP_OPEN_ENDPOINT, type MonitoredService } from '../../lib/monitor';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CHART_DAYS = 14;
/** A fuel price older than this is flagged, since pump prices change every week or two. */
const FUEL_PRICE_STALE_DAYS = 7;

type OverviewDeps = AppDeps & { monitor: Monitor; mailer: Mailer };

/** The last `days` Singapore dates, oldest first, ending today. */
function lastDates(now: Date, days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--)
    dates.push(sgDateString(new Date(now.getTime() - i * DAY_MS)));
  return dates;
}

function countByDay(instants: Date[], dates: string[]): DayCountDto[] {
  const counts = new Map(dates.map((d) => [d, 0]));
  for (const at of instants) {
    const d = sgDateString(at);
    if (counts.has(d)) counts.set(d, counts.get(d)! + 1);
  }
  return dates.map((date) => ({ date, count: counts.get(date)! }));
}

export function formatDuration(totalSec: number): string {
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function ago(at: Date, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (sec < 60) return 'just now';
  return `${formatDuration(sec)} ago`;
}

function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

/**
 * Turns the remembered outcome of calls to an outside service into a check. A service that has
 * not been called since the server started is reported as set up, with no result yet.
 */
function fromCalls(
  monitor: Monitor,
  service: MonitoredService,
  base: Pick<HealthCheckDto, 'key' | 'label'>,
  idleDetail: string,
  now: Date,
): HealthCheckDto {
  const s = monitor.serviceStatus(service);
  const lastOk = s.lastOkAt?.getTime() ?? 0;
  const lastFail = s.lastFailureAt?.getTime() ?? 0;
  if (!s.calls)
    return { ...base, status: 'ok', detail: idleDetail, latencyMs: null, checkedAt: null };
  if (lastFail > lastOk) {
    return {
      ...base,
      status: 'down',
      detail: `The last call failed ${ago(s.lastFailureAt!, now)}: ${s.lastError ?? 'no details'}`,
      latencyMs: s.lastMs,
      checkedAt: s.lastFailureAt!.toISOString(),
    };
  }
  if (s.recentFailures.length) {
    const n = s.recentFailures.length;
    return {
      ...base,
      status: 'warning',
      detail: `${n} failed call${n === 1 ? '' : 's'} in the last hour; the latest call worked. Last error: ${s.lastError ?? 'no details'}`,
      latencyMs: s.lastMs,
      checkedAt: s.lastOkAt!.toISOString(),
    };
  }
  return {
    ...base,
    status: 'ok',
    detail: `Working. Last call ${ago(s.lastOkAt!, now)}, ${s.calls} call${s.calls === 1 ? '' : 's'} since the server started.`,
    latencyMs: s.lastMs,
    checkedAt: s.lastOkAt!.toISOString(),
  };
}

/** Health of an optional live-information source (traffic incidents or weather). */
function conditionCheck(
  monitor: Monitor,
  key: 'traffic' | 'weather',
  label: string,
  sourceName: string | null,
  demo: boolean,
  offDetail: string,
  now: Date,
): HealthCheckDto {
  if (!sourceName) {
    return { key, label, status: 'off', detail: offDetail, latencyMs: null, checkedAt: null };
  }
  const base = { key, label: `${label} (${sourceName})` };
  if (demo) {
    return {
      ...base,
      status: 'ok',
      detail: 'Demo mode: sample data is shown on estimates.',
      latencyMs: null,
      checkedAt: null,
    };
  }
  return fromCalls(
    monitor,
    key,
    base,
    'Set up. Not called since the server started; use Run live check to test it now.',
    now,
  );
}

async function healthChecks(deps: OverviewDeps, now: Date): Promise<AdminOverviewDto['health']> {
  const { prisma, config, monitor, mailer } = deps;
  const checks: HealthCheckDto[] = [];
  const uptimeSec = Math.round((now.getTime() - monitor.startedAt.getTime()) / 1000);

  checks.push({
    key: 'server',
    label: 'Web server',
    status: 'ok',
    detail: `Running for ${formatDuration(uptimeSec)}, since ${sgDateString(monitor.startedAt)} ${formatSgTime(monitor.startedAt)}.`,
    latencyMs: null,
    checkedAt: null,
  });

  const dbStarted = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - dbStarted;
    checks.push({
      key: 'database',
      label: 'Database',
      status: ms > 1000 ? 'warning' : 'ok',
      detail: ms > 1000 ? `Answering slowly (${ms} ms).` : 'Answering normally.',
      latencyMs: ms,
      checkedAt: now.toISOString(),
    });
  } catch (err) {
    checks.push({
      key: 'database',
      label: 'Database',
      status: 'down',
      detail: `Not answering: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: null,
      checkedAt: now.toISOString(),
    });
  }

  const routingBase = {
    key: 'routing' as const,
    label: `Routing and place search (${deps.routing.name})`,
  };
  if (config.ROUTING_PROVIDER === 'mock') {
    checks.push({
      ...routingBase,
      status: 'warning',
      detail:
        'Demo mode: routes and places are simulated. Set ROUTING_PROVIDER=onemap with a OneMap login for live routes.',
      latencyMs: null,
      checkedAt: null,
    });
  } else if (!config.ONEMAP_EMAIL || !config.ONEMAP_PASSWORD) {
    checks.push({
      ...routingBase,
      status: 'down',
      detail:
        'No OneMap login is set (ONEMAP_EMAIL and ONEMAP_PASSWORD), so every trip estimate fails.',
      latencyMs: null,
      checkedAt: null,
    });
  } else {
    checks.push(
      fromCalls(
        monitor,
        'routing',
        routingBase,
        'Login is set. No calls since the server started; use Run live check to test it now.',
        now,
      ),
    );
  }

  const mailBase = { key: 'mail' as const, label: 'Password reset email' };
  if (!mailer.delivers) {
    checks.push({
      ...mailBase,
      status: 'off',
      detail: 'Not set up: reset links are written to the server log instead of being emailed.',
      latencyMs: null,
      checkedAt: null,
    });
  } else {
    checks.push(
      fromCalls(
        monitor,
        'mail',
        mailBase,
        'Mail server is set. No emails sent since the server started; use Run live check to test the login.',
        now,
      ),
    );
  }

  checks.push(
    conditionCheck(
      monitor,
      'traffic',
      'Traffic incidents',
      deps.traffic?.name ?? null,
      config.ROUTING_PROVIDER === 'mock' || deps.traffic?.name === 'demo data',
      config.LTA_ACCOUNT_KEY
        ? 'Not set up: TRAFFIC_PROVIDER is off.'
        : 'Not set up: add your LTA account key (LTA_ACCOUNT_KEY) to show incidents on estimates.',
      now,
    ),
  );
  checks.push(
    conditionCheck(
      monitor,
      'weather',
      'Weather forecast',
      deps.weather?.name ?? null,
      deps.weather?.name === 'demo data',
      'Not set up: WEATHER_PROVIDER is off.',
      now,
    ),
  );

  const [gantries, activeRates, latestRate] = await Promise.all([
    prisma.chargePoint.count({ where: { isActive: true } }),
    prisma.erpRate.count({ where: { isWithdrawn: false, chargePoint: { isActive: true } } }),
    prisma.erpRate.findFirst({
      where: { isWithdrawn: false },
      orderBy: { effectiveDate: 'desc' },
      select: { effectiveDate: true },
    }),
  ]);
  checks.push({
    key: 'erp',
    label: 'ERP gantries and rates',
    status: gantries && activeRates ? 'ok' : 'down',
    detail:
      gantries && activeRates
        ? `${gantries} gantries with ${activeRates} rate periods; newest rates effective ${sgDateString(latestRate!.effectiveDate)}.`
        : 'No active gantries or rates, so every trip shows ERP as not priced.',
    latencyMs: null,
    checkedAt: null,
  });

  const prices = await Promise.all(
    FUEL_TYPES.map((fuelType) =>
      prisma.fuelPrice.findFirst({
        where: { fuelType, isWithdrawn: false },
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true },
      }),
    ),
  );
  const missing = FUEL_TYPES.filter((_, i) => !prices[i]).map((t) => FUEL_TYPE_LABELS[t]);
  const stale = FUEL_TYPES.map((t, i) => ({ t, p: prices[i] }))
    .filter(({ p }) => p && now.getTime() - p.recordedAt.getTime() > FUEL_PRICE_STALE_DAYS * DAY_MS)
    .map(
      ({ t, p }) =>
        `${FUEL_TYPE_LABELS[t]} (${Math.floor((now.getTime() - p!.recordedAt.getTime()) / DAY_MS)} days)`,
    );
  const newest = prices
    .filter((p): p is { recordedAt: Date } => Boolean(p))
    .reduce<Date | null>((a, p) => (!a || p.recordedAt > a ? p.recordedAt : a), null);
  checks.push({
    key: 'fuel',
    label: 'Fuel prices',
    status: missing.length ? 'down' : stale.length ? 'warning' : 'ok',
    detail: missing.length
      ? `No price for ${missing.join(', ')}; trips with that fuel cannot be priced.`
      : stale.length
        ? `Older than ${FUEL_PRICE_STALE_DAYS} days: ${stale.join(', ')}. Enter today's prices under Fuel prices.`
        : `All fuel types priced within the last ${FUEL_PRICE_STALE_DAYS} days; newest entered ${sgDateString(newest!)} ${formatSgTime(newest!)}.`,
    latencyMs: null,
    checkedAt: null,
  });

  const year = sgParts(now).year;
  const holidays = await prisma.publicHoliday.count({
    where: { date: { startsWith: `${year}-` } },
  });
  checks.push({
    key: 'holidays',
    label: 'Public holidays',
    status: holidays ? 'ok' : 'warning',
    detail: holidays
      ? `${holidays} public holidays loaded for ${year}.`
      : `No public holidays loaded for ${year}, so ERP is charged on holidays as on weekdays.`,
    latencyMs: null,
    checkedAt: null,
  });

  return {
    overall: worst(checks.map((c) => c.status)),
    checks,
    server: {
      startedAt: monitor.startedAt.toISOString(),
      uptimeSec,
      memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      nodeVersion: process.version,
      environment: config.NODE_ENV,
      routingProvider: deps.routing.name,
    },
  };
}

async function trafficSummary(deps: OverviewDeps, now: Date): Promise<AdminOverviewDto['traffic']> {
  const { prisma, monitor } = deps;
  await monitor.flush();
  const dates = lastDates(now, CHART_DAYS);
  const from = new Date(now.getTime() - (CHART_DAYS + 1) * DAY_MS);
  const [rows, first] = await Promise.all([
    prisma.trafficHour.findMany({ where: { hour: { gte: from } } }),
    prisma.trafficHour.findFirst({ orderBy: { hour: 'asc' }, select: { hour: true } }),
  ]);

  const currentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const hours = Array.from({ length: 24 }, (_, i) => currentHour - (23 - i) * HOUR_MS);
  const byHour = new Map(hours.map((h) => [h, { requests: 0, appOpens: 0, errors: 0 }]));
  const byDay = new Map(dates.map((d) => [d, { requests: 0, appOpens: 0, errors: 0 }]));
  const totals = {
    requests: 0,
    appOpens: 0,
    clientErrors: 0,
    serverErrors: 0,
    rateLimited: 0,
    totalMs: 0,
  };
  const endpoints = new Map<
    string,
    { requests: number; errors: number; totalMs: number; maxMs: number }
  >();

  for (const r of rows) {
    const isAppOpen = r.endpoint === APP_OPEN_ENDPOINT;
    const add = (slot: { requests: number; appOpens: number; errors: number } | undefined) => {
      if (!slot) return;
      if (isAppOpen) slot.appOpens += r.requests;
      else slot.requests += r.requests;
      slot.errors += r.serverErrors;
    };
    add(byDay.get(sgDateString(r.hour)));
    const t = r.hour.getTime();
    add(byHour.get(t));
    if (t < hours[0]) continue;
    if (isAppOpen) {
      totals.appOpens += r.requests;
      continue;
    }
    totals.requests += r.requests;
    totals.clientErrors += r.clientErrors;
    totals.serverErrors += r.serverErrors;
    totals.rateLimited += r.rateLimited;
    totals.totalMs += r.totalMs;
    const e = endpoints.get(r.endpoint) ?? { requests: 0, errors: 0, totalMs: 0, maxMs: 0 };
    e.requests += r.requests;
    e.errors += r.serverErrors + r.clientErrors + r.rateLimited;
    e.totalMs += r.totalMs;
    e.maxMs = Math.max(e.maxMs, r.maxMs);
    endpoints.set(r.endpoint, e);
  }

  return {
    since: first?.hour.toISOString() ?? null,
    last24Hours: {
      requests: totals.requests,
      appOpens: totals.appOpens,
      clientErrors: totals.clientErrors,
      serverErrors: totals.serverErrors,
      rateLimited: totals.rateLimited,
      avgMs: totals.requests ? Math.round(totals.totalMs / totals.requests) : 0,
    },
    byHour: hours.map((h) => ({ hour: new Date(h).toISOString(), ...byHour.get(h)! })),
    byDay: dates.map((date) => ({ date, ...byDay.get(date)! })),
    topEndpoints: [...endpoints.entries()]
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, 8)
      .map(([endpoint, e]) => ({
        endpoint,
        requests: e.requests,
        errors: e.errors,
        avgMs: Math.round(e.totalMs / e.requests),
        maxMs: e.maxMs,
      })),
  };
}

async function userSummary(deps: OverviewDeps, now: Date) {
  const { prisma } = deps;
  const dates = lastDates(now, CHART_DAYS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const chartFrom = new Date(now.getTime() - (CHART_DAYS + 1) * DAY_MS);
  const [
    drivers,
    administrators,
    newLast7Days,
    newLast30Days,
    sessions,
    activeDrivers,
    recentUsers,
    vehicles,
    trips,
    tripsLast24Hours,
    tripsLast7Days,
    loggedTrips,
    recentTrips,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'DRIVER' } }),
    prisma.user.count({ where: { role: 'ADMINISTRATOR' } }),
    prisma.user.count({ where: { role: 'DRIVER', registeredAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { role: 'DRIVER', registeredAt: { gte: monthAgo } } }),
    prisma.session.findMany({ where: { expiresAt: { gt: now } }, select: { data: true } }),
    prisma.trip.findMany({
      where: { createdAt: { gte: weekAgo } },
      distinct: ['driverId'],
      select: { driverId: true },
    }),
    prisma.user.findMany({
      where: { role: 'DRIVER', registeredAt: { gte: chartFrom } },
      select: { registeredAt: true },
    }),
    prisma.vehicleProfile.count(),
    prisma.trip.count(),
    prisma.trip.count({ where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    prisma.trip.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.tripLog.count(),
    prisma.trip.findMany({ where: { createdAt: { gte: chartFrom } }, select: { createdAt: true } }),
  ]);

  const signedIn = new Set<string>();
  for (const s of sessions) {
    try {
      const userId = (JSON.parse(s.data) as { userId?: string }).userId;
      if (userId) signedIn.add(userId);
    } catch {
      // A session that cannot be read belongs to nobody.
    }
  }

  return {
    users: {
      drivers,
      administrators,
      newLast7Days,
      newLast30Days,
      signedInNow: signedIn.size,
      activeLast7Days: activeDrivers.length,
      registrationsByDay: countByDay(
        recentUsers.map((u) => u.registeredAt),
        dates,
      ),
    },
    usage: {
      vehicles,
      trips,
      tripsLast24Hours,
      tripsLast7Days,
      loggedTrips,
      tripsByDay: countByDay(
        recentTrips.map((t) => t.createdAt),
        dates,
      ),
    },
  };
}

/** Everything the administrator's overview screen shows. */
export async function buildOverview(
  deps: OverviewDeps,
  now = new Date(),
): Promise<AdminOverviewDto> {
  const [people, traffic, health] = await Promise.all([
    userSummary(deps, now),
    trafficSummary(deps, now),
    healthChecks(deps, now),
  ]);
  return { generatedAt: now.toISOString(), ...people, traffic, health };
}

/**
 * Calls the outside services now (a short route and, when email is set up, a mail-server
 * sign-in) so their status reflects this moment, then returns the refreshed overview.
 */
export async function runLiveCheck(deps: OverviewDeps): Promise<AdminOverviewDto> {
  if (deps.config.ROUTING_PROVIDER !== 'mock') {
    try {
      // A short drive near Changi Airport. Routing needs the provider login, so this also proves
      // the login works. The routing provider is wrapped by the monitor, which records the outcome.
      await deps.routing.route({
        origin: { lat: 1.3644, lng: 103.9915 },
        destination: { lat: 1.3343, lng: 103.9625 },
        departureTime: new Date(),
      });
    } catch {
      // Recorded by the monitor; the overview shows the error.
    }
  }
  // The traffic and weather sources are wrapped by the monitor too. A cached answer counts as a
  // working call, since that is what estimates are being shown.
  await Promise.allSettled([
    deps.traffic && deps.traffic.name !== 'demo data' ? deps.traffic.incidents() : null,
    deps.weather && deps.weather.name !== 'demo data' ? deps.weather.twoHour() : null,
  ]);
  if (deps.mailer.delivers && deps.mailer.verify) {
    const started = Date.now();
    try {
      await deps.mailer.verify();
      deps.monitor.recordCall('mail', true, Date.now() - started);
    } catch (err) {
      deps.monitor.recordCall('mail', false, Date.now() - started, err);
    }
  }
  return buildOverview(deps);
}
