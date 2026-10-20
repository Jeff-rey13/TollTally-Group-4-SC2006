import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLog } from '../../src/middleware/requestLog';
import { MockParkingAdapter, TableParkingAdapter } from '../../src/adapters/parking';
import { MockRoutingAdapter } from '../../src/adapters/routing';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import {
  CAR,
  PLACE,
  adminAgent,
  createTestContext,
  nextWeekday,
  signedInAgent,
  uniqueEmail,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
type TestAgent = ReturnType<typeof request.agent>;

describe('Performance budgets (SRS 5.1)', () => {
  let ctx: Ctx;
  let agent: TestAgent;
  let tripId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('NFR-PER-01 one estimate completes within the 3-second budget and reports the measured time', async () => {
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 60,
    });
    expect(res.status).toBe(201);
    tripId = res.body.trip.id;
    const timing = res.body.trip.estimate.timing;
    expect(timing.budgetMs).toBe(3000);
    expect(timing.durationMs).toBeGreaterThan(0);
    expect(timing.durationMs).toBeLessThanOrEqual(3000);
    expect(timing.withinBudget).toBe(true);
  });

  it('SRS 6.1 the calculation time is stored with the estimate and survives a later read', async () => {
    const res = await agent.get(`/api/trips/${tripId}`);
    expect(res.body.trip.estimate.timing.durationMs).toBeGreaterThan(0);
    const stored = await ctx.prisma.costEstimate.findUnique({ where: { tripId } });
    expect(stored?.durationMs).toBe(res.body.trip.estimate.timing.durationMs);
  });

  it('NFR-PER-02 a complete route comparison finishes within the 10-second budget', async () => {
    const res = await agent.post(`/api/trips/${tripId}/compare-routes`);
    expect(res.status).toBe(200);
    expect(res.body.timing.budgetMs).toBe(10000);
    expect(res.body.timing.durationMs).toBeLessThanOrEqual(10000);
    expect(res.body.timing.withinBudget).toBe(true);
    expect(res.body.options.length).toBeLessThanOrEqual(ctx.config.ROUTE_OPTION_COUNT + 1);
  });
});

describe('An unpriceable component (FR-EST-11, FR-EST-08, NFR-ACCY-04)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  function appWithParking(mode: 'unavailable' | 'failure') {
    return createApp({
      prisma: ctx.prisma,
      routing: new MockRoutingAdapter(),
      parking: new MockParkingAdapter(mode),
      config: ctx.config,
    });
  }

  async function estimateWithout(mode: 'unavailable' | 'failure') {
    const app = appWithParking(mode);
    const { agent } = await signedInAgent(app);
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 90,
    });
    expect(res.status).toBe(201);
    return { agent, trip: res.body.trip, estimate: res.body.trip.estimate };
  }

  it('names the component, states the reason and labels the total a lower bound with no upper bound', async () => {
    const { estimate } = await estimateWithout('unavailable');
    expect(estimate.unavailable).toHaveLength(1);
    expect(estimate.unavailable[0].type).toBe('PARKING');
    expect(estimate.unavailable[0].reason).toContain('No carpark rate');
    expect(estimate.totalIsLowerBound).toBe(true);
    expect(estimate.upperBound).toBeNull();
    expect(estimate.legs[0].subtotalIsLowerBound).toBe(true);
  });

  it('never reports the missing component as zero and keeps fuel and road usage visible', async () => {
    const { estimate } = await estimateWithout('failure');
    const byType = Object.fromEntries(
      estimate.legs[0].components.map((c: { type: string }) => [c.type, c]),
    );
    expect(byType.PARKING.amount).toBeNull();
    expect(byType.PARKING.isAvailable).toBe(false);
    expect(byType.PARKING.unavailableReason).toContain('did not respond');
    expect(byType.FUEL.isAvailable).toBe(true);
    expect(Number(byType.FUEL.amount)).toBeGreaterThan(0);
    expect(byType.ROAD_USAGE.isAvailable).toBe(true);
  });

  it('excludes the missing component from the total rather than adding a zero', async () => {
    const { estimate } = await estimateWithout('unavailable');
    const available = estimate.legs[0].components
      .filter((c: { isAvailable: boolean }) => c.isAvailable)
      .reduce((sum: number, c: { amount: string }) => sum + Number(c.amount), 0);
    expect(Number(estimate.total)).toBeCloseTo(available, 2);
  });
});

describe('ERP effective dates (UC-18, FR-ADM-04, FR-ADM-06)', () => {
  let ctx: Ctx;
  let admin: TestAgent;
  let chargePointId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await adminAgent(ctx.app);
    const points = await admin.get('/api/admin/charge-points');
    chargePointId = points.body.chargePoints[0].id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  const record = {
    vehicleClass: 'VHGV_BIG_BUS',
    dayType: 'SATURDAY',
    startTime: '20:00',
    endTime: '21:00',
    rate: 2,
  };

  it('FR-ADM-04 an effective date is returned as the Singapore date it was entered as', async () => {
    const created = await admin
      .post('/api/admin/erp-rates')
      .send({ ...record, chargePointId, effectiveDate: '2026-12-01' });
    expect(created.status).toBe(201);
    expect(created.body.erpRate.effectiveDate).toBe('2026-12-01');

    const listed = await admin.get('/api/admin/erp-rates');
    const found = listed.body.erpRates.find(
      (r: { id: string }) => r.id === created.body.erpRate.id,
    );
    expect(found.effectiveDate).toBe('2026-12-01');
  });

  it('FR-ADM-06 amending a record with the date it reports does not move the effective date', async () => {
    const created = await admin.post('/api/admin/erp-rates').send({
      ...record,
      chargePointId,
      startTime: '21:00',
      endTime: '22:00',
      effectiveDate: '2027-01-15',
    });
    expect(created.status).toBe(201);

    let current = created.body.erpRate;
    for (let round = 0; round < 3; round++) {
      const amended = await admin.put(`/api/admin/erp-rates/${current.id}`).send({
        chargePointId: current.chargePointId,
        vehicleClass: current.vehicleClass,
        dayType: current.dayType,
        startTime: current.startTime,
        endTime: current.endTime,
        rate: Number(current.rate) + 1,
        effectiveDate: current.effectiveDate,
      });
      expect(amended.status).toBe(200);
      current = amended.body.erpRate;
      expect(current.effectiveDate).toBe('2027-01-15');
    }

    const stored = await ctx.prisma.erpRate.findUniqueOrThrow({ where: { id: current.id } });
    expect(stored.effectiveDate.toISOString()).toBe('2027-01-14T16:00:00.000Z');
  });
});

describe('Requirements not exercised by the feature flows', () => {
  let ctx: Ctx;
  let agent: TestAgent;
  let admin: TestAgent;
  let vehicleId = '';
  const departure = nextWeekday(8, 15);

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
    admin = await adminAgent(ctx.app);
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    vehicleId = vehicle.body.vehicle.id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-ACC-03 a password is stored only as a salted one-way hash and never in plain text', async () => {
    const password = 'Str0ngPassphrase';
    const first = await signedInAgent(ctx.app, uniqueEmail('hash-a'), password);
    const second = await signedInAgent(ctx.app, uniqueEmail('hash-b'), password);
    const rows = await ctx.prisma.user.findMany({
      where: { id: { in: [first.user.id, second.user.id] } },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.passwordHash).not.toContain(password);
      expect(row.passwordHash.startsWith('scrypt$')).toBe(true);
    }
    expect(rows[0].passwordHash).not.toBe(rows[1].passwordHash);
  });

  it('FR-SET-05 Plan Trip requires the Driver to select one of their own stored vehicles', async () => {
    const { agent: other } = await signedInAgent(ctx.app);
    const trip = {
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
      parkingDurationMin: 30,
    };
    const noVehicle = await other.post('/api/trips').send({ ...trip, vehicleProfileId: vehicleId });
    expect(noVehicle.status).toBe(400);
    expect(noVehicle.body.error.fields.vehicleProfileId).toBeDefined();

    const missing = await agent.post('/api/trips').send(trip);
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.vehicleProfileId).toBeDefined();

    await agent.post(`/api/vehicles/${vehicleId}/archive`);
    const archived = await agent.post('/api/trips').send({ ...trip, vehicleProfileId: vehicleId });
    expect(archived.status).toBe(400);
    expect(archived.body.error.fields.vehicleProfileId).toContain('archived');
    await agent.post(`/api/vehicles/${vehicleId}/unarchive`);
  });

  it('FR-OPT-01 comparison offers alternatives distinct from the default within the configured range', async () => {
    const planned = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
      parkingDurationMin: 30,
    });
    const res = await agent.post(`/api/trips/${planned.body.trip.id}/compare-routes`);
    const alternatives = res.body.options.filter((o: { id: string }) => o.id !== 'current') as {
      distanceKm: string;
      drivingTimeSec: number;
    }[];
    expect(alternatives.length).toBeGreaterThanOrEqual(2);
    expect(alternatives.length).toBeLessThanOrEqual(4);
    expect(res.body.noAlternatives).toBe(false);
    const current = res.body.options.find((o: { id: string }) => o.id === 'current');
    for (const option of alternatives) {
      expect(
        option.distanceKm !== current.distanceKm ||
          option.drivingTimeSec !== current.drivingTimeSec,
      ).toBe(true);
    }
  });

  it('FR-REC-02 NFR-REL-03 re-estimating adds nothing to history and saving twice keeps one record', async () => {
    const body = {
      vehicleProfileId: vehicleId,
      origin: PLACE.toaPayoh,
      destination: PLACE.angMoKio,
      departureTime: departure.toISOString(),
      parkingDurationMin: 15,
    };
    const first = await agent.post('/api/trips').send(body);
    const before = (await agent.get('/api/history')).body.trips.length;

    await agent.post(`/api/trips/${first.body.trip.id}/estimate`);
    await agent.post(`/api/trips/${first.body.trip.id}/estimate`);
    expect((await agent.get('/api/history')).body.trips).toHaveLength(before);

    await agent.post(`/api/trips/${first.body.trip.id}/save`);
    const afterFirstSave = (await agent.get('/api/history')).body.trips.length;
    expect(afterFirstSave).toBe(before + 1);

    await agent.post(`/api/trips/${first.body.trip.id}/save`);
    expect((await agent.get('/api/history')).body.trips).toHaveLength(afterFirstSave);
    const second = await agent.post('/api/trips').send(body);
    await agent.post(`/api/trips/${second.body.trip.id}/save`);
    const history = (await agent.get('/api/history')).body.trips;
    expect(history).toHaveLength(afterFirstSave + 1);
    expect(history.some((t: { id: string }) => t.id === first.body.trip.id)).toBe(true);
    expect(history.some((t: { id: string }) => t.id === second.body.trip.id)).toBe(true);
  });

  it('FR-REC-04 an actual cost must be a number of zero or more', async () => {
    const planned = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.toaPayoh,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
      parkingDurationMin: 0,
    });
    const tripId = planned.body.trip.id;
    await agent.post(`/api/trips/${tripId}/save`);

    const negative = await agent.put(`/api/trips/${tripId}/log`).send({ actualFuelCost: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.error.fields.actualFuelCost).toContain('cannot be negative');

    const notNumeric = await agent
      .put(`/api/trips/${tripId}/log`)
      .send({ actualParkingFee: 'eight dollars' });
    expect(notNumeric.status).toBe(400);
    expect(notNumeric.body.error.fields.actualParkingFee).toBeDefined();

    const empty = await agent.put(`/api/trips/${tripId}/log`).send({});
    expect(empty.status).toBe(400);

    const zero = await agent.put(`/api/trips/${tripId}/log`).send({ actualParkingFee: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.trip.log.actualTotal).toBe('0.00');
  });

  it('FR-ADM-07 an efficiency record needs a make, a model and a rate greater than zero', async () => {
    const valid = { make: 'Subaru', model: 'Impreza', consumptionRate: 7.1 };
    for (const invalid of [
      { ...valid, consumptionRate: 0 },
      { ...valid, consumptionRate: -2 },
      { ...valid, consumptionRate: 'seven' },
      { ...valid, make: '' },
      { ...valid, model: '' },
    ]) {
      const res = await admin.post('/api/admin/efficiency-records').send(invalid);
      expect(res.status).toBe(400);
    }
    const created = await admin.post('/api/admin/efficiency-records').send(valid);
    expect(created.status).toBe(201);
    expect(created.body.record.consumptionRate).toBe('7.1');
  });

  it('NFR-SEC-04 every client-supplied value is validated on the server, not only in the browser', async () => {
    const badVehicle = await agent.post('/api/vehicles').send({
      displayName: 'x'.repeat(200),
      ownershipType: 'BORROWED',
      fuelType: 'ROCKET_FUEL',
      consumptionRate: 'lots',
      tankCapacity: -5,
    });
    expect(badVehicle.status).toBe(400);
    for (const field of ['displayName', 'ownershipType', 'fuelType', 'tankCapacity']) {
      expect(badVehicle.body.error.fields[field]).toBeDefined();
    }

    const badTrip = await agent.post('/api/trips').send({ vehicleProfileId: vehicleId });
    expect(badTrip.status).toBe(400);

    const badRate = await admin.post('/api/admin/erp-rates').send({
      chargePointId: 'no-such-point',
      vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
      dayType: 'WEEKDAY',
      startTime: '25:99',
      endTime: '08:00',
      rate: 1,
      effectiveDate: 'not-a-date',
    });
    expect(badRate.status).toBe(400);
    expect(badRate.body.error.fields.startTime).toBeDefined();
    expect(badRate.body.error.fields.effectiveDate).toBeDefined();
  });
});

describe('Log hygiene (NFR-SEC-06)', () => {
  function capture(run: () => void): string {
    const lines: string[] = [];
    const record =
      () =>
      (...args: unknown[]) =>
        void lines.push(args.map(String).join(' '));
    const originals = { log: console.log, warn: console.warn, error: console.error };
    console.log = record();
    console.warn = record();
    console.error = record();
    try {
      run();
    } finally {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    }
    return lines.join('\n');
  }

  const password = 'UniqueSecret9x';
  const sessionToken = 's%3AsomeSessionTokenValue';

  it('the request log records the route and outcome, never the body, query or cookie', () => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 201;
    const req = {
      method: 'POST',
      path: '/api/trips',
      body: { password, origin: { name: PLACE.jurongEast.name } },
      query: { token: sessionToken },
      headers: { cookie: `tolltally.sid=${sessionToken}` },
    };

    const logged = capture(() => {
      requestLog(req as never, res as never, () => undefined);
      res.emit('finish');
    });

    expect(logged).toContain('POST /api/trips 201');
    expect(logged).not.toContain(password);
    expect(logged).not.toContain(PLACE.jurongEast.name);
    expect(logged).not.toContain(sessionToken);
  });

  it('an unexpected error logs its type in production, not the values that caused it', () => {
    const nodeEnv = process.env.NODE_ENV;
    const failure = Object.assign(new Error(`insert failed for password ${password}`), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    const res = { status: () => ({ json: () => undefined }) };
    const req = { method: 'POST', path: '/api/auth/register' };

    try {
      process.env.NODE_ENV = 'production';
      const logged = capture(() =>
        errorHandler(failure, req as never, res as never, () => undefined),
      );
      expect(logged).toContain('PrismaClientKnownRequestError');
      expect(logged).toContain('P2002');
      expect(logged).not.toContain(password);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });
});

describe('Transport security (NFR-SEC-01)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  function productionApp() {
    const config = loadConfig({ NODE_ENV: 'production' });
    return createApp({
      prisma: ctx.prisma,
      routing: new MockRoutingAdapter(),
      parking: new TableParkingAdapter(ctx.prisma, config.PARKING_SEARCH_RADIUS_KM),
      config,
    });
  }

  it('sets the baseline response headers on every request', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('redirects plain HTTP to HTTPS in production and asks the browser to keep using it', async () => {
    const app = productionApp();
    const res = await request(app)
      .get('/api/auth/me')
      .set('x-forwarded-proto', 'http')
      .set('host', 'tolltally.example');
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('https://tolltally.example/api/auth/me');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  it('leaves the health check reachable over the loopback interface so a container can be probed', async () => {
    const res = await request(productionApp()).get('/api/health').set('x-forwarded-proto', 'http');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('serves a request that already arrived over HTTPS', async () => {
    const res = await request(productionApp())
      .get('/api/auth/me')
      .set('x-forwarded-proto', 'https');
    expect(res.status).toBe(401);
  });
});
