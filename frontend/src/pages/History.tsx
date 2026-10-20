import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { TRIP_STATUS_LABELS, historyQuerySchema } from '@tolltally/shared';
import { validate } from '../lib/form';
import { historyApi } from '../api/endpoints';
import { Alert, Field, Money, Page, PageHeader, SkeletonList } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime } from '../lib/format';

const ROW_COLUMNS =
  'xl:grid xl:grid-cols-[9.5rem_minmax(0,1fr)_7rem_7rem_8.5rem_6.5rem_10rem] xl:items-center xl:gap-4';

/**
 * «boundary» TripHistoryUI with the date filter and spend report (UC-16).
 */
export function History() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data, loading, error } = useAsync(
    () => historyApi.list(applied.from || undefined, applied.to || undefined),
    [applied.from, applied.to],
  );

  function onFilter(e: FormEvent) {
    e.preventDefault();
    const result = validate(historyQuerySchema, { from, to });
    setErrors(result.errors);
    if (!result.data) return;
    setApplied({ from, to });
  }

  return (
    <Page>
      <PageHeader
        title="Trip history"
        lede="Saved estimates, the actual costs you logged, and the spend over a period. Only logged trips count as spend."
      />
      <form
        className="card mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={onFilter}
      >
        <Field id="from" label="From date" error={errors.from}>
          <input
            id="from"
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field id="to" label="To date" error={errors.to}>
          <input
            id="to"
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn-secondary min-h-12">
          Apply
        </button>
      </form>
      {loading ? (
        <SkeletonList what="Loading your trip history" />
      ) : error || !data ? (
        <Alert kind="error">{error ?? 'History unavailable'}</Alert>
      ) : (
        <>
          {data.report ? (
            <section
              aria-label="Spend report"
              className="mb-5 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3"
            >
              <div className="bg-ink p-5 text-white">
                <p className="text-[13px] font-semibold text-white/75">Actual spend</p>
                <p className="mt-1 text-[2rem] leading-none font-black tracking-tight">
                  <Money value={data.report.actualSpend} />
                </p>
              </div>
              <div className="bg-white p-5">
                <p className="text-[13px] font-semibold text-muted">Trips logged</p>
                <p className="mt-1 text-[2rem] leading-none font-black tracking-tight">
                  {data.report.loggedCount} of {data.report.tripCount}
                </p>
              </div>
              <div className="bg-white p-5">
                <p className="text-[13px] font-semibold text-muted">Variance against estimates</p>
                <p className="mt-1 text-[2rem] leading-none font-black tracking-tight">
                  <Money value={data.report.varianceTotal} />
                </p>
              </div>
            </section>
          ) : (
            data.message && (
              <div className="mb-5">
                <Alert kind="info">{data.message}</Alert>
              </div>
            )
          )}
          {data.trips.length > 0 && (
            <section aria-labelledby="trips-title" className="card p-0">
              <h2 id="trips-title" className="px-5 pt-5 pb-3 text-lg font-extrabold">
                Trips
              </h2>
              <div
                aria-hidden="true"
                className={`hidden border-y border-line bg-sand px-5 py-2.5 text-[13px] font-semibold text-muted ${ROW_COLUMNS}`}
              >
                <span>Departure</span>
                <span>Trip</span>
                <span>Estimated</span>
                <span>Actual</span>
                <span>Variance</span>
                <span>Status</span>
                <span />
              </div>
              <ul className="divide-y divide-line border-t border-line xl:border-t-0">
                {data.trips.map((t) => (
                  <li key={t.id} className={`grid gap-3 px-5 py-4 ${ROW_COLUMNS}`}>
                    <div className="flex items-center justify-between gap-2 xl:block">
                      <p className="text-sm text-muted">{formatDateTime(t.departureTime)}</p>
                      <span className="badge-grey xl:hidden">{TRIP_STATUS_LABELS[t.status]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold wrap-anywhere">
                        {t.origin} to {t.destination}
                      </p>
                      <p className="text-xs text-muted">{t.vehicleName}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 rounded-xl bg-sand p-3 xl:contents">
                      <div className="min-w-0">
                        <p className="text-xs text-muted xl:sr-only">Estimated</p>
                        <p className="font-semibold">
                          {t.totalIsLowerBound ? 'At least ' : ''}
                          <Money value={t.estimatedTotal} />
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted xl:sr-only">Actual</p>
                        <p className="font-semibold">
                          {t.log ? (
                            <Money value={t.log.actualTotal} />
                          ) : (
                            <span className="badge-grey">Not logged</span>
                          )}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted xl:sr-only">Variance</p>
                        <p className="font-semibold">
                          {t.log?.varianceAbsolute
                            ? `${t.log.varianceAbsolute}${t.log.variancePercent ? ` (${t.log.variancePercent}%)` : ''}`
                            : 'n/a'}
                        </p>
                      </div>
                    </div>
                    <p className="hidden xl:block">
                      <span className="badge-grey">{TRIP_STATUS_LABELS[t.status]}</span>
                    </p>
                    <div className="flex flex-wrap gap-1 xl:justify-end">
                      <Link to={`/app/trips/${t.id}`} className="btn-ghost">
                        View
                      </Link>
                      <Link to={`/app/history/${t.id}/log`} className="btn-ghost">
                        {t.log ? 'Edit costs' : 'Log costs'}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
