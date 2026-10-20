import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  SESSION_SECRET: z.string().min(8).default('tolltally-dev-secret-change-me'),
  SESSION_TTL_MINUTES: z.coerce.number().positive().default(30),
  ROUTING_PROVIDER: z.enum(['mock', 'onemap']).default('mock'),
  PARKING_PROVIDER: z.enum(['mock', 'table']).default('table'),
  ONEMAP_EMAIL: z.string().optional(),
  ONEMAP_PASSWORD: z.string().optional(),
  GOOGLE_ROUTES_API_KEY: z.string().optional(),
  EXTERNAL_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  ESTIMATE_BUDGET_MS: z.coerce.number().int().positive().default(3000),
  COMPARISON_BUDGET_MS: z.coerce.number().int().positive().default(10000),
  ERP_BOUNDARY_TOLERANCE_MIN: z.coerce.number().min(0).default(5),
  // How close (metres) and how well aligned (degrees) a route must pass a gantry to count as crossing it.
  // Live routes follow real roads while gantry positions are surveyed points, so allow some slack.
  ERP_CROSSING_DISTANCE_M: z.coerce.number().positive().max(500).default(60),
  ERP_CROSSING_HEADING_DEG: z.coerce.number().positive().max(90).default(60),
  // When OneMap says the route is on the gantry's own road, allow this much distance instead.
  ERP_SAME_ROAD_DISTANCE_M: z.coerce.number().positive().max(1000).default(350),
  FUEL_RANGE_PERCENT: z.coerce.number().min(0).max(50).default(5),
  ROUTE_OPTION_COUNT: z.coerce.number().int().min(2).max(4).default(3),
  DEPARTURE_WINDOW_MIN: z.coerce.number().int().positive().default(60),
  DEPARTURE_INTERVAL_MIN: z.coerce.number().int().positive().default(15),
  PARKING_SEARCH_RADIUS_KM: z.coerce.number().positive().default(1),
  DEFAULT_PARKING_DURATION_MIN: z.coerce.number().int().min(0).default(60),
  FRESHNESS_FUEL_DAYS: z.coerce.number().positive().default(7),
  FRESHNESS_ERP_DAYS: z.coerce.number().positive().default(180),
  FRESHNESS_PARKING_DAYS: z.coerce.number().positive().default(30),
  STATIC_DIR: z.string().optional(),
  // Request limits against password guessing, mass sign-ups and OneMap quota abuse. Tests turn them off.
  RATE_LIMITS: z.enum(['on', 'off']).default('on'),
  // "Keep me signed in" lasts this many days; otherwise SESSION_TTL_MINUTES of inactivity applies.
  REMEMBER_ME_DAYS: z.coerce.number().int().positive().max(90).default(30),
  // Password reset emails. Without SMTP_HOST the reset link is printed in the server log instead.
  APP_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('TollTally <no-reply@tolltally.local>'),
  PASSWORD_RESET_MINUTES: z.coerce.number().int().positive().max(1440).default(30),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  LTA_ACCOUNT_KEY: z.string().optional(),
  // Live conditions shown next to an estimate. "auto" uses the live service when it can (traffic
  // needs LTA_ACCOUNT_KEY) and the demo data when routing is in demo mode; "off" hides them.
  TRAFFIC_PROVIDER: z.enum(['auto', 'lta', 'mock', 'off']).default('auto'),
  WEATHER_PROVIDER: z.enum(['auto', 'nea', 'mock', 'off']).default('auto'),
  // Optional data.gov.sg key; the forecasts work without one at a lower request limit.
  DATA_GOV_SG_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  // Incidents are shown for trips leaving within this many minutes, if they lie this close to the route.
  INCIDENT_WINDOW_MIN: z.coerce.number().int().positive().max(240).default(120),
  INCIDENT_DISTANCE_M: z.coerce.number().positive().max(2000).default(300),
});

export type Config = z.infer<typeof schema>;

function loadDotEnv(): void {
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch {
      console.warn(`Could not read ${file}`);
    }
  }
}

/**
 * Reads and validates every environment setting, including the SRS Appendix D calculation policy
 * (ERP boundary tolerance, fuel range, route option count, departure window, freshness thresholds).
 * @param overrides values that take precedence over process.env, used by tests
 * @throws Error when a setting is missing or invalid
 */
export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  loadDotEnv();
  const parsed = schema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${detail}`);
  }
  return parsed.data;
}
