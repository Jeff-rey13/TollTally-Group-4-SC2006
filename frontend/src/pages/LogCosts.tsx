import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { COMPONENT_LABELS, tripLogSchema, type TripDto } from '@tolltally/shared';
import { describeError } from '../api/client';
import { tripsApi } from '../api/endpoints';
import { Alert, Field, Loading, Money, MoneyInput, Page, PageHeader } from '../components/ui';
import { ComponentIcon } from '../components/icons';
import { useAsync } from '../hooks/useAsync';
import { fieldSetter, validate } from '../lib/form';
import { formatDateTime } from '../lib/format';

/**
 * «boundary» TripRecordsUI for logging actual costs and showing variance (UC-15).
 */
export function LogCosts() {
  const { id = '' } = useParams();
  const { data, loading, error, setData } = useAsync(() => tripsApi.get(id), [id]);
  const [values, setValues] = useState({
    actualFuelCost: '',
    actualRoadUsageCharge: '',
    actualParkingFee: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const log = data?.trip.log;
    if (!log) return;
    const find = (type: string) => log.components.find((c) => c.type === type)?.actual ?? '';
    setValues({
      actualFuelCost: find('FUEL'),
      actualRoadUsageCharge: find('ROAD_USAGE'),
      actualParkingFee: find('PARKING'),
    });
  }, [data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: input, errors: fieldErrors } = validate(tripLogSchema, values);
    setErrors(fieldErrors);
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await tripsApi.log(id, input);
      setData(res as { trip: TripDto });
      setMessage(null);
    } catch (err) {
      const d = describeError(err);
      setErrors(d.fields);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <Page width="medium">
        <Loading />
      </Page>
    );
  if (error || !data)
    return (
      <Page width="medium">
        <Alert kind="error">{error ?? 'Trip not found'}</Alert>
      </Page>
    );
  const trip = data.trip;
  const set = fieldSetter(setValues);

  return (
    <Page width="medium">
      <PageHeader
        back={{ to: '/app/history', label: 'Back to history' }}
        title="Log actual costs"
        lede={`${trip.origin.name} to ${trip.destination.name}, ${formatDateTime(trip.departureTime)}. Enter the amounts you paid. Use 0 for no charge and leave unknown amounts blank.`}
      />
      {trip.status !== 'SAVED' && trip.status !== 'COMPLETED' ? (
        <Alert kind="warning">
          Save the trip first.{' '}
          <Link to={`/app/trips/${id}`} className="font-bold underline">
            Open the estimate
          </Link>
        </Alert>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <form className="card grid gap-5" onSubmit={onSubmit} noValidate>
            {message && <Alert kind="error">{message}</Alert>}
            <Field id="actualFuelCost" label="Actual fuel cost (SGD)" error={errors.actualFuelCost}>
              <MoneyInput
                id="actualFuelCost"
                value={values.actualFuelCost}
                onChange={set('actualFuelCost')}
              />
            </Field>
            <Field
              id="actualRoadUsageCharge"
              label="Actual ERP charge (SGD)"
              error={errors.actualRoadUsageCharge}
            >
              <MoneyInput
                id="actualRoadUsageCharge"
                value={values.actualRoadUsageCharge}
                onChange={set('actualRoadUsageCharge')}
              />
            </Field>
            <Field
              id="actualParkingFee"
              label="Actual parking fee (SGD)"
              error={errors.actualParkingFee}
            >
              <MoneyInput
                id="actualParkingFee"
                value={values.actualParkingFee}
                onChange={set('actualParkingFee')}
              />
            </Field>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : trip.log ? 'Update log' : 'Save log'}
            </button>
          </form>
          <section className="card min-w-0" aria-labelledby="variance-title">
            <h2 id="variance-title" className="text-lg font-extrabold">
              Estimate versus actual
            </h2>
            {trip.log ? (
              <>
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {trip.log.components.map((c) => (
                    <li key={c.type} className="grid gap-2.5 p-3">
                      <p className="flex items-center gap-2.5 font-bold">
                        <ComponentIcon type={c.type} />
                        {COMPONENT_LABELS[c.type]}
                      </p>
                      <dl className="grid grid-cols-3 gap-2 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Estimated</dt>
                          <dd>{c.estimated ?? 'unavailable'}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Actual</dt>
                          <dd>{c.actual ?? <span className="badge-grey">Not logged</span>}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Variance</dt>
                          <dd className="font-semibold">
                            {c.status === 'OK' && c.variance
                              ? `${c.variance.absolute}${c.variance.percent ? ` (${c.variance.percent}%)` : ''}`
                              : c.status === 'NOT_APPLICABLE'
                                ? 'Not applicable'
                                : 'Not logged'}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-2xl bg-ink p-4 text-white">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-white/75">Actual total</span>
                    <span className="text-2xl font-black">
                      <Money value={trip.log.actualTotal} />
                    </span>
                  </p>
                  {trip.log.totalVariance && (
                    <p className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="text-white/75">Variance</span>
                      <span className="font-bold">
                        {trip.log.totalVariance.absolute}
                        {trip.log.totalVariance.percent
                          ? ` (${trip.log.totalVariance.percent}%)`
                          : ''}
                      </span>
                    </p>
                  )}
                </div>
                <p className="hint mt-3">
                  {trip.log.totalVarianceBasis}. Logged {formatDateTime(trip.log.loggedAt)}.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The saved estimate was {trip.estimate?.totalIsLowerBound ? 'at least ' : ''}
                <Money value={trip.estimate?.total} />. Log the amounts you paid to see the variance
                per component and in total.
              </p>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
