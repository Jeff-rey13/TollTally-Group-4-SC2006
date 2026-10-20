import { useState, type FormEvent } from 'react';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  efficiencyRecordSchema,
  type EfficiencyRecordDto,
} from '@tolltally/shared';
import { describeError } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import { Alert, Field, Loading, Page, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fieldSetter, validate } from '../../lib/form';
import { formatDateTime } from '../../lib/format';

const EMPTY = {
  make: '',
  model: '',
  consumptionRate: '',
  tankCapacity: '',
  fuelType: '',
  source: '',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
};

/**
 * «boundary» EfficiencyAdminUI (UC-19).
 */
export function Efficiency() {
  const { data, loading, error, reload } = useAsync(() => adminApi.efficiencyRecords(), []);
  const [values, setValues] = useState(EMPTY);
  const [editing, setEditing] = useState<EfficiencyRecordDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = fieldSetter(setValues);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: input, errors: fieldErrors } = validate(efficiencyRecordSchema, values);
    setErrors(fieldErrors);
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editing) await adminApi.updateEfficiencyRecord(editing.id, input);
      else await adminApi.createEfficiencyRecord(input);
      setValues(EMPTY);
      setEditing(null);
      reload();
    } catch (err) {
      const d = describeError(err);
      setErrors(d.fields);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: EfficiencyRecordDto) {
    if (
      !window.confirm(
        `Delete the ${row.make} ${row.model} reference? Existing vehicle profiles keep their own consumption rate.`,
      )
    )
      return;
    try {
      await adminApi.deleteEfficiencyRecord(row.id);
      reload();
    } catch (err) {
      setMessage(describeError(err).message);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Vehicle efficiency"
        lede="The car list drivers pick from when they add a vehicle: consumption, tank size and where the figures came from. Changing a record never alters an existing profile."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Vehicle efficiency records" className="card overflow-x-auto p-0">
          {loading ? (
            <div className="p-5">
              <Loading />
            </div>
          ) : error || !data ? (
            <div className="p-5">
              <Alert kind="error">{error ?? 'Unavailable'}</Alert>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Make</th>
                  <th>Model</th>
                  <th className="text-right">L/100 km</th>
                  <th className="text-right">Tank (L)</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className={editing?.id === r.id ? 'bg-mint-soft/60' : ''}>
                    <td className="whitespace-nowrap text-muted">
                      {r.vehicleClass === 'MOTORCYCLE' ? 'Motorcycle' : 'Car'}
                    </td>
                    <td className="font-semibold">{r.make}</td>
                    <td>{r.model}</td>
                    <td className="text-right font-bold">{r.consumptionRate}</td>
                    <td className="text-right">{r.tankCapacity ?? '–'}</td>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(r.updatedAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setEditing(r);
                            setValues({
                              make: r.make,
                              model: r.model,
                              consumptionRate: r.consumptionRate,
                              tankCapacity: r.tankCapacity ?? '',
                              fuelType: r.fuelType ?? '',
                              source: r.source ?? '',
                              vehicleClass: r.vehicleClass,
                            });
                          }}
                        >
                          Amend
                        </button>
                        <button type="button" className="btn-danger" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <form className="card grid gap-4 lg:sticky lg:top-4" onSubmit={onSubmit} noValidate>
          <h2 className="text-lg font-extrabold">{editing ? 'Amend record' : 'Add record'}</h2>
          {message && <Alert kind="error">{message}</Alert>}
          <Field id="vehicleClass" label="Vehicle type" error={errors.vehicleClass}>
            <select
              id="vehicleClass"
              className="input"
              value={values.vehicleClass}
              onChange={set('vehicleClass')}
            >
              <option value="PASSENGER_CAR_LGV_TAXI">Car</option>
              <option value="MOTORCYCLE">Motorcycle</option>
            </select>
          </Field>
          <Field id="make" label="Make" error={errors.make}>
            <input
              id="make"
              className="input"
              value={values.make}
              onChange={set('make')}
              placeholder="Toyota"
            />
          </Field>
          <Field id="model" label="Model" error={errors.model}>
            <input
              id="model"
              className="input"
              value={values.model}
              onChange={set('model')}
              placeholder="Corolla Altis"
            />
          </Field>
          <Field
            id="consumptionRate"
            label="Consumption rate (L/100 km)"
            error={errors.consumptionRate}
          >
            <input
              id="consumptionRate"
              className="input"
              inputMode="decimal"
              value={values.consumptionRate}
              onChange={set('consumptionRate')}
              placeholder="6.5"
            />
          </Field>
          <Field
            id="tankCapacity"
            label="Tank capacity in litres (optional)"
            error={errors.tankCapacity}
          >
            <input
              id="tankCapacity"
              className="input"
              inputMode="decimal"
              value={values.tankCapacity}
              onChange={set('tankCapacity')}
              placeholder="50"
            />
          </Field>
          <Field id="fuelType" label="Fuel type (optional)" error={errors.fuelType}>
            <select
              id="fuelType"
              className="input"
              value={values.fuelType}
              onChange={set('fuelType')}
            >
              <option value="">Not set</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FUEL_TYPE_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="source"
            label="Source (optional)"
            error={errors.source}
            hint="Where the figures come from, such as the maker's Singapore spec sheet."
          >
            <input id="source" className="input" value={values.source} onChange={set('source')} />
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
                  setValues(EMPTY);
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
