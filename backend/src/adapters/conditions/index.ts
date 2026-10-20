import type { Config } from '../../config';
import type { TrafficIncidentService, WeatherService } from './ConditionServices';
import { LtaIncidentAdapter } from './LtaIncidentAdapter';
import { MockIncidentAdapter, MockWeatherAdapter } from './MockConditionAdapters';
import { NeaWeatherAdapter } from './NeaWeatherAdapter';

/**
 * Picks the traffic incident source: LTA when an account key is set, demo data in demo mode,
 * otherwise none (the feature shows as not set up).
 */
export function buildTrafficService(config: Config): TrafficIncidentService | null {
  const choice =
    config.TRAFFIC_PROVIDER === 'auto'
      ? config.LTA_ACCOUNT_KEY
        ? 'lta'
        : config.ROUTING_PROVIDER === 'mock'
          ? 'mock'
          : 'off'
      : config.TRAFFIC_PROVIDER;
  if (choice === 'lta' && config.LTA_ACCOUNT_KEY) {
    return new LtaIncidentAdapter(config.LTA_ACCOUNT_KEY, config.EXTERNAL_TIMEOUT_MS);
  }
  if (choice === 'mock') return new MockIncidentAdapter();
  return null;
}

/** Picks the forecast source: data.gov.sg (no key needed), demo data in demo mode, or none. */
export function buildWeatherService(config: Config): WeatherService | null {
  const choice =
    config.WEATHER_PROVIDER === 'auto'
      ? config.ROUTING_PROVIDER === 'mock'
        ? 'mock'
        : 'nea'
      : config.WEATHER_PROVIDER;
  if (choice === 'nea') {
    return new NeaWeatherAdapter(config.EXTERNAL_TIMEOUT_MS, config.DATA_GOV_SG_API_KEY);
  }
  if (choice === 'mock') return new MockWeatherAdapter();
  return null;
}

export * from './ConditionServices';
export { LtaIncidentAdapter, parseIncidents, LTA_INCIDENTS_URL } from './LtaIncidentAdapter';
export {
  NeaWeatherAdapter,
  parseDaily,
  parseTwoHour,
  DATA_GOV_WEATHER_BASE,
} from './NeaWeatherAdapter';
export { MockIncidentAdapter, MockWeatherAdapter } from './MockConditionAdapters';
