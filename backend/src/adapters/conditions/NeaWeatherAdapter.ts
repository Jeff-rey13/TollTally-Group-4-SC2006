import type { ForecastRegion } from '../../domain/conditions';
import { ExternalServiceError } from '../../lib/errors';
import { fetchJson } from '../../lib/http';
import {
  Cached,
  type DailyForecast,
  type TwoHourForecast,
  type WeatherService,
} from './ConditionServices';

/** data.gov.sg real-time weather API (forecasts by the Meteorological Service Singapore, NEA). */
export const DATA_GOV_WEATHER_BASE = 'https://api-open.data.gov.sg/v2/real-time/api';

interface TwoHourResponse {
  code?: number;
  data?: {
    area_metadata?: { name?: string; label_location?: { latitude?: number; longitude?: number } }[];
    items?: {
      valid_period?: { start?: string; end?: string; text?: string };
      forecasts?: { area?: string; forecast?: string }[];
    }[];
  };
}

interface DailyResponse {
  code?: number;
  data?: {
    records?: {
      periods?: {
        timePeriod?: { start?: string; end?: string; text?: string };
        regions?: Partial<Record<ForecastRegion, { text?: string }>>;
      }[];
    }[];
  };
}

const REGIONS: ForecastRegion[] = ['north', 'south', 'east', 'west', 'central'];

function malformed(what: string): never {
  throw new ExternalServiceError('weather', 'MALFORMED', `The weather service returned no ${what}`);
}

/**
 * «adapter» for the data.gov.sg 2-hour and 24-hour forecasts. No key is needed; with
 * DATA_GOV_SG_API_KEY set it is sent as x-api-key for a higher request limit. Forecasts are kept
 * for ten minutes; the 2-hour forecast is issued every half hour.
 */
export class NeaWeatherAdapter implements WeatherService {
  readonly name = 'data.gov.sg (NEA)';
  private readonly twoHourCache: Cached<TwoHourForecast>;
  private readonly dailyCache: Cached<DailyForecast>;

  constructor(
    private readonly timeoutMs: number,
    private readonly apiKey?: string,
  ) {
    this.twoHourCache = new Cached(10 * 60 * 1000, () => this.fetchTwoHour());
    this.dailyCache = new Cached(10 * 60 * 1000, () => this.fetchDaily());
  }

  twoHour(): Promise<TwoHourForecast> {
    return this.twoHourCache.get();
  }

  daily(): Promise<DailyForecast> {
    return this.dailyCache.get();
  }

  private headers(): Record<string, string> {
    return this.apiKey
      ? { accept: 'application/json', 'x-api-key': this.apiKey }
      : { accept: 'application/json' };
  }

  private async fetchTwoHour(): Promise<TwoHourForecast> {
    const res = await fetchJson<TwoHourResponse>(
      'weather',
      `${DATA_GOV_WEATHER_BASE}/two-hr-forecast`,
      { headers: this.headers() },
      this.timeoutMs,
    );
    return parseTwoHour(res);
  }

  private async fetchDaily(): Promise<DailyForecast> {
    const res = await fetchJson<DailyResponse>(
      'weather',
      `${DATA_GOV_WEATHER_BASE}/twenty-four-hr-forecast`,
      { headers: this.headers() },
      this.timeoutMs,
    );
    return parseDaily(res);
  }
}

export function parseTwoHour(res: TwoHourResponse): TwoHourForecast {
  const item = res?.data?.items?.[0];
  const start = item?.valid_period?.start;
  const end = item?.valid_period?.end;
  if (!item || !start || !end || !Array.isArray(item.forecasts)) malformed('2-hour forecast');
  const where = new Map<string, { lat: number; lng: number }>();
  for (const a of res.data?.area_metadata ?? []) {
    const lat = Number(a.label_location?.latitude);
    const lng = Number(a.label_location?.longitude);
    if (a.name && Number.isFinite(lat) && Number.isFinite(lng)) where.set(a.name, { lat, lng });
  }
  const areas = item.forecasts.flatMap((f) => {
    const pos = f.area ? where.get(f.area) : undefined;
    return pos && f.forecast
      ? [{ name: f.area!, lat: pos.lat, lng: pos.lng, forecast: f.forecast }]
      : [];
  });
  if (!areas.length) malformed('forecast areas');
  return {
    validFrom: new Date(start),
    validTo: new Date(end),
    periodText: item.valid_period?.text ?? '',
    areas,
  };
}

export function parseDaily(res: DailyResponse): DailyForecast {
  const periods = res?.data?.records?.[0]?.periods;
  if (!Array.isArray(periods) || !periods.length) malformed('24-hour forecast');
  return {
    periods: periods.flatMap((p) => {
      const from = p.timePeriod?.start;
      const to = p.timePeriod?.end;
      if (!from || !to || !p.regions) return [];
      const regions = Object.fromEntries(
        REGIONS.map((r) => [r, p.regions?.[r]?.text ?? '']),
      ) as Record<ForecastRegion, string>;
      return [{ from: new Date(from), to: new Date(to), text: p.timePeriod?.text ?? '', regions }];
    }),
  };
}
