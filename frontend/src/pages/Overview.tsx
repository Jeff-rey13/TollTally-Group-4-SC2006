import { Link } from 'react-router';
import { historyApi, vehiclesApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Alert, Money, Page, PageHeader, SkeletonList } from '../components/ui';
import { IconArrowRight, IconCar, IconHistory, IconRoute } from '../components/icons';
import { useAsync } from '../hooks/useAsync';
import { formatDateTime } from '../lib/format';

/**
 * «boundary» Driver home screen with shortcuts to planning, vehicles and history.
 */
export function Overview() {
  const { user } = useAuth();
  const vehicles = useAsync(() => vehiclesApi.list(), []);
  const history = useAsync(() => historyApi.list(), []);
  const vehicleCount = vehicles.data?.vehicles.length ?? 0;
  const tripCount = history.data?.trips.length ?? 0;
  const recent = history.data?.trips.slice(0, 5) ?? [];

  return (
    <Page>
      <PageHeader
        title="Overview"
        lede={`Signed in as ${user?.email ?? ''}. Plan a trip to get an itemised estimate of fuel, ERP and parking.`}
      />
      {(vehicles.error || history.error) && (
        <div className="mb-4 grid gap-3">
          {vehicles.error && <Alert kind="error">{vehicles.error}</Alert>}
          {history.error && <Alert kind="error">{history.error}</Alert>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Link
          to="/app/plan"
          className="group flex min-h-48 flex-col justify-between gap-6 rounded-panel bg-ink p-6 text-white shadow-[0_12px_40px_rgb(21_33_29/0.18)] transition hover:bg-ink-soft"
        >
          <span className="flex items-start justify-between">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-mint">
              <IconRoute />
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-ink transition group-hover:translate-x-0.5">
              <IconArrowRight />
            </span>
          </span>
          <span>
            <span className="block text-[1.75rem] leading-tight font-black tracking-tight">
              Plan a trip
            </span>
            <span className="mt-1 block text-sm text-white/75">
              {vehicleCount > 0
                ? 'Choose origin, destination, departure time and vehicle.'
                : 'Add a vehicle first, then plan.'}
            </span>
          </span>
        </Link>
        <Link
          to="/app/vehicles"
          className="card flex flex-col justify-between gap-6 transition hover:border-mint-deep"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-parking-soft text-parking">
            <IconCar />
          </span>
          <span>
            <span className="block text-lg font-extrabold">Vehicles</span>
            <span className="block text-sm text-muted">
              {vehicles.loading
                ? 'Loading…'
                : `${vehicleCount} active profile${vehicleCount === 1 ? '' : 's'}`}
            </span>
          </span>
        </Link>
        <Link
          to="/app/history"
          className="card flex flex-col justify-between gap-6 transition hover:border-mint-deep"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint-soft text-mint-deep">
            <IconHistory />
          </span>
          <span>
            <span className="block text-lg font-extrabold">History</span>
            <span className="block text-sm text-muted">
              {history.loading
                ? 'Loading…'
                : `${tripCount} saved trip${tripCount === 1 ? '' : 's'}`}
            </span>
          </span>
        </Link>
      </div>

      <section aria-labelledby="recent-title" className="mt-10">
        <h2 id="recent-title" className="mb-3 text-xl font-extrabold tracking-tight">
          Recent saved trips
        </h2>
        {history.loading ? (
          <SkeletonList what="Loading your saved trips" rows={2} />
        ) : recent.length === 0 ? (
          <p className="card text-sm text-muted">
            Nothing saved yet. Estimates you save appear here with their actual costs once logged.
          </p>
        ) : (
          <ul className="card divide-y divide-line p-0">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5"
              >
                <span
                  aria-hidden="true"
                  className="hidden h-10 w-10 place-items-center rounded-xl bg-tool text-mint-deep sm:grid"
                >
                  <IconRoute />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold wrap-anywhere">
                    {t.origin} to {t.destination}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(t.departureTime)} with {t.vehicleName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold">
                    {t.totalIsLowerBound ? 'At least ' : ''}
                    <Money value={t.estimatedTotal} />
                  </p>
                  <Link to={`/app/trips/${t.id}`} className="btn-ghost">
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
