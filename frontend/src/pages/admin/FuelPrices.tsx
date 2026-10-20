import { useState, type FormEvent } from 'react';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  fuelPriceSchema,
  type FuelPriceDto,
} from '@tolltally/shared';
import { describeError } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import { Alert, Field, Loading, Page, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fieldSetter, validate } from '../../lib/form';
import { formatDateTime } from '../../lib/format';

const EMPTY = { brand: '', fuelType: 'PETROL_95', price: '' };

/**
 * «boundary» FuelPriceAdminUI (UC-17).
 */
export function FuelPrices() {
  const { data, loading, error, reload } = useAsync(() => adminApi.fuelPrices(), []);
  const [values, setValues] = useState(EMPTY);
  const [editing, setEditing] = useState<FuelPriceDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = fieldSetter(setValues);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: input, errors: fieldErrors } = validate(fuelPriceSchema, values);
    setErrors(fieldErrors);
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editing) await adminApi.updateFuelPrice(editing.id, input);
      else await adminApi.createFuelPrice(input);
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

  async function withdraw(row: FuelPriceDto) {
    if (
      !window.confirm(
        `Withdraw the ${row.brand} ${FUEL_TYPE_LABELS[row.fuelType]} price? The record is kept so you can still review the rates used by saved estimates.`,
      )
    )
      return;
    try {
      await adminApi.withdrawFuelPrice(row.id);
      reload();
    } catch (err) {
      setMessage(describeError(err).message);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Fuel prices"
        lede="The most recent active price per fuel type is used for every estimate. The recorded time is set by the system."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Fuel price records" className="card overflow-x-auto p-0">
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
                  <th>Brand</th>
                  <th>Fuel</th>
                  <th className="text-right">SGD/L</th>
                  <th>Recorded</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.fuelPrices.map((p) => (
                  <tr
                    key={p.id}
                    className={`${p.isWithdrawn ? 'text-muted/70' : ''} ${editing?.id === p.id ? 'bg-mint-soft/60' : ''}`}
                  >
                    <td className="font-semibold">
                      {p.brand}{' '}
                      {p.isWithdrawn && <span className="badge-grey ml-1">Withdrawn</span>}
                    </td>
                    <td className="whitespace-nowrap">{FUEL_TYPE_LABELS[p.fuelType]}</td>
                    <td className="text-right font-bold">{p.price}</td>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(p.recordedAt)}</td>
                    <td>
                      {!p.isWithdrawn && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => {
                              setEditing(p);
                              setValues({ brand: p.brand, fuelType: p.fuelType, price: p.price });
                            }}
                          >
                            Amend
                          </button>
                          <button type="button" className="btn-danger" onClick={() => withdraw(p)}>
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
        <form className="card grid gap-4 lg:sticky lg:top-4" onSubmit={onSubmit} noValidate>
          <h2 className="text-lg font-extrabold">
            {editing ? 'Amend price record' : 'Add price record'}
          </h2>
          {message && <Alert kind="error">{message}</Alert>}
          <Field id="brand" label="Brand" error={errors.brand}>
            <input
              id="brand"
              className="input"
              value={values.brand}
              onChange={set('brand')}
              placeholder="Shell"
            />
          </Field>
          <Field id="fuelType" label="Fuel type" error={errors.fuelType}>
            <select
              id="fuelType"
              className="input"
              value={values.fuelType}
              onChange={set('fuelType')}
            >
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FUEL_TYPE_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="price" label="Price (SGD per litre)" error={errors.price}>
            <input
              id="price"
              className="input"
              inputMode="decimal"
              value={values.price}
              onChange={set('price')}
              placeholder="2.78"
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
