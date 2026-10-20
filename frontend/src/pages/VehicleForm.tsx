import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  OWNERSHIP_TYPES,
  OWNERSHIP_LABELS,
  VEHICLE_CLASSES,
  VEHICLE_CLASS_LABELS,
  vehicleSchema,
} from '@tolltally/shared';
import type {
  EfficiencyDefaultDto,
  FuelType,
  VehicleClass,
  VehicleModelDto,
} from '@tolltally/shared';
import { describeError } from '../api/client';
import { referenceApi, vehiclesApi } from '../api/endpoints';
import { Alert, Field, Loading, Page, PageHeader } from '../components/ui';
import { fieldSetter, validate } from '../lib/form';

const EMPTY = {
  displayName: '',
  ownershipType: 'OWNED',
  fuelType: 'PETROL_95',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  make: '',
  model: '',
  consumptionRate: '',
  tankCapacity: '',
};

type VehicleKind = 'CAR' | 'MOTORCYCLE';
const kindOf = (vehicleClass: string): VehicleKind =>
  vehicleClass === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR';
/** ERP classes offered for a car profile; a motorcycle always uses the motorcycle class. */
const CAR_CLASSES = VEHICLE_CLASSES.filter((c) => c !== 'MOTORCYCLE');

/**
 * «boundary» VehicleProfileUI form, offering the reference consumption rate (UC-04, UC-19 data).
 */
export function VehicleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [reference, setReference] = useState<EfficiencyDefaultDto | null>(null);
  const [catalogue, setCatalogue] = useState<VehicleModelDto[] | null>(null);
  const [pickedMake, setPickedMake] = useState('');
  const [picked, setPicked] = useState<VehicleModelDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    referenceApi
      .vehicleModels()
      .then((res) => {
        if (!cancelled) setCatalogue(res.models);
      })
      .catch(() => {
        if (!cancelled) setCatalogue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kind = kindOf(values.vehicleClass);
  const noun = kind === 'MOTORCYCLE' ? 'motorcycle' : 'car';
  const listForKind = useMemo(
    () => (catalogue ?? []).filter((m) => kindOf(m.vehicleClass) === kind),
    [catalogue, kind],
  );
  const makes = useMemo(
    () => [...new Set(listForKind.map((m) => m.make))].sort((a, b) => a.localeCompare(b)),
    [listForKind],
  );
  const modelsForMake = useMemo(
    () => listForKind.filter((m) => m.make === pickedMake),
    [listForKind, pickedMake],
  );

  function chooseKind(next: VehicleKind) {
    if (next === kind) return;
    setPickedMake('');
    setPicked(null);
    setValues((v) => ({
      ...v,
      vehicleClass: (next === 'MOTORCYCLE'
        ? 'MOTORCYCLE'
        : 'PASSENGER_CAR_LGV_TAXI') as VehicleClass,
    }));
  }

  // When editing a profile that came from the list, show it as already chosen.
  useEffect(() => {
    if (!catalogue || picked || pickedMake) return;
    const match = catalogue.find(
      (m) =>
        kindOf(m.vehicleClass) === kindOf(values.vehicleClass) &&
        m.make.toLowerCase() === values.make.trim().toLowerCase() &&
        m.model.toLowerCase() === values.model.trim().toLowerCase(),
    );
    if (match) {
      setPickedMake(match.make);
      setPicked(match);
    }
  }, [catalogue, values.make, values.model, values.vehicleClass, picked, pickedMake]);

  function chooseModel(modelName: string) {
    const choice = modelsForMake.find((m) => m.model === modelName) ?? null;
    setPicked(choice);
    if (!choice) return;
    setValues((v) => ({
      ...v,
      displayName: v.displayName.trim() ? v.displayName : `${choice.make} ${choice.model}`,
      make: choice.make,
      model: choice.model,
      consumptionRate: choice.consumptionRate,
      tankCapacity: choice.tankCapacity ?? v.tankCapacity,
      fuelType: (choice.fuelType as FuelType | null) ?? v.fuelType,
    }));
    setErrors((e) => ({ ...e, consumptionRate: '', tankCapacity: '' }));
  }

  useEffect(() => {
    setErrors({});
    setMessage(null);
    setReference(null);
    if (!id) {
      setValues(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    vehiclesApi
      .get(id)
      .then(({ vehicle }) => {
        if (cancelled) return;
        setValues({
          displayName: vehicle.displayName,
          ownershipType: vehicle.ownershipType,
          fuelType: vehicle.fuelType,
          vehicleClass: vehicle.vehicleClass,
          make: vehicle.make ?? '',
          model: vehicle.model ?? '',
          consumptionRate: vehicle.consumptionRate,
          tankCapacity: vehicle.tankCapacity,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setMessage(describeError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const make = values.make.trim();
    const model = values.model.trim();
    if (!make || !model) {
      setReference(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      referenceApi
        .efficiency(make, model)
        .then((result) => {
          if (!cancelled) setReference(result);
        })
        .catch(() => {
          if (!cancelled) setReference(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [values.make, values.model]);

  const set = fieldSetter(setValues);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(vehicleSchema, values);
    setErrors(fieldErrors);
    if (!data) return;
    setBusy(true);
    setMessage(null);
    try {
      if (id) await vehiclesApi.update(id, data);
      else await vehiclesApi.create(data);
      navigate('/app/vehicles');
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
        <Loading what="Loading the vehicle profile" />
      </Page>
    );

  return (
    <Page width="medium">
      <PageHeader
        back={{ to: '/app/vehicles', label: 'Back to vehicles' }}
        title={editing ? 'Edit vehicle profile' : 'Add vehicle profile'}
      />
      <form className="card grid gap-5 sm:p-7" onSubmit={onSubmit} noValidate>
        {message && <Alert kind="error">{message}</Alert>}
        <fieldset>
          <legend className="label">Vehicle type</legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:max-w-sm">
            {(['CAR', 'MOTORCYCLE'] as const).map((k) => (
              <label
                key={k}
                className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border-[1.5px] px-3 text-[16px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint-deep ${
                  kind === k
                    ? 'border-mint-deep bg-mint-soft text-mint-darker'
                    : 'border-line-strong bg-white text-ink hover:border-mint-deep'
                }`}
              >
                <input
                  type="radio"
                  name="vehicleKind"
                  value={k}
                  checked={kind === k}
                  onChange={() => chooseKind(k)}
                  className="sr-only"
                />
                {k === 'CAR' ? 'Car' : 'Motorcycle'}
              </label>
            ))}
          </div>
          {kind === 'MOTORCYCLE' && (
            <p className="mt-2 text-[14px] text-muted">
              Motorcycles pay half the car rate at ERP gantries and use motorcycle lots when
              TollTally prices parking.
            </p>
          )}
        </fieldset>
        <fieldset className="rounded-control border-[1.5px] border-mint-deep/25 bg-mint-soft/60 p-4 sm:p-5">
          <legend className="sr-only">Find your {noun}</legend>
          <p className="font-display text-2xl leading-tight font-bold" aria-hidden="true">
            Find your {noun}
          </p>
          <p className="mt-0.5 text-[15px] text-muted">
            Choose it to fill in fuel use and tank size from the maker's published figures. You can
            still change any value below.
          </p>
          {catalogue === null ? (
            <div className="mt-4">
              <Loading what={`Loading the ${noun} list`} />
            </div>
          ) : listForKind.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">
              The {noun} list is unavailable right now. Enter the details below instead.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="catalogueMake" className="label">
                  {kind === 'MOTORCYCLE' ? 'Motorcycle make' : 'Car make'}
                </label>
                <select
                  id="catalogueMake"
                  className="input"
                  value={pickedMake}
                  onChange={(e) => {
                    setPickedMake(e.target.value);
                    setPicked(null);
                  }}
                >
                  <option value="">Choose a make</option>
                  {makes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="catalogueModel" className="label">
                  {kind === 'MOTORCYCLE' ? 'Motorcycle model' : 'Car model'}
                </label>
                <select
                  id="catalogueModel"
                  className="input disabled:cursor-not-allowed disabled:bg-tool disabled:text-muted"
                  value={picked?.model ?? ''}
                  disabled={!pickedMake}
                  onChange={(e) => chooseModel(e.target.value)}
                >
                  <option value="">{pickedMake ? 'Choose a model' : 'Choose a make first'}</option>
                  {modelsForMake.map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {picked && (
            <div className="mt-4 rounded-control bg-white px-4 py-3 text-[15px]" role="status">
              <p className="font-semibold">
                {picked.make} {picked.model}: {picked.consumptionRate} L/100 km
                {picked.tankCapacity ? `, ${picked.tankCapacity} L tank` : ''}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {picked.tankCapacity
                  ? 'Copied into the form below.'
                  : 'Fuel use copied below. The maker does not publish the tank size here, so enter it yourself.'}{' '}
                Real riding and driving in town usually use more fuel than the published figure.
                {picked.source ? ` Source: ${picked.source}` : ''}
              </p>
            </div>
          )}
        </fieldset>
        <Field id="displayName" label="Display name" error={errors.displayName}>
          <input
            id="displayName"
            className="input"
            value={values.displayName}
            onChange={set('displayName')}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="ownershipType"
            label="Ownership"
            error={errors.ownershipType}
            hint="Rented profiles can plan a fuel top-up."
          >
            <select
              id="ownershipType"
              className="input"
              value={values.ownershipType}
              onChange={set('ownershipType')}
            >
              {OWNERSHIP_TYPES.map((o) => (
                <option key={o} value={o}>
                  {OWNERSHIP_LABELS[o]}
                </option>
              ))}
            </select>
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
        </div>
        {kind === 'CAR' && (
          <Field id="vehicleClass" label="ERP vehicle class" error={errors.vehicleClass}>
            <select
              id="vehicleClass"
              className="input"
              value={values.vehicleClass}
              onChange={set('vehicleClass')}
            >
              {CAR_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {VEHICLE_CLASS_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="make" label="Make (optional)" error={errors.make}>
            <input
              id="make"
              className="input"
              value={values.make}
              onChange={set('make')}
              placeholder={kind === 'MOTORCYCLE' ? 'Honda' : 'Toyota'}
            />
          </Field>
          <Field id="model" label="Model (optional)" error={errors.model}>
            <input
              id="model"
              className="input"
              value={values.model}
              onChange={set('model')}
              placeholder={kind === 'MOTORCYCLE' ? 'PCX125' : 'Corolla Altis'}
            />
          </Field>
        </div>
        <Field
          id="consumptionRate"
          label="Consumption rate (L/100 km)"
          error={errors.consumptionRate}
          hint={
            reference?.found
              ? undefined
              : kind === 'MOTORCYCLE'
                ? 'Fuel efficiency: the litres your motorcycle burns every 100 km. A scooter is around 2, a bigger bike 3 to 5. Take it from the trip meter or the manual, or leave it blank to use a reference value when one exists for the make and model.'
                : 'Fuel efficiency: the litres your vehicle burns every 100 km. A small car is around 6, a large one around 10. Take it from the trip computer or the manual, or leave it blank to use a reference value when one exists for the make and model.'
          }
        >
          <input
            id="consumptionRate"
            className="input"
            inputMode="decimal"
            value={values.consumptionRate}
            onChange={set('consumptionRate')}
            placeholder={kind === 'MOTORCYCLE' ? '2.4' : '6.5'}
          />
        </Field>
        {reference?.found &&
          reference.consumptionRate &&
          Number(reference.consumptionRate) !== Number(values.consumptionRate) && (
            <Alert kind="info">
              Reference value for {reference.make} {reference.model}: {reference.consumptionRate}{' '}
              L/100 km.{' '}
              <button
                type="button"
                className="font-bold underline"
                onClick={() =>
                  setValues((v) => ({
                    ...v,
                    consumptionRate: reference.consumptionRate ?? v.consumptionRate,
                  }))
                }
              >
                Use it
              </button>{' '}
              or keep your own figure. Your value is stored on the profile and never changed by
              later reference updates.
            </Alert>
          )}
        <Field id="tankCapacity" label="Tank capacity (litres)" error={errors.tankCapacity}>
          <input
            id="tankCapacity"
            className="input"
            inputMode="decimal"
            value={values.tankCapacity}
            onChange={set('tankCapacity')}
            placeholder={kind === 'MOTORCYCLE' ? '8' : '50'}
          />
        </Field>
        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/app/vehicles')}>
            Cancel
          </button>
        </div>
      </form>
    </Page>
  );
}
