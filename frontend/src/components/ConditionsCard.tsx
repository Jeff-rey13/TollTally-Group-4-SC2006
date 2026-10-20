import type { PlaceForecastDto, TripConditionsDto } from '@tolltally/shared';
import { formatTime } from '../lib/format';
import { IconCloud, IconRain, IconRefresh, IconWarning } from './icons';
import { Alert } from './ui';

const POINT_LABEL: Record<PlaceForecastDto['point'], string> = {
  start: 'Leaving',
  destination: 'Arriving',
  return: 'Heading back',
};

interface Props {
  conditions: TripConditionsDto | null;
  loading: boolean;
  error: string | null;
  isMotorcycle: boolean;
  onRefresh: () => void;
}

/**
 * «boundary» part of EstimateResultsUI (UC-06): live traffic incidents on the route (FR-EST-17)
 * and the rain forecast at each end of the trip (FR-EST-18). Shown beside the estimate, never
 * added to it.
 */
export function ConditionsCard({ conditions, loading, error, isMotorcycle, onRefresh }: Props) {
  if (conditions && conditions.incidents.status === 'off' && conditions.weather.status === 'off') {
    return null;
  }
  const incidents = conditions?.incidents;
  const weather = conditions?.weather;
  const sources = [incidents?.source, weather?.source].filter(
    (s, i, all): s is string => Boolean(s) && all.indexOf(s) === i,
  );

  return (
    <section
      aria-labelledby="conditions-title"
      aria-busy={loading}
      className="rounded-2xl border border-line p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="conditions-title" className="font-extrabold">
          Road and weather
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-mint-deep underline disabled:opacity-60"
          disabled={loading}
          onClick={onRefresh}
        >
          <IconRefresh className="h-4 w-4" />
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error && !conditions && (
        <p className="mt-2 text-sm">
          Road and weather information could not be loaded. The estimate is not affected.
        </p>
      )}
      {loading && !conditions && (
        <p className="mt-2 text-sm text-muted">Checking traffic and the forecast…</p>
      )}

      {conditions && incidents && weather && (
        <div className="mt-3 grid gap-4">
          {isMotorcycle && weather.rainLikely && (
            <Alert kind="warning">
              Rain is forecast on your ride. Allow extra time and pack your rain gear.
            </Alert>
          )}

          {incidents.status !== 'off' && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <IconWarning className="h-4 w-4 text-[#c2410c]" />
                Traffic incidents
              </h3>
              <p className="mt-1 text-sm">{incidents.message}</p>
              {incidents.items.length > 0 && (
                <ul className="mt-2 grid gap-2" aria-label="Incidents on your route">
                  {incidents.items.map((i, n) => (
                    <li key={n} className="rounded-xl bg-tool px-3 py-2 text-sm leading-snug">
                      <span className="badge-amber mr-2">{i.type}</span>
                      {i.message}
                      <span className="block text-xs text-muted">
                        About {i.alongKm} km into your route
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {weather.status !== 'off' && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                {weather.rainLikely ? (
                  <IconRain className="h-4 w-4 text-mint-deep" />
                ) : (
                  <IconCloud className="h-4 w-4 text-mint-deep" />
                )}
                Weather
              </h3>
              <p className="mt-1 text-sm">{weather.message}</p>
              {weather.forecasts.length > 0 && (
                <ul className="mt-2 grid gap-1.5" aria-label="Forecast along your trip">
                  {weather.forecasts.map((f) => (
                    <li key={f.point} className="flex items-start gap-2 text-sm leading-snug">
                      {f.rain ? (
                        <IconRain className="mt-0.5 h-4 w-4 text-[#1d4ed8]" />
                      ) : (
                        <IconCloud className="mt-0.5 h-4 w-4 text-muted" />
                      )}
                      <span>
                        <span className="font-bold">
                          {POINT_LABEL[f.point]} {formatTime(f.at)}:
                        </span>{' '}
                        {f.forecast}
                        <span className="block text-xs text-muted">
                          {f.area}, {f.basis} forecast
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="hint mt-0">
            {sources.length > 0 && <>From {sources.join(' and ')}, </>}checked at{' '}
            {formatTime(conditions.checkedAt)}. This is live information and does not change the
            estimate.
          </p>
        </div>
      )}
    </section>
  );
}
