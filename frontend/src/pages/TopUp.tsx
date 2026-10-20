import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import {
  FUEL_LEVEL_UNITS,
  FUEL_LEVEL_UNIT_LABELS,
  topUpSchema,
  type FuelLevelUnit,
  type TopUpPlanDto,
  type TripDto,
} from '@tolltally/shared';
import { describeError } from '../api/client';
import { tripsApi } from '../api/endpoints';
import { Alert, Field, Loading, Money, Page, PageHeader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { validate } from '../lib/form';

const UNIT_SHORT_LABELS: Record<FuelLevelUnit, string> = {
  LITRES: 'Litres',
  TANK_FRACTION: 'Fraction',
  PERCENT: 'Percent',
};

/**
 * «boundary» FuelTopUpUI (UC-13).
 */
export function TopUp() {
  const { id = '' } = useParams();
  const { data, loading, error, setData } = useAsync(() => tripsApi.get(id), [id]);
  const [pickUp, setPickUp] = useState('');
  const [required, setRequired] = useState('');
  const [unit, setUnit] = useState('TANK_FRACTION');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: input, errors: fieldErrors } = validate(topUpSchema, {
      pickUpLevel: pickUp,
      requiredReturnLevel: required,
      unit,
    });
    setErrors(fieldErrors);
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await tripsApi.topUp(id, input);
      setData(res as { trip: TripDto });
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
  const unitLabel = unit === 'LITRES' ? 'L' : unit === 'PERCENT' ? '%' : 'of tank (0 to 1)';
  const placeholder = unit === 'LITRES' ? '25' : unit === 'PERCENT' ? '50' : '0.5';

  return (
    <Page width="medium">
      <PageHeader
        back={{ to: `/app/trips/${id}`, label: 'Back to estimate' }}
        title="Fuel top-up plan"
        lede={`${trip.vehicle.displayName} has a ${trip.vehicle.tankCapacity} L tank. The plan uses the fuel calculation for the whole planned distance.`}
      />
      {trip.vehicle.ownershipType !== 'RENTED' ? (
        <Alert kind="warning">
          Fuel top-up planning is available only for a rented vehicle profile.
        </Alert>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <form className="card grid gap-5" onSubmit={onSubmit} noValidate>
            {message && <Alert kind="error">{message}</Alert>}
            <Alert kind="info">
              Read or enter the fuel level only while the vehicle is stationary.
            </Alert>
            <fieldset aria-describedby={errors.unit ? 'unit-error' : 'unit-hint'}>
              <legend className="label">Unit for fuel levels</legend>
              <div className="segmented">
                {FUEL_LEVEL_UNITS.map((u) => (
                  <label key={u} className="segmented__option" title={FUEL_LEVEL_UNIT_LABELS[u]}>
                    <input
                      type="radio"
                      name="unit"
                      value={u}
                      checked={unit === u}
                      onChange={() => setUnit(u)}
                      className="sr-only"
                    />
                    {UNIT_SHORT_LABELS[u]}
                  </label>
                ))}
              </div>
              {errors.unit ? (
                <p className="field-error" id="unit-error" role="alert">
                  {errors.unit}
                </p>
              ) : (
                <p className="hint" id="unit-hint">
                  Read the level off the fuel gauge. Litres if the rental agreement states them,
                  percent for a gauge marked 0 to 100, or a fraction of the tank for a gauge marked
                  in quarters (a quarter tank is 0.25).
                </p>
              )}
            </fieldset>
            <Field
              id="pickUp"
              label={`Fuel level at pick-up (${unitLabel})`}
              error={errors.pickUpLevel}
            >
              <input
                id="pickUp"
                className="input text-lg font-semibold"
                inputMode="decimal"
                value={pickUp}
                onChange={(e) => setPickUp(e.target.value)}
                placeholder={placeholder}
              />
            </Field>
            <Field
              id="required"
              label={`Level required at return (${unitLabel})`}
              error={errors.requiredReturnLevel}
            >
              <input
                id="required"
                className="input text-lg font-semibold"
                inputMode="decimal"
                value={required}
                onChange={(e) => setRequired(e.target.value)}
                placeholder={placeholder}
              />
            </Field>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Calculating…' : 'Calculate top-up'}
            </button>
          </form>
          {trip.topUpPlan ? (
            <PlanResult plan={trip.topUpPlan} />
          ) : (
            <div className="card text-sm leading-relaxed text-muted">
              Enter the two fuel levels to see the projected return level, the litres to buy and
              their cost.
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function pointOnGauge(fraction: number, radius = 120) {
  const angle = Math.PI * (1 - fraction);
  const x = 160 + radius * Math.cos(angle);
  const y = 150 - radius * Math.sin(angle);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function arcPath(from: number, to: number) {
  return `M${pointOnGauge(from)} A120 120 0 0 1 ${pointOnGauge(to)}`;
}

function FuelGauge({ plan }: { plan: TopUpPlanDto }) {
  const tank = Number(plan.tankCapacityL);
  const toFraction = (litres: string) => Math.min(1, Math.max(0, Number(litres) / tank));
  const projected = toFraction(plan.projectedReturn.litres);
  const required = toFraction(plan.requiredReturn.litres);
  const afterTopUp = Math.min(1, projected + toFraction(plan.topUp.litres));

  return (
    <div className="rounded-[18px] bg-ink px-4 pt-4 pb-3 text-white">
      <svg
        role="img"
        aria-label={`Fuel gauge: projected level at return ${plan.projectedReturn.litres} litres, required level ${plan.requiredReturn.litres} litres, buy ${plan.topUp.litres} litres`}
        viewBox="0 0 320 172"
        className="mx-auto block h-auto w-full max-w-80"
      >
        <path
          d="M40 150 A120 120 0 0 1 280 150"
          fill="none"
          stroke="rgb(255 255 255 / 0.12)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {projected > 0 && (
          <path
            d={arcPath(0, projected)}
            fill="none"
            stroke="#56c49a"
            strokeWidth="16"
            strokeLinecap="round"
          />
        )}
        {afterTopUp > projected && (
          <path d={arcPath(projected, afterTopUp)} fill="none" stroke="#f2b300" strokeWidth="16" />
        )}
        <path
          d={`M${pointOnGauge(required, 100)} L${pointOnGauge(required, 140)}`}
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="30" y="170" fontSize="15" fontWeight="700" fill="rgb(255 255 255 / 0.6)">
          E
        </text>
        <text x="280" y="170" fontSize="15" fontWeight="700" fill="rgb(255 255 255 / 0.6)">
          F
        </text>
        <text x="160" y="120" textAnchor="middle" fontSize="34" fontWeight="800" fill="#ffffff">
          {plan.topUp.litres} L
        </text>
        <text x="160" y="144" textAnchor="middle" fontSize="12" fill="rgb(255 255 255 / 0.7)">
          to buy before return
        </text>
      </svg>
      <ul
        aria-hidden="true"
        className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/80"
      >
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-sm bg-mint" />
          Projected at return
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-sm bg-[#f2b300]" />
          Top-up
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-sm bg-white" />
          Required
        </li>
      </ul>
    </div>
  );
}

function PlanResult({ plan }: { plan: TopUpPlanDto }) {
  const rows: [string, { litres: string; inUnit: string }][] = [
    ['Fuel at pick-up', plan.pickUp],
    ['Fuel the trip uses', plan.tripFuel],
    ['Projected level at return', plan.projectedReturn],
    ['Level required at return', plan.requiredReturn],
    ['Top-up to buy', plan.topUp],
  ];
  if (plan.outcome === 'REFUEL_EN_ROUTE')
    rows.splice(3, 0, ['Shortfall before arrival', plan.shortfall]);
  const unitName =
    plan.unit === 'LITRES'
      ? 'litres'
      : plan.unit === 'PERCENT'
        ? 'percent of tank'
        : 'fraction of tank';
  return (
    <section className="card grid gap-4" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan-title" className="text-lg font-extrabold">
          Your plan
        </h2>
        {plan.outcome === 'REFUEL_EN_ROUTE' && <span className="badge-red">Refuel en route</span>}
        {plan.outcome === 'NONE_NEEDED' && <span className="badge-mint">No top-up needed</span>}
        {plan.outcome === 'TOP_UP' && <span className="badge-amber">Top-up needed</span>}
      </div>
      <p className="text-[15px] leading-relaxed">{plan.message}</p>
      <FuelGauge plan={plan} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="tbl">
          <thead>
            <tr>
              <th>
                <span className="sr-only">Measure</span>
              </th>
              <th className="text-right">{unitName}</th>
              <th className="text-right">litres</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, v]) => (
              <tr
                key={label}
                className={label === 'Top-up to buy' ? 'bg-amber-soft/60 font-bold' : ''}
              >
                <td>{label}</td>
                <td className="text-right">{plan.unit === 'LITRES' ? v.litres : v.inUnit}</td>
                <td className="text-right">{v.litres}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-tool px-4 py-3 text-lg font-extrabold">
        Estimated top-up cost <Money value={plan.estimatedCost} />
      </p>
      <p className="text-xs leading-relaxed text-muted">
        At SGD {plan.pricePerLitre} per litre from {plan.fuelPriceSource.name}. This plan is
        separate from the trip estimate and does not change its total.
      </p>
    </section>
  );
}
