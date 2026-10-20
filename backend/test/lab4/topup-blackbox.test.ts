/**
 * Lab 4, section 3.2.1: black-box testing of the FuelTopUpController control class
 * (backend/src/modules/topup/service.ts, planFuelTopUp, reached through
 * POST /api/trips/:id/top-up-plan) with equivalence class partitioning and
 * boundary value analysis.
 *
 * Fixture: a rented vehicle with a 50 L tank, 7.5 L/100 km, Petrol 95 at the seeded
 * SGD 2.78/L, on the mock route Jurong East MRT Station to Marina Bay Sands.
 * F is the trip fuel volume of that route, read from the stored route distance.
 * Case IDs match the test case tables in the Lab 4 test report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { D, Decimal } from '../../src/domain/money';
import { tripFuelVolume } from '../../src/domain/fuel';
import {
  CAR,
  PLACE,
  RENTAL,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';
import { createRecorder } from './recorder';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
type TestAgent = ReturnType<typeof request.agent>;
type Body = Record<string, unknown>;

const rec = createRecorder('topup-blackbox');
const TANK = D(50);

describe('Lab 4 black-box: FuelTopUpController.planFuelTopUp (ECP and BVA)', () => {
  let ctx: Ctx;
  let agent: TestAgent;
  let rentedTripId = '';
  let ownedTripId = '';
  let unestimatedTripId = '';
  let F = D(0);

  const post = (tripId: string, body: Body, who: TestAgent = agent) =>
    who.post(`/api/trips/${tripId}/top-up-plan`).send(body);

  function describeResponse(res: request.Response): string {
    if (res.status === 200) {
      const p = res.body.trip.topUpPlan;
      return `200 ${p.outcome}; projected ${p.projectedReturn.litres} L, shortfall ${p.shortfall.litres} L, top-up ${p.topUp.litres} L, cost SGD ${p.estimatedCost}`;
    }
    const e = res.body.error;
    const fields = e.fields
      ? '; ' +
        Object.entries(e.fields as Record<string, string>)
          .map(([k, v]) => `${k}: "${v}"`)
          .join('; ')
      : '';
    return `${res.status} ${e.code}${fields}`;
  }

  async function planTrip(vehicle: Body, destination = PLACE.marinaBay): Promise<string> {
    const v = await agent.post('/api/vehicles').send(vehicle);
    const t = await agent.post('/api/trips').send({
      vehicleProfileId: v.body.vehicle.id,
      origin: PLACE.jurongEast,
      destination,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 0,
    });
    return t.body.trip.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
    rentedTripId = await planTrip(RENTAL);
    ownedTripId = await planTrip(CAR);
    unestimatedTripId = await planTrip(RENTAL, PLACE.timeout);
    const routes = await ctx.prisma.route.findMany({ where: { tripId: rentedTripId } });
    F = routes.reduce(
      (acc, r) => acc.plus(tripFuelVolume(new Decimal(r.distanceKm.toString()), D('7.5'))),
      D(0),
    );
  });

  afterAll(async () => {
    rec.flush();
    await ctx.prisma.$disconnect();
  });

  // ---- Valid equivalence classes and boundary values ------------------------------

  it('BB-01 LITRES, typical values inside the range: required level above the projected level gives TOP_UP', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-01',
      technique: 'ECP (E1, E5, E9, O3)',
      input: 'unit=LITRES, pickUp=25, required=25',
      expected: `200 TOP_UP, top-up = F = ${F.toFixed(2)} L`,
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('TOP_UP');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe(F.toFixed(2));
  });

  it('BB-02 TANK_FRACTION valid class: the plan is reported in the unit the Renter used', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 0.5,
      requiredReturnLevel: 0.5,
      unit: 'TANK_FRACTION',
    });
    rec.record({
      id: 'BB-02',
      technique: 'ECP (E2, E5, E9, O3)',
      input: 'unit=TANK_FRACTION, pickUp=0.5, required=0.5',
      expected: '200 TOP_UP, pick-up shown as 0.500 of the tank (25.00 L)',
      actual: `${describeResponse(res)}; pick-up in unit ${res.body.trip?.topUpPlan?.pickUp?.inUnit}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('TOP_UP');
    expect(res.body.trip.topUpPlan.unit).toBe('TANK_FRACTION');
    expect(res.body.trip.topUpPlan.pickUp.inUnit).toBe('0.500');
    expect(res.body.trip.topUpPlan.pickUp.litres).toBe('25.00');
  });

  it('BB-03 PERCENT at its upper boundary (100) with a low return level gives NONE_NEEDED', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 100,
      requiredReturnLevel: 10,
      unit: 'PERCENT',
    });
    rec.record({
      id: 'BB-03',
      technique: 'ECP (E3, O2) + BVA (pick-up = max 100%)',
      input: 'unit=PERCENT, pickUp=100, required=10',
      expected: '200 NONE_NEEDED, top-up 0.00 L, cost SGD 0.00',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('NONE_NEEDED');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe('0.00');
    expect(res.body.trip.topUpPlan.estimatedCost).toBe('0.00');
  });

  it('BB-04 pick-up at the lower boundary (0 L) is accepted and needs refuelling en route', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 0,
      requiredReturnLevel: 0,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-04',
      technique: 'BVA (pick-up = min 0, required = min 0) + ECP (O1)',
      input: 'unit=LITRES, pickUp=0, required=0',
      expected: `200 REFUEL_EN_ROUTE, shortfall = top-up = F = ${F.toFixed(2)} L`,
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    const p = res.body.trip.topUpPlan;
    expect(p.outcome).toBe('REFUEL_EN_ROUTE');
    expect(p.shortfall.litres).toBe(F.toFixed(2));
    expect(p.topUp.litres).toBe(F.toFixed(2));
  });

  it('BB-05 both levels at the upper boundary (tank capacity 50 L) are accepted', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 50,
      requiredReturnLevel: 50,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-05',
      technique: 'BVA (pick-up = max 50, required = max 50)',
      input: 'unit=LITRES, pickUp=50, required=50',
      expected: `200 TOP_UP, top-up = F = ${F.toFixed(2)} L`,
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('TOP_UP');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe(F.toFixed(2));
  });

  it('BB-06 TANK_FRACTION at its upper boundary (1) is accepted', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 1,
      requiredReturnLevel: 1,
      unit: 'TANK_FRACTION',
    });
    rec.record({
      id: 'BB-06',
      technique: 'BVA (fraction = max 1)',
      input: 'unit=TANK_FRACTION, pickUp=1, required=1',
      expected: '200 TOP_UP, pick-up 50.00 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.pickUp.litres).toBe('50.00');
  });

  it('BB-07 output boundary: pick-up exactly equal to the trip fuel leaves 0 L, so no en-route warning', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: Number(F.toString()),
      requiredReturnLevel: 0,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-07',
      technique: 'BVA on output (projected return = 0)',
      input: `unit=LITRES, pickUp=F=${F.toString()}, required=0`,
      expected: '200 NONE_NEEDED, projected 0.00 L, shortfall 0.00 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    const p = res.body.trip.topUpPlan;
    expect(p.outcome).toBe('NONE_NEEDED');
    expect(p.projectedReturn.litres).toBe('0.00');
    expect(p.shortfall.litres).toBe('0.00');
  });

  it('BB-08 output boundary: pick-up 0.01 L below the trip fuel triggers REFUEL_EN_ROUTE with a 0.01 L shortfall', async () => {
    const pickUp = F.minus('0.01');
    const res = await post(rentedTripId, {
      pickUpLevel: Number(pickUp.toString()),
      requiredReturnLevel: 0,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-08',
      technique: 'BVA on output (projected return = -0.01)',
      input: `unit=LITRES, pickUp=F-0.01=${pickUp.toString()}, required=0`,
      expected: '200 REFUEL_EN_ROUTE, shortfall 0.01 L, top-up 0.01 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    const p = res.body.trip.topUpPlan;
    expect(p.outcome).toBe('REFUEL_EN_ROUTE');
    expect(p.shortfall.litres).toBe('0.01');
    expect(p.topUp.litres).toBe('0.01');
  });

  it('BB-09 output boundary: required level exactly equal to the projected level needs no top-up', async () => {
    const required = TANK.minus(F);
    const res = await post(rentedTripId, {
      pickUpLevel: 50,
      requiredReturnLevel: Number(required.toString()),
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-09',
      technique: 'BVA on output (top-up = 0)',
      input: `unit=LITRES, pickUp=50, required=50-F=${required.toString()}`,
      expected: '200 NONE_NEEDED, top-up 0.00 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('NONE_NEEDED');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe('0.00');
  });

  it('BB-10 output boundary: required level 0.01 L above the projected level needs a 0.01 L top-up', async () => {
    const required = TANK.minus(F).plus('0.01');
    const res = await post(rentedTripId, {
      pickUpLevel: 50,
      requiredReturnLevel: Number(required.toString()),
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-10',
      technique: 'BVA on output (top-up = 0.01)',
      input: `unit=LITRES, pickUp=50, required=50-F+0.01=${required.toString()}`,
      expected: '200 TOP_UP, top-up 0.01 L, cost SGD 0.03 (0.01 x 2.78 rounded)',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(200);
    expect(res.body.trip.topUpPlan.outcome).toBe('TOP_UP');
    expect(res.body.trip.topUpPlan.topUp.litres).toBe('0.01');
    expect(res.body.trip.topUpPlan.estimatedCost).toBe('0.03');
  });

  // ---- Invalid equivalence classes, one per test ----------------------------------

  it('BB-11 an unknown unit is rejected on the unit field', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: 25,
      unit: 'GALLONS',
    });
    rec.record({
      id: 'BB-11',
      technique: 'ECP (E4 invalid unit)',
      input: 'unit=GALLONS, pickUp=25, required=25',
      expected: '400 VALIDATION on unit',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.unit).toBeDefined();
  });

  it('BB-12 a pick-up level just below the minimum (-0.01) is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: -0.01,
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-12',
      technique: 'ECP (E6) + BVA (min - 0.01)',
      input: 'unit=LITRES, pickUp=-0.01, required=25',
      expected: '400 VALIDATION, pickUpLevel "A fuel level cannot be negative"',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.pickUpLevel).toBe('A fuel level cannot be negative');
  });

  it('BB-13 a required level just below the minimum (-0.01) is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: -0.01,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-13',
      technique: 'ECP (E10) + BVA (min - 0.01)',
      input: 'unit=LITRES, pickUp=25, required=-0.01',
      expected: '400 VALIDATION, requiredReturnLevel "A fuel level cannot be negative"',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requiredReturnLevel).toBe('A fuel level cannot be negative');
  });

  it('BB-14 a pick-up level just above the tank capacity (50.01 L) is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 50.01,
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-14',
      technique: 'ECP (E7) + BVA (max + 0.01)',
      input: 'unit=LITRES, pickUp=50.01, required=25',
      expected: '400 VALIDATION, pickUpLevel exceeds the tank capacity of 50.00 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.pickUpLevel).toContain('tank capacity of 50.00 L');
  });

  it('BB-15 a required level just above the tank capacity (50.01 L) is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: 50.01,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-15',
      technique: 'ECP (E11) + BVA (max + 0.01)',
      input: 'unit=LITRES, pickUp=25, required=50.01',
      expected: '400 VALIDATION, requiredReturnLevel exceeds the tank capacity of 50.00 L',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requiredReturnLevel).toContain('tank capacity of 50.00 L');
  });

  it('BB-16 a tank fraction just above 1 is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 1.01,
      requiredReturnLevel: 0.5,
      unit: 'TANK_FRACTION',
    });
    rec.record({
      id: 'BB-16',
      technique: 'ECP (E7) + BVA (fraction max + 0.01)',
      input: 'unit=TANK_FRACTION, pickUp=1.01, required=0.5',
      expected: '400 VALIDATION, pickUpLevel "A tank fraction is between 0 and 1"',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.pickUpLevel).toBe('A tank fraction is between 0 and 1');
  });

  it('BB-17 a percentage just above 100 is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 50,
      requiredReturnLevel: 100.1,
      unit: 'PERCENT',
    });
    rec.record({
      id: 'BB-17',
      technique: 'ECP (E11) + BVA (percent max + 0.1)',
      input: 'unit=PERCENT, pickUp=50, required=100.1',
      expected: '400 VALIDATION, requiredReturnLevel "A percentage is between 0 and 100"',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requiredReturnLevel).toBe('A percentage is between 0 and 100');
  });

  it('BB-18 a non-numeric pick-up level is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 'half',
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-18',
      technique: 'ECP (E8 non-numeric)',
      input: 'unit=LITRES, pickUp="half", required=25',
      expected: '400 VALIDATION on pickUpLevel',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.pickUpLevel).toBeDefined();
  });

  it('BB-19 a blank required level is rejected', async () => {
    const res = await post(rentedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: '',
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-19',
      technique: 'ECP (E12 blank)',
      input: 'unit=LITRES, pickUp=25, required=""',
      expected: '400 VALIDATION, requiredReturnLevel "Enter the fuel level required at return"',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requiredReturnLevel).toBe(
      'Enter the fuel level required at return',
    );
  });

  it('BB-20 a trip planned with an owned vehicle is refused (UC-13 is for Renters only)', async () => {
    const res = await post(ownedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-20',
      technique: 'ECP (E14 owned vehicle)',
      input: 'owned vehicle trip, unit=LITRES, pickUp=25, required=25',
      expected: '409 RENTED_ONLY',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RENTED_ONLY');
  });

  it("BB-21 another Driver's trip cannot be reached", async () => {
    const other = await signedInAgent(ctx.app);
    const res = await post(
      rentedTripId,
      { pickUpLevel: 25, requiredReturnLevel: 25, unit: 'LITRES' },
      other.agent,
    );
    rec.record({
      id: 'BB-21',
      technique: 'ECP (E16 trip owned by someone else)',
      input: "second Driver posts to the first Driver's trip",
      expected: '404 NOT_FOUND',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(404);
  });

  it('BB-22 a trip whose route could not be estimated is refused', async () => {
    const res = await post(unestimatedTripId, {
      pickUpLevel: 25,
      requiredReturnLevel: 25,
      unit: 'LITRES',
    });
    rec.record({
      id: 'BB-22',
      technique: 'ECP (E15b trip without a route)',
      input: 'rented trip whose routing timed out, valid levels',
      expected: '409 NO_ESTIMATE',
      actual: describeResponse(res),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_ESTIMATE');
  });

  it('BB-23 with no current fuel price the top-up cost cannot be computed', async () => {
    const live = await ctx.prisma.fuelPrice.findMany({
      where: { fuelType: 'PETROL_95', isWithdrawn: false },
    });
    await ctx.prisma.fuelPrice.updateMany({
      where: { id: { in: live.map((p) => p.id) } },
      data: { isWithdrawn: true },
    });
    try {
      const res = await post(rentedTripId, {
        pickUpLevel: 25,
        requiredReturnLevel: 25,
        unit: 'LITRES',
      });
      rec.record({
        id: 'BB-23',
        technique: 'ECP (E18 no fuel price)',
        input: 'every Petrol 95 price withdrawn, valid levels',
        expected: '409 NO_FUEL_PRICE',
        actual: describeResponse(res),
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NO_FUEL_PRICE');
    } finally {
      await ctx.prisma.fuelPrice.updateMany({
        where: { id: { in: live.map((p) => p.id) } },
        data: { isWithdrawn: false },
      });
    }
  });
});
