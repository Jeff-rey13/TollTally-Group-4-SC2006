import { useEffect, useState, type ReactNode } from 'react';
import type { HealthCheckDto, HealthStatus } from '@tolltally/shared';
import { describeError } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import { IconCheck, IconInfo, IconRefresh, IconWarning } from '../../components/icons';
import { Alert, Page, PageHeader, Skeleton } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatSgDate, formatTime } from '../../lib/format';

const REFRESH_MS = 30_000;
const number = new Intl.NumberFormat('en-SG');
const shortDay = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return shortDay.format(new Date(Date.UTC(y, m - 1, d)));
}

const STATUS: Record<
  HealthStatus,
  { label: string; pill: string; Icon: (p: { className?: string }) => ReactNode }
> = {
  ok: { label: 'Working', pill: 'bg-mint-soft text-mint-darker border-[#bcdccb]', Icon: IconCheck },
  warning: {
    label: 'Check',
    pill: 'bg-amber-soft text-amber border-[#efd78f]',
    Icon: IconWarning,
  },
  down: { label: 'Down', pill: 'bg-red-50 text-red-800 border-red-200', Icon: IconWarning },
  off: { label: 'Not set up', pill: 'bg-tool text-muted border-line', Icon: IconInfo },
};

function StatusPill({ status }: { status: HealthStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${s.pill}`}
    >
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="card grid content-start gap-1 p-4 sm:p-5">
      <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="font-display text-[2.6rem] leading-none font-black tabular-nums">
        {number.format(value)}
      </p>
      {note && <p className="text-[14px] text-muted">{note}</p>}
    </div>
  );
}

interface Bar {
  key: string;
  label: string;
  value: number;
  /** Extra line for the tooltip and table, e.g. errors. */
  note?: string;
}

/**
 * Single-series bar chart drawn with plain elements, with a hover and keyboard tooltip on each
 * bar and the same numbers as a table for screen readers.
 */
function BarChart({
  title,
  unit,
  bars,
  tickEvery,
}: {
  title: string;
  /** Singular and plural, e.g. ['trip', 'trips']. */
  unit: [string, string];
  bars: Bar[];
  /** Label every n-th bar, counting back from the latest so today is always labelled. */
  tickEvery: number;
}) {
  const peak = Math.max(0, ...bars.map((b) => b.value));
  const max = Math.max(1, peak);
  const empty = peak === 0;
  const units = (n: number) => `${number.format(n)} ${n === 1 ? unit[0] : unit[1]}`;
  const [active, setActive] = useState<number | null>(null);
  let tipPosition = '-translate-x-1/2';
  if (active !== null && active < bars.length * 0.2) tipPosition = '-translate-x-[15%]';
  if (active !== null && active > bars.length * 0.8) tipPosition = '-translate-x-[85%]';
  return (
    <figure className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <figcaption className="font-display text-xl font-bold">{title}</figcaption>
        <span className="text-[13px] text-muted">{empty ? 'none yet' : `peak ${units(peak)}`}</span>
      </div>
      <div className="relative">
        <div
          aria-hidden="true"
          className="relative flex h-36 items-end gap-[2px] border-b border-line-strong"
          onMouseLeave={() => setActive(null)}
        >
          {bars.map((b, i) => (
            <div
              key={b.key}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setActive(i)}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${active === i ? 'bg-mint-darker' : 'bg-mint-deep'}`}
                style={{ height: b.value ? `${Math.max(3, (b.value / max) * 100)}%` : '0' }}
              />
            </div>
          ))}
          {empty && (
            <span className="absolute inset-0 grid place-items-center text-[14px] text-muted">
              Nothing recorded in this period
            </span>
          )}
        </div>
        {active !== null && !empty && (
          <div
            className={`pointer-events-none absolute -top-2 z-10 ${tipPosition} -translate-y-full rounded-control bg-ink px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white shadow-lg`}
            style={{ left: `${((active + 0.5) / bars.length) * 100}%` }}
          >
            <strong className="block">{bars[active].label}</strong>
            {units(bars[active].value)}
            {bars[active].note && <span className="block text-white/75">{bars[active].note}</span>}
          </div>
        )}
        <div aria-hidden="true" className="mt-1.5 flex text-[12px] text-muted">
          {bars.map((b, i) => (
            <span key={b.key} className="flex-1 text-center whitespace-nowrap">
              {(bars.length - 1 - i) % tickEvery === 0 ? b.label : ''}
            </span>
          ))}
        </div>
      </div>
      <details className="text-[14px]">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as table</summary>
        <table className="tbl mt-2">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col" className="text-right">
                {unit[1][0].toUpperCase() + unit[1].slice(1)}
              </th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td className="text-right tabular-nums">{number.format(b.value)}</td>
                <td>{b.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function HealthRow({ check }: { check: HealthCheckDto }) {
  return (
    <li className="grid gap-1.5 py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4">
      <div>
        <StatusPill status={check.status} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold">{check.label}</p>
        <p className="text-[14px] leading-relaxed wrap-anywhere text-muted">{check.detail}</p>
      </div>
      <p className="text-[13px] whitespace-nowrap text-muted sm:text-right">
        {check.latencyMs !== null && <span className="block">{check.latencyMs} ms</span>}
        {check.checkedAt && <span className="block">at {formatTime(check.checkedAt)}</span>}
      </p>
    </li>
  );
}

const OVERALL: Record<
  HealthStatus,
  { title: string; kind: 'success' | 'warning' | 'error' | 'info' }
> = {
  ok: { title: 'Everything is working.', kind: 'success' },
  warning: { title: 'Something needs a look.', kind: 'warning' },
  down: { title: 'Something is down.', kind: 'error' },
  off: { title: 'Some parts are not set up.', kind: 'info' },
};

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-label={title} className="card grid content-start gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * «boundary» AdminOverviewUI: how many people use TollTally, how much traffic the site gets and
 * whether each service it depends on is working. Refreshes every 30 seconds.
 */
export function AdminOverview() {
  const { data, error, reload, setData } = useAsync(() => adminApi.overview(), []);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function liveCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      setData(await adminApi.healthCheck());
    } catch (err) {
      setCheckError(describeError(err).message);
    } finally {
      setChecking(false);
    }
  }

  const o = data?.overview;
  const failing =
    o?.health.checks.filter((c) => c.status === 'down' || c.status === 'warning') ?? [];

  return (
    <Page>
      <PageHeader
        title="Overview"
        lede={
          o
            ? `Users, traffic and service health. Updated ${formatTime(o.generatedAt)}; refreshes every 30 seconds.`
            : 'Users, traffic and service health.'
        }
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={liveCheck}
            disabled={checking || !o}
          >
            <IconRefresh className="h-4.5 w-4.5" />
            {checking ? 'Checking services…' : 'Run live check'}
          </button>
        }
      />

      {error && !o && <Alert kind="error">{error}</Alert>}
      {checkError && (
        <div className="mb-4">
          <Alert kind="error">{checkError}</Alert>
        </div>
      )}

      {!o ? (
        <div className="grid gap-4" role="status" aria-label="Loading overview">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card grid gap-3 p-5">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ))}
          </div>
          <div className="card p-5">
            <Skeleton className="h-36 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <Alert kind={OVERALL[o.health.overall].kind}>
            <strong>{OVERALL[o.health.overall].title}</strong>{' '}
            {failing.length
              ? `Needs attention: ${failing.map((c) => c.label).join(', ')}.`
              : `All ${o.health.checks.length} checks passed.`}
          </Alert>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Drivers"
              value={o.users.drivers}
              note={`${o.users.newLast7Days} new this week, ${o.users.newLast30Days} in 30 days`}
            />
            <Stat
              label="Signed in now"
              value={o.users.signedInNow}
              note="Accounts with an open session"
            />
            <Stat
              label="Active this week"
              value={o.users.activeLast7Days}
              note="Drivers who planned a trip in 7 days"
            />
            <Stat
              label="Trips planned"
              value={o.usage.trips}
              note={`${o.usage.tripsLast24Hours} in 24 hours, ${o.usage.loggedTrips} with costs logged`}
            />
          </div>

          <Section
            title="Service health"
            aside={
              <span className="text-[13px] text-muted">
                {o.health.server.environment}, Node {o.health.server.nodeVersion},{' '}
                {o.health.server.memoryMb} MB memory
              </span>
            }
          >
            <ul className="divide-y divide-line">
              {o.health.checks.map((c) => (
                <HealthRow key={c.key} check={c} />
              ))}
            </ul>
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section
              title="Traffic, last 24 hours"
              aside={
                <span className="text-[13px] text-muted">
                  {o.traffic.since
                    ? `Counting since ${formatSgDate(o.traffic.since.slice(0, 10))}`
                    : 'No traffic recorded yet'}
                </span>
              }
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-3">
                {[
                  ['App opens', number.format(o.traffic.last24Hours.appOpens)],
                  ['API requests', number.format(o.traffic.last24Hours.requests)],
                  ['Average response', `${o.traffic.last24Hours.avgMs} ms`],
                  ['Server errors', number.format(o.traffic.last24Hours.serverErrors)],
                  ['Refused requests', number.format(o.traffic.last24Hours.clientErrors)],
                  ['Rate limited', number.format(o.traffic.last24Hours.rateLimited)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[13px] text-muted">{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <BarChart
                title="API requests per hour"
                unit={['request', 'requests']}
                tickEvery={6}
                bars={o.traffic.byHour.map((h) => ({
                  key: h.hour,
                  label: formatTime(h.hour),
                  value: h.requests,
                  note: `${h.appOpens} app opens${h.errors ? `, ${h.errors} server errors` : ''}`,
                }))}
              />
            </Section>

            <Section title="Last 14 days">
              <BarChart
                title="App opens per day"
                unit={['app open', 'app opens']}
                tickEvery={4}
                bars={o.traffic.byDay.map((d) => ({
                  key: d.date,
                  label: dayLabel(d.date),
                  value: d.appOpens,
                  note: `${d.requests} API requests${d.errors ? `, ${d.errors} server errors` : ''}`,
                }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <BarChart
                  title="New drivers"
                  unit={['sign-up', 'sign-ups']}
                  tickEvery={6}
                  bars={o.users.registrationsByDay.map((d) => ({
                    key: d.date,
                    label: dayLabel(d.date),
                    value: d.count,
                  }))}
                />
                <BarChart
                  title="Trips planned"
                  unit={['trip', 'trips']}
                  tickEvery={6}
                  bars={o.usage.tripsByDay.map((d) => ({
                    key: d.date,
                    label: dayLabel(d.date),
                    value: d.count,
                  }))}
                />
              </div>
            </Section>
          </div>

          <Section title="Busiest API endpoints, last 24 hours">
            {o.traffic.topEndpoints.length ? (
              <div className="overflow-x-auto rounded-control border border-line">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Endpoint</th>
                      <th scope="col" className="text-right">
                        Requests
                      </th>
                      <th scope="col" className="text-right">
                        Errors
                      </th>
                      <th scope="col" className="text-right">
                        Average
                      </th>
                      <th scope="col" className="text-right">
                        Slowest
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.traffic.topEndpoints.map((e) => (
                      <tr key={e.endpoint}>
                        <td className="font-mono text-[13px] whitespace-nowrap">{e.endpoint}</td>
                        <td className="text-right tabular-nums">{number.format(e.requests)}</td>
                        <td className="text-right tabular-nums">{number.format(e.errors)}</td>
                        <td className="text-right tabular-nums">{e.avgMs} ms</td>
                        <td className="text-right tabular-nums">{e.maxMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[15px] text-muted">No API requests in the last 24 hours.</p>
            )}
            <p className="text-[13px] text-muted">
              Counts are totals per hour. TollTally does not record who made a request or from
              where. Errors include refused requests such as wrong passwords and expired sessions.
            </p>
          </Section>
        </div>
      )}
    </Page>
  );
}
