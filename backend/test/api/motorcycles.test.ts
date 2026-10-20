import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ComponentDto, TripDto } from '@tolltally/shared';
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

const BIKE = {
  displayName: 'Daily scooter',
  ownershipType: 'OWNED',
  fuelType: 'PETROL_95',
  vehicleClass: 'MOTORCYCLE',
  make: 'Honda',
  model: 'PCX125',
  consumptionRate: 2.1,
  tankCapacity: 8.1,
};

function component(trip: TripDto, type: ComponentDto['type']): ComponentDto {
  return trip.estimate!.legs[0].components.find((c) => c.type === type)!;
}

async function plan(agent: Agent, vehicleProfileId: string, destination = PLACE.marinaBay) {
  const res = await agent.post('/api/trips').send({
    vehicleProfileId,
    origin: PLACE.jurongEast,
    destination,
    departureTime: nextWeekday(8, 15).toISOString(),
    parkingDurationMin: 90,
  });
  expect(res.status).toBe(201);
  return res.body.trip as TripDto;
}

describe('Motorcycles', () => {
  let ctx: Ctx;
  let agent: Agent;
  let bikeId = '';
  let carId = '';

  beforeAll(async () => {
    ctx = await createTestContext();
    ({ agent } = await signedInAgent(ctx.app));
    bikeId = (await agent.post('/api/vehicles').send(BIKE)).body.vehicle.id;
    carId = (await agent.post('/api/vehicles').send(CAR)).body.vehicle.id;
  });
  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  it('FR-SET-12 the vehicle list offers motorcycles with their source, apart from cars', async () => {
    const res = await agent.get('/api/reference/vehicle-models');
    const bikes = res.body.models.filter(
      (m: { vehicleClass: string }) => m.vehicleClass === 'MOTORCYCLE',
    );
    expect(bikes.length).toBeGreaterThanOrEqual(8);
    const pcx = bikes.find((m: { model: string }) => m.model === 'PCX125');
    expect(pcx).toMatchObject({ make: 'Honda', consumptionRate: '2.1', tankCapacity: '8.1' });
    expect(pcx.source).toContain('1000ps.com');
    const cars = res.body.models.filter(
      (m: { vehicleClass: string }) => m.vehicleClass !== 'MOTORCYCLE',
    );
    expect(cars.some((m: { make: string }) => m.make === 'Toyota')).toBe(true);
  });

  it('FR-EST-16 a motorcycle pays half the car rate at each ERP gantry', async () => {
    const bike = component(await plan(agent, bikeId), 'ROAD_USAGE');
    const car = component(await plan(agent, carId), 'ROAD_USAGE');
    expect(Number(car.amount)).toBeGreaterThan(0);
    expect(Number(bike.amount)).toBeCloseTo(Number(car.amount) / 2, 2);
  });

  it('FR-EST-16 a motorcycle is parked at a motorcycle rate, or parking is named unavailable', async () => {
    // Marina Bay Sands has no motorcycle parking and no motorcycle rate is known within 1 km.
    const atMbs = await plan(agent, bikeId);
    const parking = component(atMbs, 'PARKING');
    expect(parking.isAvailable).toBe(false);
    expect(parking.unavailableReason).toMatch(/motorcycle/i);
    expect(atMbs.estimate!.totalIsLowerBound).toBe(true);

    // An HDB carpark charges one $0.65 motorcycle coupon for the day.
    const hdb = component(await plan(agent, bikeId, PLACE.toaPayoh), 'PARKING');
    expect(hdb.isAvailable).toBe(true);
    expect(hdb.amount).toBe('0.65');
    expect(hdb.source.name).toMatch(/motorcycle/i);
  });

  it('FR-ADM-07 an administrator adds a motorcycle to the vehicle list', async () => {
    const admin = await adminAgent(ctx.app);
    const res = await admin.post('/api/admin/efficiency-records').send({
      make: 'Suzuki',
      model: 'Burgman Street 125 (test)',
      consumptionRate: 2.0,
      tankCapacity: 5.5,
      vehicleClass: 'MOTORCYCLE',
    });
    expect(res.status).toBe(201);
    expect(res.body.record.vehicleClass).toBe('MOTORCYCLE');
    await admin.delete(`/api/admin/efficiency-records/${res.body.record.id}`);
  });
});
