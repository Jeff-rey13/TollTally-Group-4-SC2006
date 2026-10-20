import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config';
import { sgDayStart } from '../src/domain/time';
import { createPrisma } from '../src/lib/prisma';

const ENDPOINT = 'https://datamall2.mytransport.sg/ltaodataservice/ERPRates';
const PAGE_SIZE = 500;

interface DataMallRow {
  VehicleType: string;
  DayType: string;
  StartTime: string;
  EndTime: string;
  ZoneID: string;
  ChargeAmount: number | string;
  EffectiveDate: string;
}

function mapVehicleClass(
  value: string,
): 'PASSENGER_CAR_LGV_TAXI' | 'MOTORCYCLE' | 'HGV_SMALL_BUS' | 'VHGV_BIG_BUS' | null {
  const v = value.toLowerCase();
  if (v.includes('motorcycle')) return 'MOTORCYCLE';
  if (v.includes('very heavy')) return 'VHGV_BIG_BUS';
  if (v.includes('heavy')) return 'HGV_SMALL_BUS';
  if (v.includes('passenger') || v.includes('light goods') || v.includes('taxi'))
    return 'PASSENGER_CAR_LGV_TAXI';
  return null;
}

function mapDayType(value: string): 'WEEKDAY' | 'SATURDAY' | 'SUNDAY_PUBLIC_HOLIDAY' | null {
  const v = value.toLowerCase();
  if (v.includes('weekday')) return 'WEEKDAY';
  if (v.includes('saturday')) return 'SATURDAY';
  if (v.includes('sunday') || v.includes('holiday')) return 'SUNDAY_PUBLIC_HOLIDAY';
  return null;
}

async function fetchAll(accountKey: string): Promise<DataMallRow[]> {
  const rows: DataMallRow[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const res = await fetch(`${ENDPOINT}?$skip=${skip}`, {
      headers: { AccountKey: accountKey, accept: 'application/json' },
    });
    if (res.status === 404) {
      throw new Error(
        'DataMall has no ERP Rates API any more (HTTP 404). The app now loads LTA rates from the ' +
          'OneMotoring rate tables instead: see "Updating ERP rates" in DEMO-SETUP.md.',
      );
    }
    if (!res.ok) throw new Error(`DataMall returned HTTP ${res.status}`);
    const body = (await res.json()) as { value?: DataMallRow[] };
    const page = body.value ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.LTA_ACCOUNT_KEY) {
    throw new Error(
      'Set LTA_ACCOUNT_KEY in backend/.env (register at https://datamall.lta.gov.sg)',
    );
  }
  const prisma = createPrisma();
  try {
    const rows = await fetchAll(config.LTA_ACCOUNT_KEY);
    console.log(`[import-erp] fetched ${rows.length} rows`);
    const chargePoints = await prisma.chargePoint.findMany();
    const byZone = new Map<string, typeof chargePoints>();
    for (const cp of chargePoints) byZone.set(cp.zoneId, [...(byZone.get(cp.zoneId) ?? []), cp]);

    if (process.argv.includes('--dry-run')) {
      // Report only: what LTA publishes per zone, and which zones the app can place on a road.
      const file = join(__dirname, 'data', 'erp-rates-latest.json');
      writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
      const zones = [...new Set(rows.map((r) => r.ZoneID))].sort();
      console.log(
        `[import-erp] dry run: nothing saved to the database. ${zones.length} zones from LTA:`,
      );
      for (const zone of zones) {
        const carWeekday = rows
          .filter(
            (r) =>
              r.ZoneID === zone &&
              mapVehicleClass(r.VehicleType) === 'PASSENGER_CAR_LGV_TAXI' &&
              mapDayType(r.DayType) === 'WEEKDAY' &&
              Number(r.ChargeAmount) > 0,
          )
          .sort((a, b) => a.StartTime.localeCompare(b.StartTime));
        const span = carWeekday.length
          ? `${carWeekday[0].StartTime}-${carWeekday[carWeekday.length - 1].EndTime}, up to $${Math.max(...carWeekday.map((r) => Number(r.ChargeAmount))).toFixed(2)}`
          : 'no weekday car charge';
        const known =
          byZone
            .get(zone)
            ?.map((c) => c.name)
            .join('; ') ?? 'no gantry in the app';
        console.log(`  ${zone.padEnd(5)} ${span.padEnd(28)} ${known}`);
      }
      console.log(`[import-erp] full LTA data saved to ${file}`);
      return;
    }

    let created = 0;
    const unknownZones = new Set<string>();
    const importedKeys = new Map<string, Set<string>>();
    const rateKey = (v: string, d: string, s: string, e: string, eff: Date) =>
      `${v}|${d}|${s}|${e}|${eff.toISOString()}`;
    for (const row of rows) {
      const targets = byZone.get(row.ZoneID);
      if (!targets) {
        unknownZones.add(row.ZoneID);
        continue;
      }
      const vehicleClass = mapVehicleClass(row.VehicleType);
      const dayType = mapDayType(row.DayType);
      if (!vehicleClass || !dayType) continue;
      const effectiveDate = sgDayStart(row.EffectiveDate.slice(0, 10));
      const rate = String(row.ChargeAmount);
      for (const cp of targets) {
        const keys = importedKeys.get(cp.id) ?? new Set<string>();
        keys.add(rateKey(vehicleClass, dayType, row.StartTime, row.EndTime, effectiveDate));
        importedKeys.set(cp.id, keys);
        const existing = await prisma.erpRate.findFirst({
          where: {
            chargePointId: cp.id,
            vehicleClass,
            dayType,
            startTime: row.StartTime,
            endTime: row.EndTime,
            effectiveDate,
          },
        });
        if (existing) continue;
        await prisma.erpRate.create({
          data: {
            chargePointId: cp.id,
            vehicleClass,
            dayType,
            startTime: row.StartTime,
            endTime: row.EndTime,
            rate,
            effectiveDate,
          },
        });
        created++;
      }
    }
    console.log(`[import-erp] created ${created} rate records`);

    let withdrawn = 0;
    for (const [chargePointId, keys] of importedKeys) {
      const current = await prisma.erpRate.findMany({
        where: { chargePointId, isWithdrawn: false },
      });
      const stale = current
        .filter(
          (r) =>
            !keys.has(rateKey(r.vehicleClass, r.dayType, r.startTime, r.endTime, r.effectiveDate)),
        )
        .map((r) => r.id);
      if (stale.length === 0) continue;
      const res = await prisma.erpRate.updateMany({
        where: { id: { in: stale } },
        data: { isWithdrawn: true },
      });
      withdrawn += res.count;
    }
    console.log(
      `[import-erp] ${importedKeys.size} charge points now use LTA rates; withdrew ${withdrawn} older demo or manual rates`,
    );
    if (unknownZones.size) {
      console.log(
        `[import-erp] ${unknownZones.size} zone IDs had no seeded charge point and were skipped: ${[...unknownZones].sort().join(', ')}`,
      );
      console.log(
        '[import-erp] add charge points with those zoneIds in prisma/data/charge-points.json and re-run',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[import-erp] failed:', err);
  process.exitCode = 1;
});
