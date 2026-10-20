import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { tripSchema, type LocationRef } from '@tolltally/shared';
import { describeError } from '../api/client';
import { tripsApi, vehiclesApi } from '../api/endpoints';
import { LocationPicker } from '../components/LocationPicker';
import { MapStage, StagePanel } from '../components/MapStage';
import { TripMap } from '../components/TripMap';
import { Alert, Field, Loading } from '../components/ui';
import { IconArrowRight } from '../components/icons';
import { useAsync } from '../hooks/useAsync';
import { validate } from '../lib/form';
import { defaultDeparture, fromLocalInputValue } from '../lib/format';

/**
 * «boundary» TripPlannerUI (UC-05). Submitting always produces an estimate.
 */
export function PlanTrip() {
  const navigate = useNavigate();
  const vehicles = useAsync(() => vehiclesApi.list(), []);
  const [origin, setOrigin] = useState<LocationRef | null>(null);
  const [destination, setDestination] = useState<LocationRef | null>(null);
  const [departure, setDeparture] = useState(defaultDeparture());
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [returnDeparture, setReturnDeparture] = useState('');
  const [parking, setParking] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = vehicles.data?.vehicles ?? [];
  const chosenVehicle = vehicleId || list[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      vehicleProfileId: chosenVehicle,
      origin: origin ?? { name: '', lat: NaN, lng: NaN },
      destination: destination ?? { name: '', lat: NaN, lng: NaN },
      departureTime: fromLocalInputValue(departure),
      isReturnTrip,
      returnDepartureTime: isReturnTrip ? fromLocalInputValue(returnDeparture) : '',
      parkingDurationMin: parking,
    };
    const { data, errors: fieldErrors } = validate(tripSchema, payload);
    if (!origin) fieldErrors['origin.name'] = 'Choose an origin from the suggestions';
    if (!destination) fieldErrors['destination.name'] = 'Choose a destination from the suggestions';
    setErrors(fieldErrors);
    if (!data || Object.keys(fieldErrors).length) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await tripsApi.plan(data);
      navigate(`/app/trips/${result.trip.id}`, { state: { estimateError: result.estimateError } });
    } catch (err) {
      const d = describeError(err);
      setErrors(d.fields);
      setMessage(d.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <MapStage
      map={
        <TripMap
          origin={origin}
          destination={destination}
          label="Map of Singapore showing the chosen origin and destination"
        />
      }
    >
      <StagePanel labelledBy="plan-title">
        <div>
          <h1 id="plan-title" className="text-2xl font-black tracking-tight">
            Plan a trip
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Origin, destination and departure time in Singapore. The estimate prices each leg at its
            own departure time.
          </p>
        </div>
        {vehicles.loading ? (
          <Loading what="Loading your vehicles" />
        ) : vehicles.error ? (
          <Alert kind="error">{vehicles.error}</Alert>
        ) : list.length === 0 ? (
          <Alert kind="warning">
            You need a vehicle profile before planning.{' '}
            <Link to="/app/vehicles/new" className="font-bold underline">
              Add one now
            </Link>
            .
          </Alert>
        ) : (
          <form className="grid gap-5" onSubmit={onSubmit} noValidate>
            {message && <Alert kind="error">{message}</Alert>}
            <div className="grid gap-4 rounded-[18px] border border-line bg-sand/60 p-3.5">
              <LocationPicker
                id="origin"
                label="Origin"
                marker="origin"
                value={origin}
                onChange={setOrigin}
                error={errors['origin.name'] ?? errors.origin}
              />
              <LocationPicker
                id="destination"
                label="Destination"
                marker="destination"
                value={destination}
                onChange={setDestination}
                error={errors['destination.name'] ?? errors.destination}
              />
            </div>
            <Field id="departure" label="Departure (Singapore time)" error={errors.departureTime}>
              <input
                id="departure"
                type="datetime-local"
                className="input"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
            </Field>
            <label className="flex min-h-13 cursor-pointer items-center justify-between gap-3 rounded-control bg-tool px-4 text-[15px] font-bold">
              This is a return trip
              <input
                type="checkbox"
                className="switch"
                checked={isReturnTrip}
                onChange={(e) => setIsReturnTrip(e.target.checked)}
              />
            </label>
            {isReturnTrip && (
              <Field
                id="returnDeparture"
                label="Return departure (Singapore time)"
                error={errors.returnDepartureTime}
              >
                <input
                  id="returnDeparture"
                  type="datetime-local"
                  className="input"
                  value={returnDeparture}
                  onChange={(e) => setReturnDeparture(e.target.value)}
                />
              </Field>
            )}
            <Field
              id="parking"
              label="Expected parking at the destination (minutes)"
              error={errors.parkingDurationMin}
              hint="Leave blank to assume 60 minutes; the assumption is disclosed in the derivation. Enter 0 for no parking."
            >
              <input
                id="parking"
                className="input"
                inputMode="numeric"
                value={parking}
                onChange={(e) => setParking(e.target.value)}
                placeholder="60"
              />
            </Field>
            <Field id="vehicle" label="Vehicle" error={errors.vehicleProfileId}>
              <select
                id="vehicle"
                className="input"
                value={chosenVehicle}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                {list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayName} ({v.consumptionRate} L/100 km,{' '}
                    {v.ownershipType === 'RENTED' ? 'rented' : 'owned'})
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className="btn-primary min-h-13 text-base" disabled={busy}>
              {busy ? 'Estimating…' : 'Estimate this trip'}
              {!busy && <IconArrowRight className="h-4.5 w-4.5" />}
            </button>
          </form>
        )}
      </StagePanel>
    </MapStage>
  );
}
