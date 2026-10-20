import type { PrismaClient } from '@prisma/client';
import type { TrafficIncidentService, WeatherService } from './adapters/conditions';
import type { ParkingRateService } from './adapters/parking';
import type { RoutingService } from './adapters/routing';
import type { Config } from './config';
import type { Mailer } from './lib/mailer';
import type { Monitor } from './lib/monitor';

/**
 * Container for the dependencies shared by every router and control module.
 * The single place where concrete providers are chosen, so tests can inject mocks.
 */
export interface AppDeps {
  prisma: PrismaClient;
  routing: RoutingService;
  parking: ParkingRateService;
  config: Config;
  /** Sends password reset emails; defaults to the configured SMTP server or the server log. */
  mailer?: Mailer;
  /**
   * Live traffic incidents and weather forecasts for the estimate page. Null means the feature is
   * off; left out, they are chosen from the configuration (TRAFFIC_PROVIDER, WEATHER_PROVIDER).
   */
  traffic?: TrafficIncidentService | null;
  weather?: WeatherService | null;
  /** Traffic counts and outside-service status for the administrator; created if not given. */
  monitor?: Monitor;
}
