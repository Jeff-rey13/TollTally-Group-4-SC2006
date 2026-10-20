import type { Express } from 'express';
import request from 'supertest';
import { seed } from '../../prisma/seed';
import holidays from '../../prisma/data/public-holidays.json';
import {
  MockIncidentAdapter,
  MockWeatherAdapter,
  type TrafficIncidentService,
  type WeatherService,
} from '../../src/adapters/conditions';
import { TableParkingAdapter } from '../../src/adapters/parking';
import { MOCK_PLACES, MockRoutingAdapter } from '../../src/adapters/routing';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { sgLocal, sgParts } from '../../src/domain/time';
import { createPrisma } from '../../src/lib/prisma';

export const ADMIN = { email: 'admin@test.local', password: 'Admin1234' };

export async function createTestContext(
  overrides: { traffic?: TrafficIncidentService | null; weather?: WeatherService | null } = {},
) {
  const config = loadConfig({ NODE_ENV: 'test', RATE_LIMITS: 'off' });
  if (!config.DATABASE_URL.includes('test.db')) {
    throw new Error(`Refusing to run tests against ${config.DATABASE_URL}`);
  }
  const prisma = createPrisma(config.DATABASE_URL);
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await seed(prisma, { admin: ADMIN, quiet: true });
  const app = createApp({
    prisma,
    routing: new MockRoutingAdapter(),
    parking: new TableParkingAdapter(prisma, config.PARKING_SEARCH_RADIUS_KM),
    // Never the live feeds in tests, even when the developer's .env has an LTA key.
    traffic: 'traffic' in overrides ? overrides.traffic : new MockIncidentAdapter(),
    weather: 'weather' in overrides ? overrides.weather : new MockWeatherAdapter(),
    config,
  });
  return { app, prisma, config };
}

let counter = 0;
export function uniqueEmail(prefix = 'driver'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@test.local`;
}

export async function signedInAgent(app: Express, email = uniqueEmail(), password = 'Driver1234') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password, acceptPrivacy: true });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    agent,
    email,
    password,
    user: res.body.user as { id: string; email: string; role: string },
  };
}

export async function adminAgent(app: Express) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send(ADMIN);
  if (res.status !== 200)
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

function place(name: string) {
  const p = MOCK_PLACES.find((x) => x.name === name);
  if (!p) throw new Error(`no mock place ${name}`);
  return { name: p.name, lat: p.lat, lng: p.lng };
}

export const PLACE = {
  jurongEast: place('Jurong East MRT Station'),
  marinaBay: place('Marina Bay Sands'),
  toaPayoh: place('Toa Payoh Central'),
  angMoKio: place('Ang Mo Kio Hub'),
  timeout: place('Mock Timeout Point (testing)'),
};

const HOLIDAYS = new Set(holidays.map((h) => h.date));

export function nextWeekday(hour = 8, minute = 15): Date {
  let d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  for (let i = 0; i < 14; i++) {
    const p = sgParts(d);
    if (p.weekday >= 1 && p.weekday <= 5 && !HOLIDAYS.has(p.isoDate))
      return sgLocal(p.year, p.month, p.day, hour, minute);
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  throw new Error('no weekday found');
}

export const CAR = {
  displayName: 'Family Corolla',
  ownershipType: 'OWNED',
  fuelType: 'PETROL_95',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  consumptionRate: 7.5,
  tankCapacity: 50,
};

export const RENTAL = {
  displayName: 'Weekend rental',
  ownershipType: 'RENTED',
  fuelType: 'PETROL_95',
  vehicleClass: 'PASSENGER_CAR_LGV_TAXI',
  consumptionRate: 7.5,
  tankCapacity: 50,
};
