import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TripConditionsDto } from '@tolltally/shared';
import {
  MockIncidentAdapter,
  MockWeatherAdapter,
  type DailyForecast,
  type TwoHourForecast,
  type WeatherService,
} from '../../src/adapters/conditions';
import {
  CAR,
  PLACE,
  adminAgent,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
type Agent = Awaited<ReturnType<typeof signedInAgent>>['agent'];

const soon = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();

async function planned(agent: Agent, vehicleProfileId: string, departureTime: string, extra = {}) {
  const res = await agent.post('/api/trips').send({
    vehicleProfileId,
    origin: PLACE.jurongEast,
    destination: PLACE.marinaBay,
    departureTime,
    parkingDurationMin: 60,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.trip.id as string;
}

async function conditions(agent: Agent, id: string): Promise<TripConditionsDto> {
  const res = await agent.get(`/api/trips/${id}/conditions`);
  expect(res.status).toBe(200);
  return res.body.conditions;
}

describe('Road and weather conditions', () => {
  let ctx: Ctx;
  let agent: Agent;
  let carId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
    carId = (await agent.post('/api/vehicles').send(CAR)).body.vehicle.id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-EST-17 lists the incidents on the route of a trip leaving soon, in route order', async () => {
    const c = await conditions(agent, await planned(agent, carId, soon()));
    expect(c.incidents.status).toBe('shown');
    expect(c.incidents.source).toBe('demo data');
    expect(c.incidents.items.length).toBeGreaterThanOrEqual(1);
    expect(c.incidents.items[0].message).toMatch(/AYE/);
    // The Woodlands roadworks are nowhere near a Jurong East to Marina Bay drive.
    expect(c.incidents.items.some((i) => /Woodlands/.test(i.message))).toBe(false);
    const along = c.incidents.items.map((i) => Number(i.alongKm));
    expect([...along].sort((a, b) => a - b)).toEqual(along);
  });

  it('FR-EST-17 does not show incidents for a trip leaving later than the window', async () => {
    const c = await conditions(
      agent,
      await planned(agent, carId, nextWeekday(8, 15).toISOString()),
    );
    expect(c.incidents.status).toBe('too-far-ahead');
    expect(c.incidents.items).toEqual([]);
    expect(c.incidents.message).toMatch(/120 minutes/);
  });

  it('FR-EST-18 gives the 2-hour town forecast at the start and destination and flags rain', async () => {
    const c = await conditions(agent, await planned(agent, carId, soon()));
    expect(c.weather.status).toBe('shown');
    expect(c.weather.forecasts.map((f) => f.point)).toEqual(['start', 'destination']);
    expect(c.weather.forecasts[0]).toMatchObject({
      area: 'Jurong East',
      basis: '2-hour',
      rain: false,
    });
    expect(c.weather.forecasts[1]).toMatchObject({ area: 'City', basis: '2-hour', rain: true });
    expect(c.weather.rainLikely).toBe(true);
  });

  it('FR-EST-18 uses the 24-hour regional forecast beyond two hours, and the return time', async () => {
    const leave = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const back = new Date(leave.getTime() + 2 * 60 * 60 * 1000);
    const id = await planned(agent, carId, leave.toISOString(), {
      isReturnTrip: true,
      returnDepartureTime: back.toISOString(),
    });
    const c = await conditions(agent, id);
    expect(c.weather.status).toBe('shown');
    expect(c.weather.forecasts.map((f) => f.point)).toEqual(['start', 'destination', 'return']);
    expect(c.weather.forecasts.every((f) => f.basis === '24-hour')).toBe(true);
    expect(c.weather.forecasts[0].area).toBe('West region');
    expect(c.weather.forecasts[1].area).toBe('South region');
  });

  it('FR-EST-18 says a trip beyond the forecasts is too far ahead', async () => {
    const leave = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const c = await conditions(agent, await planned(agent, carId, leave));
    expect(c.weather.status).toBe('too-far-ahead');
    expect(c.weather.forecasts).toEqual([]);
  });

  it('FR-EST-13 the estimate is the same whatever the conditions say', async () => {
    const id = await planned(agent, carId, soon());
    const before = (await agent.get(`/api/trips/${id}`)).body.trip.estimate;
    await conditions(agent, id);
    const after = (await agent.get(`/api/trips/${id}`)).body.trip.estimate;
    expect(after).toEqual(before);
  });

  it('NFR-SEC-05 another Driver cannot read the conditions of my trip', async () => {
    const id = await planned(agent, carId, soon());
    const { agent: other } = await signedInAgent(ctx.app);
    expect((await other.get(`/api/trips/${id}/conditions`)).status).toBe(404);
  });
});

describe('Road and weather conditions when a source fails or is off', () => {
  it('NFR-REL-02 a failing source is reported as unavailable and the estimate still stands', async () => {
    const ctx = await createTestContext({
      traffic: new MockIncidentAdapter('failure'),
      weather: new MockWeatherAdapter('failure'),
    });
    const { agent } = await signedInAgent(ctx.app);
    const carId = (await agent.post('/api/vehicles').send(CAR)).body.vehicle.id;
    const c = await conditions(agent, await planned(agent, carId, soon()));
    expect(c.incidents.status).toBe('unavailable');
    expect(c.weather.status).toBe('unavailable');
    const trip = (await agent.get('/api/trips/' + (await planned(agent, carId, soon())))).body.trip;
    expect(trip.estimate).not.toBeNull();
    await ctx.prisma.$disconnect();
  });

  it('shows "off" when no source is set up, and the overview says so', async () => {
    const ctx = await createTestContext({ traffic: null, weather: null });
    const { agent } = await signedInAgent(ctx.app);
    const carId = (await agent.post('/api/vehicles').send(CAR)).body.vehicle.id;
    const c = await conditions(agent, await planned(agent, carId, soon()));
    expect(c.incidents.status).toBe('off');
    expect(c.weather.status).toBe('off');
    const health = (await agent.get('/api/health')).body;
    expect(health.trafficProvider).toBeNull();
    const admin = await adminAgent(ctx.app);
    const checks = (await admin.get('/api/admin/overview')).body.overview.health.checks;
    expect(checks.find((x: { key: string }) => x.key === 'traffic').status).toBe('off');
    await ctx.prisma.$disconnect();
  });

  it('records a live weather failure on the overview', async () => {
    const failing: WeatherService = {
      name: 'test weather',
      twoHour: (): Promise<TwoHourForecast> => Promise.reject(new Error('timed out')),
      daily: (): Promise<DailyForecast> => Promise.reject(new Error('timed out')),
    };
    const ctx = await createTestContext({ weather: failing });
    const { agent } = await signedInAgent(ctx.app);
    const carId = (await agent.post('/api/vehicles').send(CAR)).body.vehicle.id;
    await conditions(agent, await planned(agent, carId, soon()));
    const admin = await adminAgent(ctx.app);
    const checks = (await admin.get('/api/admin/overview')).body.overview.health.checks;
    const weather = checks.find((x: { key: string }) => x.key === 'weather');
    expect(weather.status).toBe('down');
    expect(weather.detail).toMatch(/timed out/);
    await ctx.prisma.$disconnect();
  });
});
