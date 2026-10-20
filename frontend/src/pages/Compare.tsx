import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { COMPONENT_LABELS, CURRENT_ROUTE_OPTION_ID } from '@tolltally/shared';
import { describeError } from '../api/client';
import { tripsApi } from '../api/endpoints';
import { Alert, Loading, Money, Page, PageHeader, Range } from '../components/ui';
import { ComponentIcon, IconRefresh } from '../components/icons';
import { useAsync } from '../hooks/useAsync';
import { formatDuration, sgd } from '../lib/format';

/**
 * «boundary» RouteComparisonUI (UC-11).
 */
export function Compare() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => tripsApi.compareRoutes(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(optionId: string) {
    setBusy(optionId);
    setMessage(null);
    try {
      await tripsApi.chooseRoute(id, optionId);
      navigate(`/app/trips/${id}`);
    } catch (err) {
      setMessage(describeError(err).message);
      setBusy(null);
    }
  }

  return (
    <Page>
      <PageHeader
        back={{ to: `/app/trips/${id}`, label: 'Back to estimate' }}
        title="Compare routes"
        lede="Each option is priced with the same fuel, ERP and parking rules. The route you take is your choice."
        actions={
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || busy !== null}
            onClick={reload}
          >
            <IconRefresh className="h-4.5 w-4.5" />
            Refresh comparison
          </button>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert kind="error">{message}</Alert>
        </div>
      )}
      {loading ? (
        <Loading what="Pricing route options" />
      ) : error || !data ? (
        <Alert kind="error">{error ?? 'Comparison failed'}</Alert>
      ) : (
        <>
          <div className="mb-5">
            <Alert kind={data.indistinguishable || data.noAlternatives ? 'warning' : 'info'}>
              {data.message}
            </Alert>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.options.map((o, index) => (
              <section
                key={o.id}
                aria-labelledby={`route-option-${index}`}
                className={`card flex flex-col gap-4 ${o.isCheapest ? 'border-mint-deep shadow-[0_0_0_1.5px_var(--color-mint-deep),0_12px_32px_rgb(11_107_79/0.14)]' : ''}`}
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 id={`route-option-${index}`} className="text-lg font-extrabold">
                      {o.label}
                    </h2>
                    <div className="flex flex-wrap gap-1">
                      {o.isCheapest && <span className="badge-mint">Lowest complete total</span>}
                      {o.isIndistinguishable && (
                        <span className="badge-amber">Indistinguishable on cost</span>
                      )}
                      {!o.isComplete && <span className="badge-red">Not fully priced</span>}
                    </div>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {o.distanceKm} km, about {formatDuration(o.drivingTimeSec)}
                  </p>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <p className="text-[2rem] leading-none font-black tracking-tight">
                    {o.isComplete ? '' : 'At least '}
                    <Money value={o.total} />
                  </p>
                  <p className="text-sm text-muted">
                    Range <Range lower={o.lowerBound} upper={o.upperBound} />
                  </p>
                </div>
                <ul className="grid gap-2 border-t border-line pt-3 text-sm">
                  {o.components.map((c) => (
                    <li key={c.type} className="flex items-center gap-3">
                      <ComponentIcon type={c.type} />
                      <span className="flex-1">{COMPONENT_LABELS[c.type]}</span>
                      <span className="font-bold">
                        {c.amount === null ? 'unavailable' : sgd(c.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {o.exclusionReason && <p className="text-sm text-red-700">{o.exclusionReason}</p>}
                <div className="mt-auto">
                  {o.id === CURRENT_ROUTE_OPTION_ID ? (
                    <p className="flex min-h-11 items-center justify-center rounded-control bg-tool px-3 text-center text-sm font-bold text-muted">
                      This is the route in your estimate
                    </p>
                  ) : (
                    <button
                      type="button"
                      className={`${o.isCheapest ? 'btn-primary' : 'btn-secondary'} w-full`}
                      disabled={busy !== null}
                      onClick={() => choose(o.id)}
                    >
                      {busy === o.id ? 'Applying…' : 'Use this route'}
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
