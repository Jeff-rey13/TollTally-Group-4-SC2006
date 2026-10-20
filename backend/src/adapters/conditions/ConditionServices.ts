import type { ForecastRegion, TrafficIncident } from '../../domain/conditions';

/**
 * «interface» for a source of current traffic incidents (accidents, roadworks, breakdowns and
 * similar), each with a position and a description.
 */
export interface TrafficIncidentService {
  readonly name: string;
  incidents(): Promise<TrafficIncident[]>;
}

export interface TwoHourForecast {
  validFrom: Date;
  validTo: Date;
  /** For example "10.30 am to 12.30 pm". */
  periodText: string;
  areas: { name: string; lat: number; lng: number; forecast: string }[];
}

export interface DailyForecast {
  periods: {
    from: Date;
    to: Date;
    /** For example "6 am to Midday 18 Oct". */
    text: string;
    regions: Record<ForecastRegion, string>;
  }[];
}

/**
 * «interface» for weather forecasts: a 2-hour forecast by town and a 24-hour forecast by region.
 */
export interface WeatherService {
  readonly name: string;
  twoHour(): Promise<TwoHourForecast>;
  daily(): Promise<DailyForecast>;
}

/** Keeps the last answer for a while so a page of estimates does not call the provider each time. */
export class Cached<T> {
  private value: T | null = null;
  private at = 0;
  private pending: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  get(): Promise<T> {
    if (this.value !== null && Date.now() - this.at < this.ttlMs)
      return Promise.resolve(this.value);
    if (!this.pending) {
      this.pending = this.load()
        .then((v) => {
          this.value = v;
          this.at = Date.now();
          return v;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }
}
