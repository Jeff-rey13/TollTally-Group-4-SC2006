import type { FuelType, PrismaClient, VehicleClass } from '@prisma/client';
import { loadConfig } from '../src/config';
import { Decimal } from '../src/domain/money';
import { sgDayStart } from '../src/domain/time';
import { hashPassword } from '../src/lib/password';
import { createPrisma } from '../src/lib/prisma';
import chargePointFile from './data/charge-points.json';
import efficiencyRecords from './data/efficiency-records.json';
import fuelPrices from './data/fuel-prices.json';
import parkingRates from './data/parking-rates.json';
import publicHolidays from './data/public-holidays.json';

/** One LTA rate slot: start, end (exclusive) and the passenger-car rate in dollars. */
type Period = [start: string, end: string, passengerCarRate: string];
type DayRates = Partial<Record<'WEEKDAY' | 'SATURDAY', Period[]>>;

const CLASS_MULTIPLIERS = {
  PASSENGER_CAR_LGV_TAXI: '1',
  MOTORCYCLE: '0.5',
  HGV_SMALL_BUS: '1.5',
  VHGV_BIG_BUS: '2',
} as const;

export interface SeedOptions {
  admin?: { email: string; password: string } | null;
  quiet?: boolean;
}

export async function seed(prisma: PrismaClient, options: SeedOptions = {}): Promise<void> {
  const log = options.quiet ? () => undefined : (msg: string) => console.log(`[seed] ${msg}`);

  for (const cp of chargePointFile.chargePoints) {
    await prisma.chargePoint.upsert({
      where: { code: cp.code },
      create: {
        code: cp.code,
        name: cp.name,
        zoneId: cp.zoneId,
        lat: cp.lat,
        lng: cp.lng,
        headingDeg: cp.headingDeg,
        roads: cp.roads.join('|'),
      },
      update: {
        name: cp.name,
        zoneId: cp.zoneId,
        lat: cp.lat,
        lng: cp.lng,
        headingDeg: cp.headingDeg,
        roads: cp.roads.join('|'),
      },
    });
  }
  // Gantries no longer in the file stay for trip history but are not used for new estimates.
  const retired = await prisma.chargePoint.updateMany({
    where: { code: { notIn: chargePointFile.chargePoints.map((cp) => cp.code) }, isActive: true },
    data: { isActive: false },
  });
  log(
    `${chargePointFile.chargePoints.length} charge points${retired.count ? `, ${retired.count} retired` : ''}`,
  );

  const effectiveDate = sgDayStart(chargePointFile.effectiveDate);
  let ratesCreated = 0;
  let ratesWithdrawn = 0;
  const key = (v: string, d: string, start: string, end: string, rate: string) =>
    `${v}|${d}|${start}|${end}|${rate}`;
  for (const cp of chargePointFile.chargePoints) {
    const row = await prisma.chargePoint.findUniqueOrThrow({ where: { code: cp.code } });
    const wanted = new Set<string>();
    for (const [dayType, periods] of Object.entries(cp.rates as DayRates) as [
      'WEEKDAY' | 'SATURDAY',
      Period[],
    ][]) {
      for (const [startTime, endTime, carRate] of periods) {
        for (const [vehicleClass, multiplier] of Object.entries(CLASS_MULTIPLIERS) as [
          keyof typeof CLASS_MULTIPLIERS,
          string,
        ][]) {
          const rate = new Decimal(carRate).times(multiplier).toFixed(2);
          wanted.add(key(vehicleClass, dayType, startTime, endTime, rate));
          const existing = await prisma.erpRate.findFirst({
            where: {
              chargePointId: row.id,
              vehicleClass,
              dayType,
              startTime,
              endTime,
              effectiveDate,
              isWithdrawn: false,
            },
          });
          if (existing) continue;
          await prisma.erpRate.create({
            data: {
              chargePointId: row.id,
              vehicleClass,
              dayType,
              startTime,
              endTime,
              rate,
              effectiveDate,
            },
          });
          ratesCreated++;
        }
      }
    }
    // Rates from an older table or the earlier sample data are withdrawn, not deleted, so saved
    // estimates still show where their figures came from.
    const current = await prisma.erpRate.findMany({
      where: { chargePointId: row.id, isWithdrawn: false },
    });
    const stale = current
      .filter(
        (r) =>
          r.effectiveDate.getTime() !== effectiveDate.getTime() ||
          !wanted.has(key(r.vehicleClass, r.dayType, r.startTime, r.endTime, r.rate.toFixed(2))),
      )
      .map((r) => r.id);
    if (stale.length) {
      const res = await prisma.erpRate.updateMany({
        where: { id: { in: stale } },
        data: { isWithdrawn: true },
      });
      ratesWithdrawn += res.count;
    }
  }
  log(
    `${ratesCreated} ERP rate records created${ratesWithdrawn ? `, ${ratesWithdrawn} older ones withdrawn` : ''}`,
  );

  for (const fp of fuelPrices) {
    const existing = await prisma.fuelPrice.findFirst({
      where: {
        fuelType: fp.fuelType as 'PETROL_92' | 'PETROL_95' | 'PETROL_98' | 'DIESEL',
        isWithdrawn: false,
      },
    });
    if (existing) continue;
    await prisma.fuelPrice.create({
      data: { brand: fp.brand, fuelType: fp.fuelType as 'PETROL_92', price: fp.price },
    });
  }
  log(`fuel prices ensured for ${fuelPrices.length} fuel types`);

  for (const rec of efficiencyRecords) {
    const catalogue = {
      tankCapacity: rec.tankCapacity,
      fuelType: rec.fuelType as FuelType | null,
      source: rec.source,
      vehicleClass: (rec.vehicleClass ?? 'PASSENGER_CAR_LGV_TAXI') as VehicleClass,
    };
    const existing = await prisma.vehicleEfficiencyRecord.findUnique({
      where: { make_model: { make: rec.make, model: rec.model } },
    });
    if (!existing) {
      await prisma.vehicleEfficiencyRecord.create({
        data: {
          make: rec.make,
          model: rec.model,
          consumptionRate: rec.consumptionRate,
          ...catalogue,
        },
      });
    } else if (existing.source === null && existing.tankCapacity === null) {
      // Older databases: add the published details without touching a rate an administrator set.
      await prisma.vehicleEfficiencyRecord.update({ where: { id: existing.id }, data: catalogue });
    }
  }
  log(`${efficiencyRecords.length} vehicle efficiency defaults`);

  for (const holiday of publicHolidays) {
    await prisma.publicHoliday.upsert({
      where: { date: holiday.date },
      create: { date: holiday.date, name: holiday.name },
      update: { name: holiday.name },
    });
  }
  log(`${publicHolidays.length} public holidays`);

  for (const pr of parkingRates) {
    await prisma.parkingRate.upsert({
      where: { code: pr.code },
      create: {
        code: pr.code,
        carparkName: pr.carparkName,
        lat: pr.lat,
        lng: pr.lng,
        ratePerPeriod: pr.ratePerPeriod,
        chargingPeriodMin: pr.chargingPeriodMin,
        roundingRule: pr.roundingRule,
        source: pr.source,
        vehicleClass: pr.vehicleClass as VehicleClass,
      },
      update: {
        carparkName: pr.carparkName,
        lat: pr.lat,
        lng: pr.lng,
        ratePerPeriod: pr.ratePerPeriod,
        chargingPeriodMin: pr.chargingPeriodMin,
        roundingRule: pr.roundingRule,
        source: pr.source,
        vehicleClass: pr.vehicleClass as VehicleClass,
      },
    });
  }
  log(`${parkingRates.length} parking rates`);

  if (options.admin) {
    const email = options.admin.email.trim().toLowerCase();
    const passwordHash = hashPassword(options.admin.password);
    await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, role: 'ADMINISTRATOR' },
      update: { passwordHash, role: 'ADMINISTRATOR' },
    });
    log(`administrator account ensured for ${email}`);
  } else {
    log('no ADMIN_EMAIL/ADMIN_PASSWORD configured; administrator account not created');
  }
}

if (require.main === module) {
  const config = loadConfig();
  const prisma = createPrisma();
  const admin =
    config.ADMIN_EMAIL && config.ADMIN_PASSWORD
      ? { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD }
      : null;
  seed(prisma, { admin })
    .then(() => console.log('[seed] done'))
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
