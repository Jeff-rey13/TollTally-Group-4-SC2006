import { useMemo, useState, type FormEvent } from 'react';
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  VEHICLE_CLASSES,
  VEHICLE_CLASS_LABELS,
  erpRateSchema,
  type ErpRateDto,
} from '@tolltally/shared';
import { describeError } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import { Alert, Field, Loading, Page, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fieldSetter, validate } from '../../lib/form';
import { formatSgDate, todaySg } from '../../lib/format';

const emptyForm = () => ({
  chargePointId: '',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  dayType: 'WEEKDAY',
  startTime: '',
  endTime: '',
  rate: '',
  effectiveDate: todaySg(),
});

/**
 * «boundary» ERPRateAdminUI (UC-18).
 */
export function ErpRates() {
  const chargePoints = useAsync(() => adminApi.chargePoints(), []);
  const rates = useAsync(() => adminApi.erpRates(), []);
  const [filterPoint, setFilterPoint] = useState('');
  const [filterClass, setFilterClass] = useState('PASSENGER_CAR_LGV_TAXI');
  const [values, setValues] = useState(emptyForm);
  const [editing, setEditing] = useState<ErpRateDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const points = chargePoints.data?.chargePoints ?? [];
  const activePoint = filterPoint || points[0]?.id || '';
  const visible = useMemo(
    () =>
      (rates.data?.erpRates ?? []).filter(
        (r) => r.chargePointId === activePoint && r.vehicleClass === filterClass,
      ),
    [rates.data, activePoint, filterClass],
  );
  const set = fieldSetter(setValues);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: input, errors: fieldErrors } = validate(erpRateSchema, {
      ...values,
      chargePointId: values.chargePointId || activePoint,
    });
    setErrors(fieldErrors);
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editing) await adminApi.updateErpRate(editing.id, input);
      else await adminApi.createErpRate(input);
      setValues({
        ...emptyForm(),
        chargePointId: input.chargePointId,
        vehicleClass: input.vehicleClass,
        dayType: input.dayType,
        effectiveDate: input.effectiveDate,
      });
      setEditing(null);
      rates.reload();
    } catch (err) {
      const d = describeError(err);
      setErrors(d.fields);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(row: ErpRateDto) {
    if (
      !window.confirm(
        `Withdraw the ${row.startTime} to ${row.endTime} rate at ${row.chargePointName}? The record is kept for saved estimates.`,
      )
    )
      return;
    try {
      await adminApi.withdrawErpRate(row.id);
      rates.reload();
    } catch (err) {
      setMessage(describeError(err).message);
    }
  }

  return (
    <Page>
      <PageHeader
        title="ERP tariffs"
        lede="Rates by charge point, vehicle class, day type and time period. Overlapping periods for the same key and effective date are rejected; a future revision applies from its effective date."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <div className="card grid gap-4 sm:grid-cols-2">
            <Field id="filterPoint" label="Charge point">
              <select
                id="filterPoint"
                className="input"
                value={activePoint}
                onChange={(e) => setFilterPoint(e.target.value)}
              >
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="filterClass" label="Vehicle class">
              <select
                id="filterClass"
                className="input"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                {VEHICLE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {VEHICLE_CLASS_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <section aria-label="ERP rate records" className="card overflow-x-auto p-0">
            {rates.loading || chargePoints.loading ? (
              <div className="p-5">
                <Loading />
              </div>
            ) : rates.error || chargePoints.error ? (
              <div className="p-5">
                <Alert kind="error">{rates.error ?? chargePoints.error}</Alert>
              </div>
            ) : visible.length === 0 ? (
              <p className="p-5 text-sm text-muted">
                No rates for this charge point and class. Crossings will be priced as zero outside
                any recorded period.
              </p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Day type</th>
                    <th>Period</th>
                    <th className="text-right">SGD</th>
                    <th>Effective</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      className={`${r.isWithdrawn ? 'text-muted/70' : ''} ${editing?.id === r.id ? 'bg-mint-soft/60' : ''}`}
                    >
                      <td className="font-semibold whitespace-nowrap">
                        {DAY_TYPE_LABELS[r.dayType]}{' '}
                        {r.isWithdrawn && <span className="badge-grey ml-1">Withdrawn</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.startTime} to {r.endTime}
                      </td>
                      <td className="text-right font-bold">{r.rate}</td>
                      <td className="whitespace-nowrap text-muted">
                        {formatSgDate(r.effectiveDate)}
                      </td>
                      <td>
                        {!r.isWithdrawn && (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => {
                                setEditing(r);
                                setValues({
                                  chargePointId: r.chargePointId,
                                  vehicleClass: r.vehicleClass,
                                  dayType: r.dayType,
                                  startTime: r.startTime,
                                  endTime: r.endTime,
                                  rate: r.rate,
                                  effectiveDate: r.effectiveDate,
                                });
                              }}
                            >
                              Amend
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => withdraw(r)}
                            >
                              Withdraw
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
        <form className="card grid gap-4 lg:sticky lg:top-4" onSubmit={onSubmit} noValidate>
          <h2 className="text-lg font-extrabold">
            {editing ? 'Amend rate record' : 'Add rate record'}
          </h2>
          {message && <Alert kind="error">{message}</Alert>}
          <Field id="chargePointId" label="Charge point" error={errors.chargePointId}>
            <select
              id="chargePointId"
              className="input"
              value={values.chargePointId || activePoint}
              onChange={set('chargePointId')}
            >
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="vehicleClass" label="Vehicle class" error={errors.vehicleClass}>
            <select
              id="vehicleClass"
              className="input"
              value={values.vehicleClass}
              onChange={set('vehicleClass')}
            >
              {VEHICLE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {VEHICLE_CLASS_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="dayType" label="Day type" error={errors.dayType}>
            <select id="dayType" className="input" value={values.dayType} onChange={set('dayType')}>
              {DAY_TYPES.map((d) => (
                <option key={d} value={d}>
                  {DAY_TYPE_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="startTime" label="Start (HH:MM)" error={errors.startTime}>
              <input
                id="startTime"
                className="input"
                value={values.startTime}
                onChange={set('startTime')}
                placeholder="07:30"
              />
            </Field>
            <Field id="endTime" label="End (HH:MM)" error={errors.endTime}>
              <input
                id="endTime"
                className="input"
                value={values.endTime}
                onChange={set('endTime')}
                placeholder="08:00"
              />
            </Field>
          </div>
          <Field id="rate" label="Rate (SGD, 0 for a free period)" error={errors.rate}>
            <input
              id="rate"
              className="input"
              inputMode="decimal"
              value={values.rate}
              onChange={set('rate')}
              placeholder="1.00"
            />
          </Field>
          <Field id="effectiveDate" label="Effective date" error={errors.effectiveDate}>
            <input
              id="effectiveDate"
              type="date"
              className="input"
              value={values.effectiveDate}
              onChange={set('effectiveDate')}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save amendment' : 'Add record'}
            </button>
            {editing && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditing(null);
                  setValues(emptyForm());
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </Page>
  );
}
