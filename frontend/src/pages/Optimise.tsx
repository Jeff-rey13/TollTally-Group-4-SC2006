import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { describeError } from '../api/client';
import { tripsApi } from '../api/endpoints';
import { Alert, Loading, Money, Page, PageHeader, Range } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime, formatTime } from '../lib/format';

/**
 * «boundary» DepartureOptimisationUI with the slot chart (UC-12).
 */
export function Optimise() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => tripsApi.optimiseDeparture(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function apply(time: string) {
    setBusy(time);
    setMessage(null);
    try {
      await tripsApi.applyDeparture(id, time);
      navigate(`/app/trips/${id}`);
    } catch (err) {
      setMessage(describeError(err).message);
      setBusy(null);
    }
  }

  const maximum = Math.max(...(data?.slots ?? []).map((slot) => Number(slot.total)), 1);

  return (
    <Page>
      <PageHeader
        back={{ to: `/app/trips/${id}`, label: 'Back to estimate' }}
        title="Optimise departure time"
        lede="Slots around your planned departure priced on the same route. Savings come mainly from ERP periods."
      />
      {message && (
        <div className="mb-4">
          <Alert kind="error">{message}</Alert>
        </div>
      )}
      {loading ? (
        <Loading what="Pricing departure slots" />
      ) : error || !data ? (
        <Alert kind="error">{error ?? 'Optimisation failed'}</Alert>
      ) : (
        <>
          <div className="mb-5">
            <Alert
              kind={
                data.plannedIsCheapest || data.allIdentical
                  ? 'info'
                  : data.withinMargin
                    ? 'warning'
                    : 'success'
              }
            >
              {data.message}
            </Alert>
          </div>
          <section className="card mb-5" aria-labelledby="slot-chart-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="slot-chart-title" className="text-lg font-extrabold">
                Cost by departure time
              </h2>
              <p className="flex gap-4 text-xs font-semibold text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-mint-deep" />
                  Lowest
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-ink" />
                  Planned
                </span>
              </p>
            </div>
            <p className="hint">
              Select a bar to apply that departure time. All times are in Singapore time.
            </p>
            <div className="mt-4 -mx-1 flex items-end gap-2 overflow-x-auto px-1 pb-2 sm:gap-3">
              {data.slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  className="flex min-w-12 flex-1 flex-col items-center gap-2 rounded-xl px-1 pt-1 pb-1.5 text-xs transition hover:bg-tool focus-visible:outline-2 focus-visible:outline-mint-deep disabled:cursor-default disabled:hover:bg-transparent"
                  disabled={busy !== null || s.isPlanned || !s.isComplete}
                  aria-label={`${formatDateTime(s.time)}, ${s.isComplete ? '' : 'at least '}SGD ${s.total}${s.isPlanned ? ', planned' : ''}${s.isRecommended ? ', lowest cost' : ''}`}
                  onClick={() => apply(s.time)}
                >
                  <span className="font-semibold">
                    {s.isComplete ? '' : '≥ '}${s.total}
                  </span>
                  <span
                    className={`w-full max-w-9 rounded-t-lg ${s.isRecommended ? 'bg-mint-deep' : s.isPlanned ? 'bg-ink' : 'bg-line-strong'}`}
                    style={{ height: `${Math.max(8, (Number(s.total) / maximum) * 120)}px` }}
                  />
                  <span>{formatTime(s.time)}</span>
                  <span className="min-h-4 font-bold">
                    {s.isPlanned ? 'Planned' : s.isRecommended ? 'Lowest' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="card p-0" aria-labelledby="slot-list-title">
            <h2 id="slot-list-title" className="px-5 pt-5 pb-2 text-lg font-extrabold">
              Departure slots
            </h2>
            <ul className="divide-y divide-line">
              {data.slots.map((s) => (
                <li
                  key={s.time}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${s.isRecommended ? 'bg-mint-soft/60' : ''}`}
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-bold">{formatDateTime(s.time)}</p>
                    <p className="text-sm text-muted">
                      Range <Range lower={s.lowerBound} upper={s.upperBound} />
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.isPlanned && <span className="badge-dark">Planned</span>}
                    {s.isRecommended && !s.isPlanned && (
                      <span className="badge-mint">Lowest cost</span>
                    )}
                  </div>
                  <p className="ml-auto text-right font-extrabold">
                    {s.isComplete ? '' : 'At least '}
                    <Money value={s.total} />
                  </p>
                  {s.isPlanned ? (
                    <div aria-hidden="true" className="hidden sm:block sm:w-32" />
                  ) : (
                    <div className="w-full text-right sm:w-32">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy !== null}
                        onClick={() => apply(s.time)}
                      >
                        {busy === s.time ? 'Applying…' : 'Depart then'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Page>
  );
}
