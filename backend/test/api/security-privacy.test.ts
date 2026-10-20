import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MockRoutingAdapter } from '../../src/adapters/routing';
import { TableParkingAdapter } from '../../src/adapters/parking';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { PRIVACY_NOTICE_VERSION } from '@tolltally/shared';
import {
  CAR,
  PLACE,
  createTestContext,
  nextWeekday,
  signedInAgent,
  uniqueEmail,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

describe('Security headers, request limits and privacy consent', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  function limitedApp() {
    const config = loadConfig({ NODE_ENV: 'test', RATE_LIMITS: 'on' });
    return createApp({
      prisma: ctx.prisma,
      routing: new MockRoutingAdapter(),
      parking: new TableParkingAdapter(ctx.prisma, config.PARKING_SEARCH_RADIUS_KM),
      config,
    });
  }

  it('sends a content security policy and turns off browser features the app never uses', async () => {
    const res = await request(ctx.app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://www.onemap.gov.sg');
    expect(csp).not.toContain('unsafe-eval');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('answers an unknown API path with a JSON 404, not the web page', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('slows down password guessing on one account after 10 attempts in 15 minutes', async () => {
    const app = limitedApp();
    const { email } = await signedInAgent(ctx.app);
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'Wrong1234' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Wrong1234' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // A different account from the same network is still allowed to try.
    const other = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('other'), password: 'Wrong1234' });
    expect(other.status).toBe(401);
  });

  it('limits how many accounts one network can create in an hour', async () => {
    const app = limitedApp();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: uniqueEmail('bulk'), password: 'Driver1234', acceptPrivacy: true });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('refuses registration until the privacy notice is accepted, then records the consent', async () => {
    const email = uniqueEmail('consent');
    const refused = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email, password: 'Driver1234' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.fields.acceptPrivacy).toContain('privacy notice');

    const accepted = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email, password: 'Driver1234', acceptPrivacy: true });
    expect(accepted.status).toBe(201);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.privacyConsentAt).toBeInstanceOf(Date);
    expect(user.privacyNoticeVersion).toBe(PRIVACY_NOTICE_VERSION);
  });

  it('lets a driver delete the account and everything stored with it after confirming the password', async () => {
    const { agent, email } = await signedInAgent(ctx.app);
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    expect(vehicle.status).toBe(201);
    const trip = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 60,
    });
    expect(trip.status).toBe(201);
    await agent.post(`/api/trips/${trip.body.trip.id}/save`);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });

    const wrong = await agent.delete('/api/auth/account').send({ password: 'Wrong1234' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.password).toBeDefined();

    const ok = await agent.delete('/api/auth/account').send({ password: 'Driver1234' });
    expect(ok.status).toBe(204);
    expect(await ctx.prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await ctx.prisma.vehicleProfile.count({ where: { driverId: user.id } })).toBe(0);
    expect(await ctx.prisma.trip.count({ where: { driverId: user.id } })).toBe(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('offers drivers the vehicle catalogue with tank capacity and source', async () => {
    const { agent } = await signedInAgent(ctx.app);
    const res = await agent.get('/api/reference/vehicle-models');
    expect(res.status).toBe(200);
    const sienta = res.body.models.find((m: { model: string }) => m.model === 'Sienta Hybrid 1.5');
    expect(sienta).toMatchObject({ make: 'Toyota', consumptionRate: '4', tankCapacity: '40' });
    expect(sienta.source).toContain('toyota.com.sg');
    const lookup = await agent.get('/api/reference/efficiency?make=Honda&model=Freed%201.5');
    expect(lookup.body).toMatchObject({ found: true, tankCapacity: '42' });
  });
});

describe('Status codes for the web app paths', () => {
  it('treats known screens as pages and anything else as not found', async () => {
    const { isAppScreen } = await import('../../src/app');
    for (const ok of [
      '/',
      '/sign-in',
      '/privacy',
      '/app',
      '/app/plan',
      '/app/vehicles/new',
      '/app/vehicles/abc',
      '/app/trips/t1/top-up',
      '/app/history/t1/log',
      '/admin/efficiency',
      '/app/history/',
    ]) {
      expect(isAppScreen(ok), ok).toBe(true);
    }
    for (const missing of [
      '/nowhere',
      '/app/unknown',
      '/app/trips/t1/delete',
      '/admin/users',
      '/privacy/extra',
    ]) {
      expect(isAppScreen(missing), missing).toBe(false);
    }
  });
});
