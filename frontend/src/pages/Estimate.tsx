import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  COMPONENT_LABELS,
  DAY_TYPE_LABELS,
  TRIP_STATUS_LABELS,
  type ComponentDto,
  type CrossingDto,
  type LegDto,
  type TripDto,
} from '@tolltally/shared';
import { describeError } from '../api/client';
import { tripsApi } from '../api/endpoints';
import { Alert, Loading, Money, Page, Range } from '../components/ui';
import { MapStage, StagePanel } from '../components/MapStage';
import { TripMap } from '../components/TripMap';
import { ConditionsCard } from '../components/ConditionsCard';
import { ComponentIcon, IconClock, IconDroplet, IconList, IconRoute } from '../components/icons';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime, formatDuration, formatTime, sgd } from '../lib/format';

/**
 * «boundary» EstimateResultsUI and CostDerivationUI (UC-06, UC-10), with Save trip (UC-14) and links to UC-11, UC-12 and UC-13.
 */
export function Estimate() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialError =
    (location.state as { estimateError?: { message: string } } | null)?.estimateError ?? null;
  const { data, loading, error, setData } = useAsync(() => tripsApi.get(id), [id]);
  const hasEstimate = Boolean(data?.trip.estimate);
  const departure = data?.trip.departureTime;
  const conditions = useAsync(
    () => (hasEstimate ? tripsApi.conditions(id) : Promise.resolve(null)),
    [id, hasEstimate, departure],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(initialError?.message ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDerivation, setShowDerivation] = useState(false);
  const derivationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (showDerivation) derivationRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [showDerivation]);

  async function act(name: string, action: () => Promise<{ trip: TripDto }>, done?: string) {
    setBusy(name);
    setMessage(null);
    setNotice(null);
    try {
      const res = await action();
      setData(res);
      if (done) setNotice(done);
    } catch (err) {
      setMessage(describeError(err).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <Page>
        <Loading what="Loading the estimate" />
      </Page>
    );
  if (error || !data)
    return (
      <Page>
        <Alert kind="error">{error ?? 'Trip not found'}</Alert>
      </Page>
    );
  const trip = data.trip;
  const est = trip.estimate;
  const saved = trip.status === 'SAVED' || trip.status === 'COMPLETED';
  const firstLeg = est?.legs[0] ?? null;
  const mapLeg = firstLeg && firstLeg.geometry.length >= 2 ? firstLeg : null;
  const gantryCount =
    firstLeg?.components.find((c) => c.type === 'ROAD_USAGE')?.crossings.length ?? 0;

  return (
    <div>
      <MapStage
        map={
          <TripMap
            leg={mapLeg}
            incidents={conditions.data?.conditions.incidents.items}
            origin={trip.origin}
            destination={trip.destination}
            label={
              mapLeg
                ? `Map of the route from ${trip.origin.name} to ${trip.destination.name}`
                : `Map of ${trip.origin.name} and ${trip.destination.name}`
            }
          />
        }
      >
        <StagePanel labelledBy="estimate-title">
          <div className="flex items-center justify-between gap-3">
            <h1 id="estimate-title" className="text-2xl font-black tracking-tight">
              Trip estimate
            </h1>
            <span className={saved ? 'badge-mint' : 'badge-grey'}>
              {TRIP_STATUS_LABELS[trip.status]}
            </span>
          </div>

          <div>
            <div className="grid gap-2 text-[17px] leading-snug font-extrabold">
              <p className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-ink" />
                <span className="sr-only">From </span>
                {trip.origin.name}
              </p>
              <p className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full bg-mint-deep" />
                <span className="sr-only">To </span>
                {trip.destination.name}
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Departing {formatDateTime(trip.departureTime)} with {trip.vehicle.displayName}
              {trip.isReturnTrip && trip.returnDepartureTime
                ? `, returning ${formatDateTime(trip.returnDepartureTime)}`
                : ''}
              .
            </p>
            {firstLeg && (
              <p className="mt-0.5 text-sm text-muted">
                {firstLeg.distanceKm} km · About {formatDuration(firstLeg.drivingTimeSec)}
                {gantryCount > 0 && ` · ${gantryCount} ERP gantr${gantryCount === 1 ? 'y' : 'ies'}`}
              </p>
            )}
          </div>

          {message && (
            <Alert kind="error">
              {message}{' '}
              {!saved && (
                <button
                  type="button"
                  className="font-bold underline"
                  disabled={busy !== null}
                  onClick={() => act('estimate', () => tripsApi.estimate(id))}
                >
                  Try the estimate again
                </button>
              )}
            </Alert>
          )}
          {notice && <Alert kind="success">{notice}</Alert>}
          {trip.status === 'SAVED' && (
            <p className="text-sm text-muted">
              This estimate is a saved snapshot and will not be recomputed.
            </p>
          )}

          {!est ? (
            <p className="rounded-2xl border border-line bg-tool p-4 text-sm">
              This trip is planned but has no estimate yet.{' '}
              <button
                type="button"
                className="font-bold text-mint-deep underline"
                disabled={busy !== null}
                onClick={() => act('estimate', () => tripsApi.estimate(id))}
              >
                {busy === 'estimate' ? 'Estimating…' : 'Run the estimate'}
              </button>
            </p>
          ) : (
            <div className="rounded-[18px] bg-ink p-4 text-white sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white/75">
                    {est.totalIsLowerBound ? 'Estimated total, lower bound' : 'Estimated total'}
                  </p>
                  <p className="mt-1 text-[2.25rem] leading-none font-black tracking-tight">
                    {est.totalIsLowerBound ? 'At least ' : ''}
                    <Money value={est.total} />
                  </p>
                </div>
                {!est.totalIsLowerBound && (
                  <p className="text-[13px] text-white/75 sm:text-right">
                    Range
                    <span className="block text-[15px] font-bold text-white">
                      <Range lower={est.lowerBound} upper={est.upperBound} />
                    </span>
                  </p>
                )}
              </div>
              {est.totalIsLowerBound && (
                <p className="mt-3">
                  <span className="badge-amber">Lower bound: a component could not be priced</span>
                </p>
              )}
            </div>
          )}

          {est && est.unavailable.length > 0 && (
            <Alert kind="warning">
              <p className="font-bold">Not included in the total</p>
              <ul className="mt-1 list-disc pl-5">
                {est.unavailable.map((u, i) => (
                  <li key={i}>
                    {COMPONENT_LABELS[u.type]}
                    {u.isReturnLeg ? ' (return leg)' : ''}: {u.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {est && est.exclusions.length > 0 && (
            <Alert kind="warning">
              <p className="font-bold">Charge points excluded from road usage</p>
              <ul className="mt-1 list-disc pl-5">
                {est.exclusions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2">
            {saved ? (
              <Link to={`/app/history/${id}/log`} className="btn-primary">
                Log actual costs
              </Link>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={!est || busy !== null}
                onClick={() => act('save', () => tripsApi.save(id), 'Trip saved to your history.')}
              >
                {busy === 'save' ? 'Saving…' : 'Save trip'}
              </button>
            )}
            <Link to="/app/plan" className="btn-secondary">
              Plan another
            </Link>
          </div>

          {est && (
            <nav aria-label="Trip tools" className="grid grid-cols-2 gap-2">
              {!saved && (
                <>
                  <Link to={`/app/trips/${id}/compare`} className="tool-btn">
                    <IconRoute className="h-4.5 w-4.5 text-mint-deep" />
                    Compare routes
                  </Link>
                  <Link to={`/app/trips/${id}/optimise`} className="tool-btn">
                    <IconClock className="h-4.5 w-4.5 text-mint-deep" />
                    Optimise departure
                  </Link>
                </>
              )}
              {trip.vehicle.ownershipType === 'RENTED' && (
                <Link to={`/app/trips/${id}/top-up`} className="tool-btn">
                  <IconDroplet className="h-4.5 w-4.5 text-mint-deep" />
                  Fuel top-up
                </Link>
              )}
              <button
                type="button"
                className="tool-btn"
                aria-expanded={showDerivation}
                aria-controls={showDerivation ? 'cost-derivation' : undefined}
                onClick={() => setShowDerivation((s) => !s)}
              >
                <IconList className="h-4.5 w-4.5 text-mint-deep" />
                {showDerivation ? 'Hide derivation' : 'View derivation'}
              </button>
            </nav>
          )}

          {est && (
            <ConditionsCard
              conditions={conditions.data?.conditions ?? null}
              loading={conditions.loading}
              error={conditions.error}
              isMotorcycle={trip.vehicle.vehicleClass === 'MOTORCYCLE'}
              onRefresh={conditions.reload}
            />
          )}

          {est?.legs.map((leg) => (
            <LegBreakdown
              key={String(leg.isReturnLeg)}
              leg={leg}
              showReturnLabel={trip.isReturnTrip}
            />
          ))}

          {est && est.assumptions.length > 0 && (
            <p className="text-sm leading-relaxed text-muted">
              <span className="font-bold text-ink">Assumptions:</span> {est.assumptions.join(' ')}
            </p>
          )}

          {trip.topUpPlan && (
            <section
              aria-labelledby="topup-summary-title"
              className="rounded-2xl border border-line p-4"
            >
              <h2 id="topup-summary-title" className="font-extrabold">
                Fuel top-up plan
              </h2>
              <p className="mt-1 text-sm">{trip.topUpPlan.message}</p>
              <p className="mt-1 text-sm">
                Buy {trip.topUpPlan.topUp.litres} L for{' '}
                <Money value={trip.topUpPlan.estimatedCost} />.{' '}
                <Link to={`/app/trips/${id}/top-up`} className="font-bold text-mint-deep underline">
                  Adjust
                </Link>
              </p>
            </section>
          )}

          {trip.log && (
            <section
              aria-labelledby="log-summary-title"
              className="rounded-2xl border border-line p-4"
            >
              <h2 id="log-summary-title" className="font-extrabold">
                Actual costs logged
              </h2>
              <p className="mt-1 text-sm">
                Actual total <Money value={trip.log.actualTotal} />
                {trip.log.totalVariance && (
                  <>
                    , variance {trip.log.totalVariance.absolute}
                    {trip.log.totalVariance.percent ? ` (${trip.log.totalVariance.percent}%)` : ''}
                  </>
                )}
                .{' '}
                <button
                  type="button"
                  className="font-bold text-mint-deep underline"
                  onClick={() => navigate(`/app/history/${id}/log`)}
                >
                  Edit
                </button>
              </p>
            </section>
          )}

          {mapLeg && (
            <p className="hint mt-0">
              {mapLeg.provider === 'mock'
                ? 'Demonstration route: the line is simulated, so it does not follow the roads.'
                : 'Driving route from OneMap. Turn-by-turn directions are not shown.'}
            </p>
          )}
        </StagePanel>
      </MapStage>

      {est && showDerivation && (
        <div ref={derivationRef} className="mx-auto max-w-7xl scroll-mt-4 px-4 py-8 sm:px-6">
          <Derivation legs={est.legs} rangeBasis={est.rangeBasis} calculatedAt={est.calculatedAt} />
        </div>
      )}
    </div>
  );
}

function LegBreakdown({ leg, showReturnLabel }: { leg: LegDto; showReturnLabel: boolean }) {
  const headingId = `leg-${leg.isReturnLeg ? 'return' : 'outbound'}-title`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
        <h2 id={headingId} className="text-base font-extrabold">
          {showReturnLabel ? (leg.isReturnLeg ? 'Return leg' : 'Outbound leg') : 'Trip'} at{' '}
          {formatTime(leg.departureTime)}
        </h2>
        <p className="text-sm text-muted">
          {leg.distanceKm} km, about {formatDuration(leg.drivingTimeSec)}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {leg.components.map((c) => (
          <li key={c.type} className="flex gap-3 py-3">
            <ComponentIcon type={c.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold">{COMPONENT_LABELS[c.type]}</p>
                <p className="shrink-0 text-right font-extrabold">
                  {c.isAvailable ? (
                    <Money value={c.amount} />
                  ) : (
                    <span className="badge-red">Unavailable</span>
                  )}
                </p>
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                {c.isAvailable ? componentNote(c) : c.unavailableReason}
              </p>
              {c.isAvailable && (
                <p className="text-[13px] text-muted">
                  Range <Range lower={c.lowerBound} upper={c.upperBound} />
                </p>
              )}
              {c.type === 'ROAD_USAGE' && c.crossings.length > 0 && (
                <CrossingList crossings={c.crossings} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex items-center justify-between rounded-xl bg-tool px-3 py-2.5 font-extrabold">
        <span>Subtotal</span>
        <span>
          {leg.subtotalIsLowerBound ? 'At least ' : ''}
          <Money value={leg.subtotal} />
        </span>
      </p>
    </section>
  );
}

function CrossingList({ crossings }: { crossings: CrossingDto[] }) {
  return (
    <ul aria-label="ERP gantries on this route" className="mt-2 grid gap-1.5">
      {crossings.map((x, i) => (
        <li
          key={`${x.chargePointId}-${i}`}
          className="flex items-start justify-between gap-3 rounded-[10px] bg-amber-soft/70 px-2.5 py-1.5 text-[13px]"
        >
          <span className="min-w-0">
            <span className="font-bold">{formatTime(x.estimatedCrossingTime)}</span>{' '}
            {x.chargePointName}
            {x.nearPeriodBoundary && (
              <span className="block text-xs text-amber">
                Near period boundary: {x.lowerBound} to {x.upperBound}
              </span>
            )}
          </span>
          <span className="shrink-0 font-bold">{x.isExcluded ? 'not priced' : sgd(x.charge)}</span>
        </li>
      ))}
    </ul>
  );
}

function componentNote(c: ComponentDto): string {
  if (c.type === 'FUEL' && c.detail.volumeL !== undefined)
    return `${c.detail.volumeL} L at SGD ${c.detail.pricePerLitre}/L`;
  if (c.type === 'ROAD_USAGE') {
    const count = Number(c.detail.crossingCount ?? 0);
    if (count === 0) return 'No ERP charge point on this route';
    const excluded = Number(c.detail.excludedCount ?? 0);
    return `${count} charge point${count === 1 ? '' : 's'} crossed${excluded ? `, ${excluded} excluded` : ''}`;
  }
  if (c.type === 'PARKING') {
    if (Number(c.detail.durationMin ?? 0) === 0) return 'No parking planned';
    return `${c.detail.carparkName}: ${c.detail.periods} charging period${Number(c.detail.periods) === 1 ? '' : 's'} of ${c.detail.chargingPeriodMin} minutes`;
  }
  return '';
}

function Derivation({
  legs,
  rangeBasis,
  calculatedAt,
}: {
  legs: LegDto[];
  rangeBasis: string[];
  calculatedAt: string;
}) {
  return (
    <section id="cost-derivation" aria-labelledby="derivation-title" className="card sm:p-7">
      <h2 id="derivation-title" className="text-2xl font-black tracking-tight">
        Cost derivation
      </h2>
      <p className="mt-2 text-sm text-muted">
        Calculated {formatDateTime(calculatedAt)}. Review the rates, source dates and assumptions
        behind your estimate.
      </p>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
        Where the rates come from: fuel prices and ERP rates are reference records an administrator
        maintains, parking comes from the nearest recorded carpark, and distance and driving time
        come from the routing service. A source flagged as older than its freshness threshold still
        counts towards the total, but the real cost may have moved since it was recorded.
      </p>
      {legs.map((leg) => (
        <div key={String(leg.isReturnLeg)} className="mt-6">
          {legs.length > 1 && (
            <h3 className="eyebrow">{leg.isReturnLeg ? 'Return leg' : 'Outbound leg'}</h3>
          )}
          {leg.components.map((c) => (
            <div key={c.type} className="mt-4 flex gap-3 border-t border-line pt-4">
              <ComponentIcon type={c.type} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {COMPONENT_LABELS[c.type]}
                  {c.source.isStale && (
                    <span className="badge-amber">Source older than its freshness threshold</span>
                  )}
                </p>
                <p className="text-sm wrap-anywhere text-muted">
                  Source: {c.source.name ?? 'none'}
                  {c.source.recordedAt ? `, recorded ${formatDateTime(c.source.recordedAt)}` : ''}
                </p>
                {!c.isAvailable && (
                  <p className="text-sm text-red-700">Unavailable: {c.unavailableReason}</p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(c.detail).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[13px] font-semibold text-muted">{labelOf(k)}</dt>
                      <dd className="wrap-anywhere">{v === null ? 'n/a' : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                {c.crossings.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="tbl min-w-160">
                      <thead>
                        <tr>
                          <th>Charge point</th>
                          <th>Crossing</th>
                          <th>Day type</th>
                          <th>Period</th>
                          <th>Charge</th>
                          <th>Bounds</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.crossings.map((x, i) => (
                          <tr key={i} className={x.isExcluded ? 'text-red-700' : ''}>
                            <td>{x.chargePointName}</td>
                            <td>{formatTime(x.estimatedCrossingTime)}</td>
                            <td>{DAY_TYPE_LABELS[x.dayType]}</td>
                            <td>
                              {x.ratePeriod ??
                                (x.isExcluded ? 'no rate' : 'outside charging hours')}
                            </td>
                            <td>
                              {x.isExcluded ? `Excluded: ${x.exclusionReason}` : sgd(x.charge)}
                            </td>
                            <td>
                              {x.nearPeriodBoundary ? (
                                <>
                                  {x.lowerBound} to {x.upperBound}{' '}
                                  <span className="badge-amber">near period boundary</span>
                                </>
                              ) : (
                                'exact'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      <h3 className="eyebrow mt-6">How the range is derived</h3>
      <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-ink-soft">
        {rangeBasis.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </section>
  );
}

const LABELS: Record<string, string> = {
  distanceKm: 'Distance (km)',
  consumptionRate: 'Consumption (L/100 km)',
  volumeL: 'Fuel volume (L)',
  pricePerLitre: 'Price (SGD/L)',
  brand: 'Brand',
  fuelType: 'Fuel type',
  crossingCount: 'Charge points crossed',
  chargedCount: 'Charged crossings',
  excludedCount: 'Excluded crossings',
  carparkName: 'Carpark',
  distanceFromDestinationKm: 'Distance from destination (km)',
  ratePerPeriod: 'Rate per period (SGD)',
  chargingPeriodMin: 'Charging period (min)',
  periods: 'Periods charged',
  roundingRule: 'Part-period rule',
  durationMin: 'Planned duration (min)',
};

function labelOf(key: string): string {
  return LABELS[key] ?? key;
}
