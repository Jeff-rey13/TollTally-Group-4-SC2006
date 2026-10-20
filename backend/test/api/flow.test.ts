import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  CAR,
  PLACE,
  RENTAL,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
type TestAgent = ReturnType<typeof request.agent>;

describe('Driver flow: register, vehicle, plan, estimate, compare, optimise, save, log, history', () => {
  let ctx: Ctx;
  let agent: TestAgent;
  let vehicleId = '';
  let tripId = '';
  const departure = nextWeekday(8, 15);

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-ACC-04 registration signs the new user in with the Driver role', async () => {
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('DRIVER');
  });

  it('FR-SET-02 creates a vehicle profile with the required fields', async () => {
    const res = await agent.post('/api/vehicles').send(CAR);
    expect(res.status).toBe(201);
    vehicleId = res.body.vehicle.id;
    expect(res.body.vehicle.consumptionRate).toBe('7.5');
    expect(res.body.vehicle.tankCapacity).toBe('50');
  });

  it('FR-SET-09 planning a trip unconditionally produces an estimate with fuel, road usage and parking', async () => {
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
      parkingDurationMin: 90,
    });
    expect(res.status).toBe(201);
    expect(res.body.estimateError).toBeNull();
    tripId = res.body.trip.id;
    const estimate = res.body.trip.estimate;
    expect(estimate).not.toBeNull();
    expect(estimate.legs).toHaveLength(1);
    expect(estimate.legs[0].components.map((c: { type: string }) => c.type)).toEqual([
      'FUEL',
      'ROAD_USAGE',
      'PARKING',
    ]);
    expect(estimate.legs[0].components.every((c: { isAvailable: boolean }) => c.isAvailable)).toBe(
      true,
    );
    expect(estimate.totalIsLowerBound).toBe(false);
    expect(estimate.upperBound).not.toBeNull();
    expect(res.body.trip.status).toBe('ESTIMATED');
  });

  it('FR-EST-04 the route crosses ERP charge points and each crossing is itemised with its time', async () => {
    const res = await agent.get(`/api/trips/${tripId}`);
    const road = res.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'ROAD_USAGE',
    );
    expect(road.crossings.length).toBeGreaterThan(0);
    expect(road.detail.crossingCount).toBe(road.crossings.length);
    for (const crossing of road.crossings) {
      expect(typeof crossing.chargePointName).toBe('string');
      expect(new Date(crossing.estimatedCrossingTime).getTime()).toBeGreaterThanOrEqual(
        departure.getTime(),
      );
    }
  });

  it('FR-EST-07 parking for 90 minutes at the nearest 30-minute carpark is 3 periods', async () => {
    const res = await agent.get(`/api/trips/${tripId}`);
    const parking = res.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'PARKING',
    );
    expect(parking.detail.periods).toBe(3);
    expect(parking.detail.carparkName).toBe('Marina Bay Sands carpark');
    expect(parking.amount).toBe('4.50');
  });

  it('FR-EST-12 the estimate carries the source, recorded time and range basis for the derivation view', async () => {
    const res = await agent.get(`/api/trips/${tripId}`);
    const fuel = res.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'FUEL',
    );
    expect(fuel.source.name).toContain('Petrol 95');
    expect(fuel.source.recordedAt).not.toBeNull();
    expect(fuel.detail.volumeL).toBeDefined();
    expect(res.body.trip.estimate.rangeBasis.length).toBeGreaterThanOrEqual(3);
  });

  it('FR-EST-13 NFR-ACCY-03 re-running the estimate with unchanged inputs gives the same itemised result', async () => {
    const before = (await agent.get(`/api/trips/${tripId}`)).body.trip.estimate;
    const after = (await agent.post(`/api/trips/${tripId}/estimate`)).body.trip.estimate;
    expect(after.total).toBe(before.total);
    expect(after.lowerBound).toBe(before.lowerBound);
    expect(after.upperBound).toBe(before.upperBound);
    expect(after.legs[0].components.map((c: { amount: string }) => c.amount)).toEqual(
      before.legs[0].components.map((c: { amount: string }) => c.amount),
    );
  });

  it('FR-OPT-02 comparing routes prices each option side by side with distance, time and cost', async () => {
    const res = await agent.post(`/api/trips/${tripId}/compare-routes`);
    expect(res.status).toBe(200);
    expect(res.body.options.length).toBeGreaterThanOrEqual(2);
    for (const option of res.body.options) {
      expect(option.distanceKm).toMatch(/^\d+\.\d{2}$/);
      expect(option.drivingTimeSec).toBeGreaterThan(0);
      expect(option.total).toMatch(/^\d+\.\d{2}$/);
    }
    expect(typeof res.body.message).toBe('string');
    expect(
      res.body.options.filter((o: { isCheapest: boolean }) => o.isCheapest).length,
    ).toBeLessThanOrEqual(1);
  });

  it('FR-OPT-06 departure optimisation prices slots around the planned time and marks the planned slot', async () => {
    const res = await agent.post(`/api/trips/${tripId}/optimise-departure`);
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThanOrEqual(3);
    expect(res.body.slots.filter((s: { isPlanned: boolean }) => s.isPlanned)).toHaveLength(1);
    expect(typeof res.body.message).toBe('string');
  });

  it('FR-REN-01 top-up planning is refused for an owned vehicle', async () => {
    const res = await agent
      .post(`/api/trips/${tripId}/top-up-plan`)
      .send({ pickUpLevel: 0.5, requiredReturnLevel: 0.5, unit: 'TANK_FRACTION' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RENTED_ONLY');
  });

  it('FR-REC-01 saving the trip marks it SAVED and the snapshot is never recomputed', async () => {
    const res = await agent.post(`/api/trips/${tripId}/save`);
    expect(res.status).toBe(200);
    expect(res.body.trip.status).toBe('SAVED');
    expect(res.body.trip.savedAt).not.toBeNull();
    const again = await agent.post(`/api/trips/${tripId}/estimate`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TRIP_SAVED');
  });

  it('FR-REC-03 FR-REC-05 logging a partial actual cost computes variance only for the logged component', async () => {
    const res = await agent.put(`/api/trips/${tripId}/log`).send({ actualFuelCost: 5 });
    expect(res.status).toBe(200);
    expect(res.body.trip.status).toBe('COMPLETED');
    const log = res.body.trip.log;
    expect(log.actualTotal).toBe('5.00');
    const fuel = log.components.find((c: { type: string }) => c.type === 'FUEL');
    expect(fuel.status).toBe('OK');
    expect(fuel.variance.absolute).toMatch(/^-?\d+\.\d{2}$/);
    expect(log.components.find((c: { type: string }) => c.type === 'ROAD_USAGE').status).toBe(
      'NOT_LOGGED',
    );
    expect(log.totalVariance).not.toBeNull();
  });

  it('FR-REC-07 FR-REC-08 history lists the trip and reports only logged spend', async () => {
    const res = await agent.get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].log.actualTotal).toBe('5.00');
    expect(res.body.report.loggedCount).toBe(1);
    expect(res.body.report.actualSpend).toBe('5.00');
  });

  it('FR-REC-09 a driver whose saved trips have no log sees the list without a spend report', async () => {
    const { agent: other } = await signedInAgent(ctx.app);
    const vehicle = await other.post('/api/vehicles').send(CAR);
    const trip = await other.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.toaPayoh,
      destination: PLACE.angMoKio,
      departureTime: departure.toISOString(),
      parkingDurationMin: 0,
    });
    expect(trip.status).toBe(201);
    await other.post(`/api/trips/${trip.body.trip.id}/save`);
    const history = await other.get('/api/history');
    expect(history.body.trips).toHaveLength(1);
    expect(history.body.report).toBeNull();
    expect(history.body.message).toContain('Log actual costs');
  });

  it('FR-EST-08 a zero parking duration costs zero without a carpark lookup', async () => {
    const { agent: other } = await signedInAgent(ctx.app);
    const vehicle = await other.post('/api/vehicles').send(CAR);
    const trip = await other.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.toaPayoh,
      destination: PLACE.angMoKio,
      departureTime: departure.toISOString(),
      parkingDurationMin: 0,
    });
    const parking = trip.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'PARKING',
    );
    expect(parking.amount).toBe('0.00');
    expect(parking.source.name).toBe('No parking planned');
  });

  it('FR-SET-07 FR-EST-10 a return trip prices each leg at its own departure time and shows them separately', async () => {
    const returnDeparture = new Date(departure.getTime() + 9 * 60 * 60 * 1000);
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
      isReturnTrip: true,
      returnDepartureTime: returnDeparture.toISOString(),
      parkingDurationMin: 60,
    });
    expect(res.status).toBe(201);
    const legs = res.body.trip.estimate.legs;
    expect(legs).toHaveLength(2);
    expect(legs[1].isReturnLeg).toBe(true);
    expect(legs[1].departureTime).toBe(returnDeparture.toISOString());
    expect(legs[1].components.map((c: { type: string }) => c.type)).toEqual(['FUEL', 'ROAD_USAGE']);
  });

  it('FR-SET-08 a missing parking duration is defaulted and disclosed as an assumption', async () => {
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.toaPayoh,
      destination: PLACE.marinaBay,
      departureTime: departure.toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.trip.parkingDurationAssumed).toBe(true);
    expect(res.body.trip.parkingDurationMin).toBe(ctx.config.DEFAULT_PARKING_DURATION_MIN);
    expect(res.body.trip.estimate.assumptions[0]).toContain('defaulted');
  });

  it('FR-SET-06 FR-SET-10 invalid trip input is rejected with field-level errors and no routing call', async () => {
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.toaPayoh,
      destination: PLACE.toaPayoh,
      departureTime: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['destination.name']).toBeDefined();
    expect(res.body.error.fields.departureTime).toContain('future');
    const outside = await agent.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.toaPayoh,
      destination: { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
      departureTime: departure.toISOString(),
    });
    expect(outside.status).toBe(400);
    expect(outside.body.error.fields['destination.name']).toContain('Singapore');
  });
});

describe('Renter flow (UC-13)', () => {
  let ctx: Ctx;
  let agent: TestAgent;
  let tripId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
    const vehicle = await agent.post('/api/vehicles').send(RENTAL);
    const trip = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(10, 0).toISOString(),
      parkingDurationMin: 0,
    });
    tripId = trip.body.trip.id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-REN-03 FR-REN-06 a top-up plan uses the fuel calculation and answers in the unit the Renter used', async () => {
    const res = await agent
      .post(`/api/trips/${tripId}/top-up-plan`)
      .send({ pickUpLevel: 0.5, requiredReturnLevel: 0.5, unit: 'TANK_FRACTION' });
    expect(res.status).toBe(200);
    const plan = res.body.trip.topUpPlan;
    expect(plan.outcome).toBe('TOP_UP');
    expect(plan.unit).toBe('TANK_FRACTION');
    expect(plan.pickUp.litres).toBe('25.00');
    expect(plan.pickUp.inUnit).toBe('0.500');
    expect(Number(plan.tripFuel.litres)).toBeGreaterThan(0);
    expect(plan.topUp.litres).toBe(plan.tripFuel.litres);
    expect(plan.estimatedCost).toMatch(/^\d+\.\d{2}$/);
  });

  it('FR-REN-02 a required return level above the tank capacity is rejected on that field', async () => {
    const res = await agent
      .post(`/api/trips/${tripId}/top-up-plan`)
      .send({ pickUpLevel: 20, requiredReturnLevel: 60, unit: 'LITRES' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requiredReturnLevel).toContain('tank capacity');
  });

  it('FR-REN-07 insufficient fuel at pick-up produces an en-route refuelling warning with the shortfall', async () => {
    const res = await agent
      .post(`/api/trips/${tripId}/top-up-plan`)
      .send({ pickUpLevel: 1, requiredReturnLevel: 10, unit: 'PERCENT' });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('REFUEL_EN_ROUTE');
    expect(Number(res.body.trip.topUpPlan.shortfall.litres)).toBeGreaterThan(0);
  });

  it('FR-REN-07 a return requirement already met reports that no top-up is needed', async () => {
    const res = await agent
      .post(`/api/trips/${tripId}/top-up-plan`)
      .send({ pickUpLevel: 100, requiredReturnLevel: 10, unit: 'PERCENT' });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('NONE_NEEDED');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe('0.00');
  });
});

describe('Routing failure (UC-06.EX.2, NFR-REL-02)', () => {
  let ctx: Ctx;
  let agent: TestAgent;

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('a routing timeout leaves the trip planned, offers retry and keeps the session', async () => {
    const vehicle = await agent.post('/api/vehicles').send(CAR);
    const res = await agent.post('/api/trips').send({
      vehicleProfileId: vehicle.body.vehicle.id,
      origin: PLACE.timeout,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(9, 0).toISOString(),
      parkingDurationMin: 30,
    });
    expect(res.status).toBe(201);
    expect(res.body.estimateError.retryable).toBe(true);
    expect(res.body.trip.status).toBe('PLANNED');
    expect(res.body.trip.estimate).toBeNull();
    const retry = await agent.post(`/api/trips/${res.body.trip.id}/estimate`);
    expect(retry.status).toBe(503);
    expect(retry.body.error.retryable).toBe(true);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });
});
