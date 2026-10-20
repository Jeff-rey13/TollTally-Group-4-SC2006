import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AdminOverviewDto } from '@tolltally/shared';
import { MockRoutingAdapter } from '../../src/adapters/routing';
import { TableParkingAdapter } from '../../src/adapters/parking';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { ExternalServiceError } from '../../src/lib/errors';
import { Monitor, UNKNOWN_API_ENDPOINT, normalisePath } from '../../src/lib/monitor';
import {
  CAR,
  PLACE,
  adminAgent,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

describe('Administrator overview: users, traffic and service health', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('is only for administrators', async () => {
    expect((await request(ctx.app).get('/api/admin/overview')).status).toBe(401);
    const { agent } = await signedInAgent(ctx.app);
    expect((await agent.get('/api/admin/overview')).status).toBe(403);
    expect((await agent.post('/api/admin/health-check')).status).toBe(403);
  });

  it('counts drivers, signed-in accounts, trips and the requests that made them', async () => {
    const admin = await adminAgent(ctx.app);
    const before = (await admin.get('/api/admin/overview')).body.overview as AdminOverviewDto;

    const { agent } = await signedInAgent(ctx.app);
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    const trip = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 60,
    });
    expect(trip.status).toBe(201);
    await agent.get(`/api/trips/${trip.body.trip.id}`);
    await agent.get('/api/no-such-thing/at-all');

    const res = await admin.get('/api/admin/overview');
    expect(res.status).toBe(200);
    const o = res.body.overview as AdminOverviewDto;

    expect(o.users.drivers).toBeGreaterThanOrEqual(before.users.drivers + 1);
    expect(o.users.newLast7Days).toBeGreaterThanOrEqual(1);
    expect(o.users.signedInNow).toBeGreaterThanOrEqual(2);
    expect(o.users.activeLast7Days).toBeGreaterThanOrEqual(1);
    expect(o.users.registrationsByDay).toHaveLength(14);
    expect(o.usage.trips).toBeGreaterThanOrEqual(before.usage.trips + 1);
    expect(o.usage.tripsByDay.at(-1)!.count).toBeGreaterThanOrEqual(1);

    expect(o.traffic.byHour).toHaveLength(24);
    expect(o.traffic.byDay).toHaveLength(14);
    expect(o.traffic.last24Hours.requests).toBeGreaterThan(before.traffic.last24Hours.requests);
    const endpoints = o.traffic.topEndpoints.map((e) => e.endpoint);
    expect(endpoints).toContain('POST /api/trips');
    expect(endpoints).toContain('GET /api/trips/:id');
    expect(o.traffic.last24Hours.clientErrors).toBeGreaterThanOrEqual(1);
  });

  it('reports the health of each part, with demo routing and no email flagged', async () => {
    const admin = await adminAgent(ctx.app);
    const o = (await admin.post('/api/admin/health-check')).body.overview as AdminOverviewDto;
    const status = Object.fromEntries(o.health.checks.map((c) => [c.key, c.status]));
    expect(status).toMatchObject({
      server: 'ok',
      database: 'ok',
      routing: 'warning',
      mail: 'off',
      erp: 'ok',
      holidays: 'ok',
    });
    expect(o.health.overall).not.toBe('down');
    expect(o.health.server.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('shows live routing as down when the provider rejects the login', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      RATE_LIMITS: 'off',
      ROUTING_PROVIDER: 'onemap',
      ONEMAP_EMAIL: 'someone@test.local',
      ONEMAP_PASSWORD: 'wrong',
    });
    const failing = new MockRoutingAdapter();
    failing.route = async () => {
      throw new ExternalServiceError('routing', 'UNAUTHORISED', 'login rejected');
    };
    const app = createApp({
      prisma: ctx.prisma,
      routing: failing,
      parking: new TableParkingAdapter(ctx.prisma, config.PARKING_SEARCH_RADIUS_KM),
      config,
      monitor: new Monitor(ctx.prisma),
    });
    const admin = await adminAgent(app);
    const o = (await admin.post('/api/admin/health-check')).body.overview as AdminOverviewDto;
    const routing = o.health.checks.find((c) => c.key === 'routing')!;
    expect(routing.status).toBe('down');
    expect(routing.detail).toContain('login rejected');
    expect(o.health.overall).toBe('down');
  });
});

describe('Traffic counting', () => {
  it('replaces record IDs in paths so each endpoint is counted once', () => {
    expect(normalisePath('/api/trips/cmh1x2y3z4a5b6c7d8e9f0g1h/estimate?x=1')).toBe(
      '/api/trips/:id/estimate',
    );
    expect(normalisePath('/api/vehicles/')).toBe('/api/vehicles');
    expect(UNKNOWN_API_ENDPOINT).toMatch(/unknown/);
  });

  it('adds up requests, errors and response times per hour and saves them', async () => {
    const ctx = await createTestContext();
    const monitor = new Monitor(ctx.prisma);
    const at = new Date('2026-01-05T03:10:00Z');
    monitor.record('GET /api/test-counter', 200, 40, at);
    monitor.record('GET /api/test-counter', 500, 120, at);
    monitor.record('GET /api/test-counter', 429, 2, at);
    monitor.record('GET /api/test-counter', 404, 8, at);
    await monitor.flush();
    monitor.record('GET /api/test-counter', 200, 300, at);
    await monitor.flush();
    const row = await ctx.prisma.trafficHour.findUnique({
      where: {
        hour_endpoint: {
          hour: new Date('2026-01-05T03:00:00Z'),
          endpoint: 'GET /api/test-counter',
        },
      },
    });
    expect(row).toMatchObject({
      requests: 5,
      serverErrors: 1,
      rateLimited: 1,
      clientErrors: 1,
      totalMs: 470,
      maxMs: 300,
    });
    await ctx.prisma.trafficHour.deleteMany({ where: { endpoint: 'GET /api/test-counter' } });
    await ctx.prisma.$disconnect();
  });
});

describe('App opens', () => {
  it('counts the app asking for health, but not uptime monitors or the overview itself', async () => {
    const ctx = await createTestContext();
    const admin = await adminAgent(ctx.app);
    const before = (await admin.get('/api/admin/overview')).body.overview as AdminOverviewDto;
    await request(ctx.app).get('/api/health?app=1');
    await request(ctx.app).get('/api/health');
    await request(ctx.app).get('/api/health');
    await admin.get('/api/admin/overview');
    const after = (await admin.get('/api/admin/overview')).body.overview as AdminOverviewDto;
    expect(after.traffic.last24Hours.appOpens - before.traffic.last24Hours.appOpens).toBe(1);
    expect(after.traffic.topEndpoints.map((e) => e.endpoint)).not.toContain(
      'GET /api/admin/overview',
    );
    await ctx.prisma.$disconnect();
  });
});
