import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { TableParkingAdapter } from '../../src/adapters/parking';
import { MockRoutingAdapter } from '../../src/adapters/routing';
import type { AppDeps } from '../../src/deps';
import { ExternalServiceError } from '../../src/lib/errors';
import { applyDeparture } from '../../src/modules/optimisation/service';
import { estimateTrip, getTrip } from '../../src/modules/trips/service';
import { saveTrip } from '../../src/modules/records/service';
import {
  CAR,
  RENTAL,
  PLACE,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';

describe('SRS review regressions', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let deps: AppDeps;
  beforeAll(async () => {
    ctx = await createTestContext();
    deps = {
      ...ctx,
      routing: new MockRoutingAdapter(),
      parking: new TableParkingAdapter(ctx.prisma, 1),
    };
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  async function planned(rental = false) {
    const { agent, user } = await signedInAgent(ctx.app);
    const vehicle = await agent.post('/api/vehicles').send(rental ? RENTAL : CAR);
    const result = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 90,
    });
    expect(result.status).toBe(201);
    return { agent, user, trip: result.body.trip, vehicleId: vehicle.body.vehicle.id };
  }

  it('NFR-REL-02 a failed departure change preserves the previous time and estimate', async () => {
    const { trip, user } = await planned();
    const route = vi
      .spyOn(deps.routing, 'route')
      .mockRejectedValueOnce(new ExternalServiceError('routing', 'TIMEOUT', 'Timed out'));
    await expect(
      applyDeparture(deps, trip.id, user.id, nextWeekday(9, 0).toISOString()),
    ).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
    route.mockRestore();
    const after = await getTrip(deps, trip.id, user.id);
    expect(after.departureTime).toBe(trip.departureTime);
    expect(after.estimate).toEqual(trip.estimate);
  });

  it('FR-REC-01 an estimate in flight cannot overwrite a trip saved during its provider call', async () => {
    const { trip, user } = await planned();
    const original = deps.routing.route.bind(deps.routing);
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((r) => {
      entered = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const route = vi.spyOn(deps.routing, 'route').mockImplementationOnce(async (input) => {
      entered();
      await gate;
      return original(input);
    });
    const result = estimateTrip(deps, trip.id, user.id).then(
      () => null,
      (error: unknown) => error,
    );
    await enteredPromise;
    await saveTrip(deps, trip.id, user.id);
    release();
    expect(await result).toMatchObject({ code: 'TRIP_CHANGED' });
    route.mockRestore();
    const after = await getTrip(deps, trip.id, user.id);
    expect(after.status).toBe('SAVED');
    expect(after.estimate).toEqual(trip.estimate);
  });

  it('FR-REC-01 FR-ADM-10 saved vehicle, ERP period, range policy and top-up sources do not drift', async () => {
    const { agent, trip, vehicleId, user } = await planned(true);
    await agent
      .post(`/api/trips/${trip.id}/top-up-plan`)
      .send({ unit: 'PERCENT', pickUpLevel: 50, requiredReturnLevel: 50 });
    const before = (await agent.post(`/api/trips/${trip.id}/save`)).body.trip;
    const plan = await ctx.prisma.fuelTopUpPlan.findUniqueOrThrow({ where: { tripId: trip.id } });
    const fuel = await ctx.prisma.fuelPrice.findUniqueOrThrow({ where: { id: plan.fuelPriceId } });
    const crossing = await ctx.prisma.chargePointCrossing.findFirstOrThrow({
      where: { component: { estimate: { tripId: trip.id } }, erpRateId: { not: null } },
    });
    const erp = await ctx.prisma.erpRate.findUniqueOrThrow({ where: { id: crossing.erpRateId! } });
    try {
      await agent
        .put(`/api/vehicles/${vehicleId}`)
        .send({ ...RENTAL, displayName: 'Changed later', consumptionRate: 12, tankCapacity: 80 });
      await ctx.prisma.fuelPrice.update({
        where: { id: fuel.id },
        data: { price: '9.99', brand: 'Changed later' },
      });
      await ctx.prisma.erpRate.update({ where: { id: erp.id }, data: { startTime: '00:01' } });
      const after = await getTrip(
        { ...deps, config: { ...deps.config, FUEL_RANGE_PERCENT: 25 } },
        trip.id,
        user.id,
      );
      expect(after.vehicle).toEqual(before.vehicle);
      expect(after.estimate).toEqual(before.estimate);
      expect(after.topUpPlan).toEqual(before.topUpPlan);
      expect((await agent.get('/api/history')).body.trips[0].vehicleName).toBe(RENTAL.displayName);
    } finally {
      await ctx.prisma.fuelPrice.update({
        where: { id: fuel.id },
        data: { price: fuel.price, brand: fuel.brand },
      });
      await ctx.prisma.erpRate.update({
        where: { id: erp.id },
        data: { startTime: erp.startTime },
      });
    }
  });

  it('FR-REN-07 the en-route shortfall is included in the total fuel to buy', async () => {
    const { agent, trip } = await planned(true);
    const res = await agent
      .post(`/api/trips/${trip.id}/top-up-plan`)
      .send({ unit: 'LITRES', pickUpLevel: 0, requiredReturnLevel: 10 });
    expect(res.status).toBe(200);
    const plan = res.body.trip.topUpPlan;
    expect(plan.message).toContain('in total');
    expect(plan.message).toContain('includes');
    expect(Number(plan.topUp.litres)).toBeCloseTo(Number(plan.shortfall.litres) + 10, 2);
    await agent.post(`/api/trips/${trip.id}/estimate`);
    expect((await agent.get(`/api/trips/${trip.id}`)).body.trip.topUpPlan).toBeNull();
  });

  it('NFR-SEC-04 rejects non-numeric JSON values and an inverted history range', async () => {
    const { agent } = await signedInAgent(ctx.app);
    for (const value of [true, null, [], [10], {}]) {
      const res = await agent.post('/api/vehicles').send({ ...CAR, consumptionRate: value });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.consumptionRate).toBeTruthy();
    }
    const range = await agent.get('/api/history?from=2026-10-02&to=2026-10-01');
    expect(range.status).toBe(400);
    expect(range.body.error.fields.to).toContain('End date');
  });

  it('NFR-SEC-02 rejects cross-origin session mutations', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', 'https://unrelated.example')
      .send({ email: 'a@test.local', password: 'Wrong1234' });
    expect(response.status).toBe(403);
  });

  it('FR-SET-06 rejects fabricated coordinates even inside the Singapore bounding box', async () => {
    const { agent, vehicleId } = await planned();
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: { ...PLACE.jurongEast, lat: 1.4 },
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['origin.name']).toContain('search suggestions');
  });
});
