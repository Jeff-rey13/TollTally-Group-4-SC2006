import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import type { HealthDto } from '@tolltally/shared';
import { buildTrafficService, buildWeatherService } from './adapters/conditions';
import { MAP_IMAGE_ORIGINS } from './adapters/routing';
import type { AppDeps } from './deps';
import { PrismaSessionStore } from './lib/sessionStore';
import { requireAuth, requireRole } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { byIp, byIpAndEmail, byUser, rateLimit } from './middleware/rateLimit';
import { createMailer } from './lib/mailer';
import { Monitor } from './lib/monitor';
import { requestLog } from './middleware/requestLog';
import { securityHeaders } from './middleware/security';
import { adminRoutes } from './modules/admin/routes';
import { SESSION_COOKIE, authRoutes } from './modules/auth/routes';
import { locationRoutes } from './modules/locations/routes';
import { optimisationRoutes } from './modules/optimisation/routes';
import { historyRoutes, recordRoutes } from './modules/records/routes';
import { referenceRoutes } from './modules/reference/routes';
import { topUpRoutes } from './modules/topup/routes';
import { tripRoutes } from './modules/trips/routes';
import { vehicleRoutes } from './modules/vehicles/routes';

/**
 * Builds the Express application (start-up assembly).
 * Registers security headers, the database-backed session store, one router per SRS feature,
 * the role guards and the error handler. Tests call it with mock adapters and a test database.
 * @param deps the shared dependencies (database, routing, parking, configuration)
 * @returns the configured Express app, not yet listening
 */
export function createApp(appDeps: AppDeps): express.Express {
  const { config } = appDeps;
  const monitor = appDeps.monitor ?? new Monitor(appDeps.prisma);
  monitor.start();
  // Every router sees the routing provider through the monitor, so the overview knows how the
  // last calls went.
  const traffic = appDeps.traffic === undefined ? buildTrafficService(config) : appDeps.traffic;
  const weather = appDeps.weather === undefined ? buildWeatherService(config) : appDeps.weather;
  const deps: AppDeps = {
    ...appDeps,
    monitor,
    routing: monitor.trackRouting(appDeps.routing),
    traffic: traffic ? monitor.trackTraffic(traffic) : null,
    weather: weather ? monitor.trackWeather(weather) : null,
  };
  const app = express();
  app.locals.monitor = monitor;
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders(config.NODE_ENV === 'production', MAP_IMAGE_ORIGINS));
  app.use(express.json({ limit: '200kb' }));
  if (config.NODE_ENV === 'development') app.use(requestLog);
  app.use(monitor.middleware());

  const ttlMs = config.SESSION_TTL_MINUTES * 60 * 1000;
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.SESSION_SECRET,
      store: new PrismaSessionStore(deps.prisma, ttlMs),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        maxAge: ttlMs,
      },
    }),
  );

  const mailer = monitor.trackMail(deps.mailer ?? createMailer(config));
  const limits = config.RATE_LIMITS === 'on';
  const MINUTE = 60 * 1000;
  // Every API request: a ceiling no normal use reaches.
  app.use(
    '/api',
    rateLimit({ name: 'api', windowMs: MINUTE, max: 600, key: byIp, enabled: limits }),
  );
  // Sign-in: 10 tries per address and email in 15 minutes, 100 per address across all emails.
  const signInPerAccount = rateLimit({
    name: 'login-account',
    windowMs: 15 * MINUTE,
    max: 10,
    key: byIpAndEmail,
    enabled: limits,
    message: 'Too many sign-in attempts for this email. Wait 15 minutes and try again.',
  });
  const signInPerAddress = rateLimit({
    name: 'login-ip',
    windowMs: 15 * MINUTE,
    max: 100,
    key: byIp,
    enabled: limits,
    message: 'Too many sign-in attempts from this network. Wait 15 minutes and try again.',
  });
  app.post('/api/auth/login', signInPerAddress, signInPerAccount);
  app.post(
    '/api/auth/register',
    rateLimit({
      name: 'register',
      windowMs: 60 * MINUTE,
      max: 20,
      key: byIp,
      enabled: limits,
      message: 'Too many accounts created from this network. Try again in an hour.',
    }),
  );
  // Password reset requests: a few per email, so nobody can flood someone's inbox.
  app.post(
    '/api/auth/forgot-password',
    rateLimit({
      name: 'forgot-ip',
      windowMs: 60 * MINUTE,
      max: 20,
      key: byIp,
      enabled: limits,
      message: 'Too many reset requests from this network. Try again in an hour.',
    }),
    rateLimit({
      name: 'forgot-account',
      windowMs: 60 * MINUTE,
      max: 5,
      key: byIpAndEmail,
      enabled: limits,
      message: 'Too many reset requests for this email. Check your inbox, or try again in an hour.',
    }),
  );
  app.post(
    '/api/auth/reset-password',
    rateLimit({ name: 'reset', windowMs: 15 * MINUTE, max: 20, key: byIp, enabled: limits }),
  );
  // Calls that reach OneMap: location search, and every request that plans or re-prices a trip.
  app.use(
    '/api/locations',
    rateLimit({ name: 'search', windowMs: MINUTE, max: 60, key: byUser, enabled: limits }),
  );
  const pricing = rateLimit({
    name: 'pricing',
    windowMs: MINUTE,
    max: 30,
    key: byUser,
    enabled: limits,
  });
  app.use('/api/trips', (req, res, next) =>
    req.method === 'POST' ? pricing(req, res, next) : next(),
  );

  app.get('/api/health', (_req, res) => {
    const body: HealthDto = {
      ok: true,
      routingProvider: deps.routing.name,
      routingReady:
        deps.config.ROUTING_PROVIDER !== 'onemap' ||
        Boolean(deps.config.ONEMAP_EMAIL && deps.config.ONEMAP_PASSWORD),
      mailReady: mailer.delivers,
      parkingProvider: deps.parking.name,
      trafficProvider: deps.traffic?.name ?? null,
      weatherProvider: deps.weather?.name ?? null,
      time: new Date().toISOString(),
    };
    res.json(body);
  });

  app.use('/api/auth', authRoutes(deps, mailer));
  app.use('/api/vehicles', requireAuth, vehicleRoutes(deps));
  app.use('/api/reference', requireAuth, referenceRoutes(deps));
  app.use('/api/locations', requireAuth, locationRoutes(deps));
  app.use('/api/trips', requireAuth, tripRoutes(deps));
  app.use('/api/trips', requireAuth, optimisationRoutes(deps));
  app.use('/api/trips', requireAuth, topUpRoutes(deps));
  app.use('/api/trips', requireAuth, recordRoutes(deps));
  app.use('/api/history', requireAuth, historyRoutes(deps));
  app.use('/api/admin', requireRole('ADMINISTRATOR'), adminRoutes({ ...deps, mailer }));
  app.use('/api', notFoundHandler);

  serveFrontend(app, config.STATIC_DIR);
  app.use(errorHandler);
  return app;
}

/**
 * Client-side screens the single-page app can draw. Any other path still gets the app (so it can
 * show its "No road here" page) but with a real 404 status for browsers, crawlers and monitors.
 */
const APP_SCREENS: RegExp[] = [
  /^\/$/,
  /^\/(sign-in|register|privacy|forgot-password|reset-password)$/,
  /^\/app(\/(plan|vehicles|vehicles\/new|history))?$/,
  /^\/app\/vehicles\/[^/]+$/,
  /^\/app\/trips\/[^/]+(\/(compare|optimise|top-up))?$/,
  /^\/app\/history\/[^/]+\/log$/,
  /^\/admin(\/(overview|fuel-prices|erp-rates|efficiency))?$/,
];

export function isAppScreen(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return APP_SCREENS.some((pattern) => pattern.test(path));
}

function serveFrontend(app: express.Express, staticDir?: string): void {
  // Resolved to an absolute path, since sendFile refuses relative ones (STATIC_DIR may be relative).
  const dir = path.resolve(staticDir ?? path.join(__dirname, '..', '..', 'frontend', 'dist'));
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) return;
  // Built assets have content hashes in their names, so browsers may keep them for a year.
  app.use(
    '/assets',
    express.static(path.join(dir, 'assets'), { index: false, maxAge: '365d', immutable: true }),
  );
  app.use(express.static(dir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.status(isAppScreen(req.path) ? 200 : 404).sendFile(index);
  });
}
