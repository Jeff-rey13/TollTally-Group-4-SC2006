/**
 * Moves each known ERP gantry onto the road OneMap actually routes along, so live routes count it.
 *
 * For every gantry in prisma/data/charge-points.json it asks OneMap for a short drive that passes
 * the gantry in its charged direction, then takes the closest point on that drive as the new
 * position and the road direction there as the new heading.
 *
 *   npm run erp:calibrate             shows what would change (nothing is saved)
 *   npm run erp:calibrate -- --apply  saves the results marked OK to the JSON file and the database
 *   npm run erp:calibrate -- --apply --force   also saves the results marked CHECK
 *
 * Open the map links for anything marked CHECK before forcing it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OneMapRoutingAdapter } from '../src/adapters/routing';
import { loadConfig } from '../src/config';
import { nearestApproach, type NearestApproach } from '../src/domain/crossings';
import { haversineKm, offsetPoint } from '../src/domain/geo';
import { createPrisma } from '../src/lib/prisma';

interface SeedChargePoint {
  code: string;
  name: string;
  zoneId: string;
  lat: number;
  lng: number;
  headingDeg: number;
  rates: unknown;
  roads: string[];
}

const FILE = join(__dirname, 'data', 'charge-points.json');
const APPROACH_M = [300, 600];
const MAX_ANGLE_DEG = 45;
const MAX_MOVE_M = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const mapLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');
  const config = loadConfig();
  if (!config.ONEMAP_EMAIL || !config.ONEMAP_PASSWORD) {
    throw new Error('Set ONEMAP_EMAIL and ONEMAP_PASSWORD in backend/.env first');
  }
  const onemap = new OneMapRoutingAdapter({
    email: config.ONEMAP_EMAIL,
    password: config.ONEMAP_PASSWORD,
    timeoutMs: Math.max(config.EXTERNAL_TIMEOUT_MS, 10_000),
  });

  const file = JSON.parse(readFileSync(FILE, 'utf8')) as { chargePoints: SeedChargePoint[] };
  const updates: { cp: SeedChargePoint; lat: number; lng: number; headingDeg: number }[] = [];
  let ok = 0;
  let check = 0;

  for (const cp of file.chargePoints) {
    let best: { near: NearestApproach; routeKm: number } | null = null;
    let lastError = '';
    for (const lengthM of APPROACH_M) {
      const origin = offsetPoint(cp, (cp.headingDeg + 180) % 360, lengthM);
      const destination = offsetPoint(cp, cp.headingDeg, lengthM);
      try {
        const route = await onemap.route({ origin, destination, departureTime: new Date() });
        const near = nearestApproach(route.geometry, {
          id: cp.code,
          lat: cp.lat,
          lng: cp.lng,
          headingDeg: cp.headingDeg,
        });
        const routeKm = Number(route.distanceKm);
        const straightKm = haversineKm(origin, destination);
        const detour = routeKm > straightKm * 3 + 0.5;
        if (
          near &&
          near.headingDiffDeg <= MAX_ANGLE_DEG &&
          !detour &&
          (!best || near.distM < best.near.distM)
        ) {
          best = { near, routeKm };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      await sleep(300);
    }

    if (!best) {
      check++;
      console.log(
        `CHECK  ${cp.code.padEnd(16)} no OneMap drive passes it in the charged direction` +
          `${lastError ? ` (${lastError})` : ''}. Current spot: ${mapLink(cp.lat, cp.lng)}`,
      );
      continue;
    }
    const lat = round5(best.near.point.lat);
    const lng = round5(best.near.point.lng);
    const headingDeg = Math.round(best.near.routeBearingDeg) % 360;
    const moved = best.near.distM;
    const status = moved <= MAX_MOVE_M ? 'OK' : 'CHECK';
    if (status === 'OK') ok++;
    else check++;
    console.log(
      `${status.padEnd(6)} ${cp.code.padEnd(16)} move ${moved.toFixed(0).padStart(4)} m to ${lat},${lng} ` +
        `heading ${cp.headingDeg} -> ${headingDeg}  ${mapLink(lat, lng)}`,
    );
    if (status === 'OK' || force) updates.push({ cp, lat, lng, headingDeg });
  }

  console.log(`\n${ok} OK, ${check} to check by hand.`);
  if (!apply) {
    console.log('Nothing saved. Run again with --apply to save the OK results.');
    return;
  }

  for (const u of updates) {
    u.cp.lat = u.lat;
    u.cp.lng = u.lng;
    u.cp.headingDeg = u.headingDeg;
  }
  writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`);
  const prisma = createPrisma();
  try {
    for (const u of updates) {
      await prisma.chargePoint.updateMany({
        where: { code: u.cp.code },
        data: { lat: u.lat, lng: u.lng, headingDeg: u.headingDeg },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    `Saved ${updates.length} gantries to prisma/data/charge-points.json and the database.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
