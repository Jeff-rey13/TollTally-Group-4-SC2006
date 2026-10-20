import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  CAR,
  PLACE,
  adminAgent,
  createTestContext,
  nextWeekday,
  signedInAgent,
} from '../helpers/context';

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
type TestAgent = ReturnType<typeof request.agent>;

describe('Record ownership and administration', () => {
  let ctx: Ctx;
  let driver: TestAgent;
  let admin: TestAgent;
  let vehicleId = '';
  let tripId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent: driver } = await signedInAgent(ctx.app));
    admin = await adminAgent(ctx.app);
    const vehicle = await driver.post('/api/vehicles').send(CAR);
    vehicleId = vehicle.body.vehicle.id;
    const trip = await driver.post('/api/trips').send({
      vehicleProfileId: vehicleId,
      origin: PLACE.jurongEast,
      destination: PLACE.marinaBay,
      departureTime: nextWeekday(8, 15).toISOString(),
      parkingDurationMin: 60,
    });
    tripId = trip.body.trip.id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it("NFR-SEC-05 another Driver cannot read this Driver's trip or vehicle", async () => {
    const { agent: other } = await signedInAgent(ctx.app);
    expect((await other.get(`/api/trips/${tripId}`)).status).toBe(404);
    expect((await other.get(`/api/vehicles/${vehicleId}`)).status).toBe(404);
    expect((await other.post(`/api/trips/${tripId}/save`)).status).toBe(404);
  });

  it('FR-ADM-01 a Driver is refused on administration routes and an Administrator is allowed', async () => {
    expect((await driver.get('/api/admin/fuel-prices')).status).toBe(403);
    const res = await admin.get('/api/admin/fuel-prices');
    expect(res.status).toBe(200);
    expect(res.body.fuelPrices.length).toBeGreaterThan(0);
  });

  it('FR-ADM-02 FR-ADM-03 a fuel price gets a system recorded time and withdrawal keeps the record', async () => {
    const created = await admin
      .post('/api/admin/fuel-prices')
      .send({ brand: 'Shell', fuelType: 'PETROL_95', price: 2.85 });
    expect(created.status).toBe(201);
    expect(created.body.fuelPrice.recordedAt).toBeDefined();
    const withdrawn = await admin.post(
      `/api/admin/fuel-prices/${created.body.fuelPrice.id}/withdraw`,
    );
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.fuelPrice.isWithdrawn).toBe(true);
    const list = await admin.get('/api/admin/fuel-prices');
    expect(
      list.body.fuelPrices.some((p: { id: string }) => p.id === created.body.fuelPrice.id),
    ).toBe(true);
    const invalid = await admin
      .post('/api/admin/fuel-prices')
      .send({ brand: 'Shell', fuelType: 'PETROL_95', price: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields.price).toBeDefined();
  });

  it('FR-ADM-05 an overlapping ERP period is rejected, a zero rate is accepted and a negative rate is not', async () => {
    const chargePoints = await admin.get('/api/admin/charge-points');
    const cp = chargePoints.body.chargePoints[0];
    const base = {
      chargePointId: cp.id,
      vehicleClass: 'MOTORCYCLE',
      dayType: 'SATURDAY',
      effectiveDate: '2026-11-02',
    };
    const first = await admin
      .post('/api/admin/erp-rates')
      .send({ ...base, startTime: '13:00', endTime: '14:00', rate: 0 });
    expect(first.status).toBe(201);
    expect(first.body.erpRate.rate).toBe('0');
    const overlap = await admin
      .post('/api/admin/erp-rates')
      .send({ ...base, startTime: '13:30', endTime: '15:00', rate: 1 });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('OVERLAPPING_PERIOD');
    const adjacent = await admin
      .post('/api/admin/erp-rates')
      .send({ ...base, startTime: '14:00', endTime: '15:00', rate: 0.5 });
    expect(adjacent.status).toBe(201);
    const negative = await admin
      .post('/api/admin/erp-rates')
      .send({ ...base, startTime: '15:00', endTime: '16:00', rate: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.error.fields.rate).toBeDefined();
  });

  it('FR-ADM-06 a future revision is stored alongside the current record', async () => {
    const chargePoints = await admin.get('/api/admin/charge-points');
    const cp = chargePoints.body.chargePoints[1];
    const key = {
      chargePointId: cp.id,
      vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
      dayType: 'WEEKDAY',
      startTime: '08:00',
      endTime: '08:30',
    };
    const future = await admin
      .post('/api/admin/erp-rates')
      .send({ ...key, rate: 4, effectiveDate: '2027-02-01' });
    expect(future.status).toBe(201);
    const list = await admin.get('/api/admin/erp-rates');
    const forPoint = list.body.erpRates.filter(
      (r: { chargePointId: string; vehicleClass: string; dayType: string }) =>
        r.chargePointId === cp.id &&
        r.vehicleClass === 'PASSENGER_CAR_LGV_TAXI' &&
        r.dayType === 'WEEKDAY',
    );
    expect(forPoint.length).toBeGreaterThan(1);
  });

  it('FR-ADM-08 FR-SET-03 FR-ADM-09 an efficiency record is offered as a default and never rewrites a saved profile', async () => {
    const created = await admin
      .post('/api/admin/efficiency-records')
      .send({ make: 'Perodua', model: 'Myvi', consumptionRate: 5.2 });
    expect(created.status).toBe(201);
    const duplicate = await admin
      .post('/api/admin/efficiency-records')
      .send({ make: 'perodua', model: 'MYVI', consumptionRate: 5.5 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_RECORD');

    const lookup = await driver.get('/api/reference/efficiency?make=Perodua&model=Myvi');
    expect(lookup.body.found).toBe(true);
    expect(lookup.body.consumptionRate).toBe('5.2');

    const vehicle = await driver.post('/api/vehicles').send({
      displayName: 'Rental Myvi',
      ownershipType: 'RENTED',
      fuelType: 'PETROL_92',
      make: 'Perodua',
      model: 'Myvi',
      tankCapacity: 36,
    });
    expect(vehicle.status).toBe(201);
    expect(vehicle.body.vehicle.consumptionRate).toBe('5.2');

    const updated = await admin
      .put(`/api/admin/efficiency-records/${created.body.record.id}`)
      .send({ make: 'Perodua', model: 'Myvi', consumptionRate: 6.0 });
    expect(updated.status).toBe(200);
    const profile = await driver.get(`/api/vehicles/${vehicle.body.vehicle.id}`);
    expect(profile.body.vehicle.consumptionRate).toBe('5.2');

    expect(
      (await admin.delete(`/api/admin/efficiency-records/${created.body.record.id}`)).status,
    ).toBe(204);
    expect(
      (await driver.get(`/api/vehicles/${vehicle.body.vehicle.id}`)).body.vehicle.consumptionRate,
    ).toBe('5.2');
  });

  it('FR-SET-04 a profile without a consumption rate and without a reference value is rejected on that field', async () => {
    const res = await driver.post('/api/vehicles').send({
      displayName: 'Mystery car',
      ownershipType: 'OWNED',
      fuelType: 'PETROL_95',
      make: 'Unknown',
      model: 'Model X',
      tankCapacity: 40,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.consumptionRate).toContain('reference');
    const zero = await driver.post('/api/vehicles').send({ ...CAR, consumptionRate: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.error.fields.consumptionRate).toBeDefined();
  });

  it('FR-SET-01 a vehicle used by a saved trip cannot be deleted but can be archived', async () => {
    await driver.post(`/api/trips/${tripId}/save`);
    const del = await driver.delete(`/api/vehicles/${vehicleId}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('VEHICLE_IN_USE');
    const archived = await driver.post(`/api/vehicles/${vehicleId}/archive`);
    expect(archived.body.vehicle.isArchived).toBe(true);
    const list = await driver.get('/api/vehicles');
    expect(list.body.vehicles.some((v: { id: string }) => v.id === vehicleId)).toBe(false);
    const withArchived = await driver.get('/api/vehicles?includeArchived=1');
    expect(withArchived.body.vehicles.some((v: { id: string }) => v.id === vehicleId)).toBe(true);
  });

  it('FR-ADM-10 the saved estimate still names the reference records it used after a price is withdrawn', async () => {
    const before = await driver.get(`/api/trips/${tripId}`);
    const fuelBefore = before.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'FUEL',
    );
    const prices = await admin.get('/api/admin/fuel-prices');
    const active = prices.body.fuelPrices.find(
      (p: { fuelType: string; isWithdrawn: boolean }) =>
        p.fuelType === 'PETROL_95' && !p.isWithdrawn,
    );
    await admin.post(`/api/admin/fuel-prices/${active.id}/withdraw`);
    const after = await driver.get(`/api/trips/${tripId}`);
    const fuelAfter = after.body.trip.estimate.legs[0].components.find(
      (c: { type: string }) => c.type === 'FUEL',
    );
    expect(fuelAfter.source.name).toBe(fuelBefore.source.name);
    expect(fuelAfter.amount).toBe(fuelBefore.amount);
  });
});
