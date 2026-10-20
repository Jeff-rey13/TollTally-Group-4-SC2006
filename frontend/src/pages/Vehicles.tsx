import { useState } from 'react';
import { Link } from 'react-router';
import { FUEL_TYPE_LABELS, OWNERSHIP_LABELS } from '@tolltally/shared';
import { describeError } from '../api/client';
import { vehiclesApi } from '../api/endpoints';
import { Alert, EmptyState, Page, PageHeader, SkeletonList } from '../components/ui';
import { IconCar, IconMotorcycle, IconPlus } from '../components/icons';
import { useAsync } from '../hooks/useAsync';

/**
 * «boundary» VehicleProfileUI list: archive, restore and delete (UC-04).
 */
export function Vehicles() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, loading, error, reload } = useAsync(
    () => vehiclesApi.list(includeArchived),
    [includeArchived],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      await action();
      reload();
    } catch (err) {
      setMessage(describeError(err).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Vehicle profiles"
        lede="Consumption rate and tank capacity drive every fuel estimate. A rented profile unlocks fuel top-up planning."
        actions={
          <Link to="/app/vehicles/new" className="btn-primary">
            <IconPlus className="h-4.5 w-4.5" />
            Add vehicle
          </Link>
        }
      />
      <label className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-control bg-white/80 px-3 text-sm font-semibold">
        <input
          type="checkbox"
          className="switch"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        Show archived profiles
      </label>
      {message && (
        <div className="mb-4">
          <Alert kind="error">{message}</Alert>
        </div>
      )}
      {loading ? (
        <SkeletonList what="Loading your vehicles" />
      ) : error ? (
        <Alert kind="error">{error}</Alert>
      ) : data && data.vehicles.length === 0 ? (
        <EmptyState
          title="No vehicle profiles yet"
          body="Add the vehicle you drive so trips can be priced."
          action={{ to: '/app/vehicles/new', label: 'Add vehicle' }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.vehicles.map((v) => (
            <li
              key={v.id}
              className={`card flex flex-col gap-4 ${v.isArchived ? 'bg-sand opacity-80' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${v.ownershipType === 'RENTED' ? 'bg-amber-soft text-amber' : 'bg-mint-soft text-mint-deep'}`}
                >
                  {v.vehicleClass === 'MOTORCYCLE' ? <IconMotorcycle /> : <IconCar />}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg leading-snug font-extrabold wrap-anywhere">
                    {v.displayName}
                  </h2>
                  {(v.make || v.model) && (
                    <p className="text-sm text-muted">
                      {[v.make, v.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <span className={v.ownershipType === 'RENTED' ? 'badge-amber' : 'badge-mint'}>
                      {OWNERSHIP_LABELS[v.ownershipType]}
                    </span>
                    {v.vehicleClass === 'MOTORCYCLE' && (
                      <span className="badge-grey">Motorcycle</span>
                    )}
                    <span className="badge-grey">{FUEL_TYPE_LABELS[v.fuelType]}</span>
                    {v.isArchived && <span className="badge-dark">Archived</span>}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-sand p-3">
                <div>
                  <dt className="text-xs text-muted">L/100 km</dt>
                  <dd className="text-lg font-extrabold">{v.consumptionRate}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Tank (L)</dt>
                  <dd className="text-lg font-extrabold">{v.tankCapacity}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-1 border-t border-line pt-3">
                <Link to={`/app/vehicles/${v.id}`} className="btn-ghost">
                  Edit
                </Link>
                {v.isArchived ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => run(`restore-${v.id}`, () => vehiclesApi.unarchive(v.id))}
                  >
                    {busy === `restore-${v.id}` ? 'Restoring…' : 'Restore'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => run(`archive-${v.id}`, () => vehiclesApi.archive(v.id))}
                  >
                    {busy === `archive-${v.id}` ? 'Archiving…' : 'Archive'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-danger ml-auto"
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${v.displayName}? Profiles used by saved trips can only be archived.`,
                      )
                    ) {
                      void run(`remove-${v.id}`, () => vehiclesApi.remove(v.id));
                    }
                  }}
                >
                  {busy === `remove-${v.id}` ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
