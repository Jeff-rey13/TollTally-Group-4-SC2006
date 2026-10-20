/**
 * ERP diagnostic for live routing. Plans one trip with the configured routing service (OneMap),
 * shows how close the route passes each known gantry and whether it is counted, then prices the
 * crossings for a weekday departure.
 *
 * Usage (from the backend folder or with -w @tolltally/backend):
 *   npm run erp:check -- "Jurong East" "Marina Bay Sands" 08:30
 */
import { buildRoutingService } from '../src/adapters/routing';
import { loadConfig } from '../src/config';
import { detectCrossings, nearestApproach } from '../src/domain/crossings';
import { roadUsage } from '../src/domain/erp';
import { formatSgTime, parseHHMM, sgDateString, sgLocal, sgParts } from '../src/domain/time';
import { createPrisma } from '../src/lib/prisma';
import { loadReferenceData } from '../src/modules/trips/pricing';

/** The next Monday to Friday (Singapore time) at the given minutes past midnight. */
function nextWeekday(minutesOfDay: number): Date {
  const now = sgParts(new Date());
  for (let add = 1; add <= 7; add++) {
    const day = sgLocal(now.year, now.month, now.day + add, 12, 0);
    const parts = sgParts(day);
    if (parts.weekday >= 1 && parts.weekday <= 5) {
      return sgLocal(
        parts.year,
        parts.month,
        parts.day,
        Math.floor(minutesOfDay / 60),
        minutesOfDay % 60,
      );
    }
  }
  throw new Error('No weekday found');
}

async function main(): Promise<void> {
  const [from = 'Jurong East', to = 'Marina Bay Sands', at = '08:30'] = process.argv.slice(2);
  const config = loadConfig();
  if (config.ROUTING_PROVIDER !== 'onemap') {
    console.log(
      'ROUTING_PROVIDER is "mock" in backend/.env. Set it to "onemap" to check live routes.',
    );
  }
  const routing = buildRoutingService(config);
  const prisma = createPrisma();
  try {
    const [origin] = await routing.search(from);
    const [destination] = await routing.search(to);
    if (!origin || !destination) throw new Error(`No search result for "${!origin ? from : to}"`);
    console.log(`From: ${origin.name} (${origin.lat}, ${origin.lng})`);
    console.log(`To:   ${destination.name} (${destination.lat}, ${destination.lng})`);

    const departure = nextWeekday(parseHHMM(at));
    const route = await routing.route({ origin, destination, departureTime: departure });
    console.log(
      `Route from ${route.provider}: ${Number(route.distanceKm).toFixed(1)} km, ` +
        `${Math.round(route.drivingTimeSec / 60)} min, ${route.geometry.length} points\n`,
    );

    const ref = await loadReferenceData(prisma, 'PETROL_95');
    const maxDist = config.ERP_CROSSING_DISTANCE_M;
    const maxAngle = config.ERP_CROSSING_HEADING_DEG;
    const crossings = detectCrossings(
      route.geometry,
      ref.chargePoints,
      route.drivingTimeSec,
      departure,
      {
        maxDistanceM: maxDist,
        maxHeadingDiffDeg: maxAngle,
        sameRoadDistanceM: config.ERP_SAME_ROAD_DISTANCE_M,
        roads: route.roads,
      },
    );
    const countedIds = new Set(crossings.map((c) => c.chargePointId));
    console.log(
      `Counting rule: within ${maxDist} m of the route and within ${maxAngle} degrees of its direction`,
    );
    console.log(
      route.roads?.length
        ? `OneMap road names on this route: ${[...new Set(route.roads.map((r) => r.name))].join(', ')}`
        : 'OneMap gave no road names, so only the distance rule applies.',
    );
    console.log(
      `On the gantry's own road the limit widens to ${config.ERP_SAME_ROAD_DISTANCE_M} m.`,
    );
    console.log('Gantries within 1 km of the route, nearest first:');
    const rows = ref.chargePoints
      .map((cp) => ({ cp, near: nearestApproach(route.geometry, cp) }))
      .filter((r) => r.near && r.near.distM <= 1000)
      .sort((a, b) => a.near!.distM - b.near!.distM);
    if (!rows.length) console.log('  none. This route does not pass any gantry the app knows.');
    for (const { cp, near } of rows) {
      const counted = countedIds.has(cp.id);
      console.log(
        `  ${counted ? 'COUNTED ' : 'missed  '} ${cp.code.padEnd(16)} ${cp.zoneId.padEnd(5)} ` +
          `${near!.distM.toFixed(0).padStart(4)} m away, angle ${near!.headingDiffDeg.toFixed(0).padStart(3)} deg ` +
          `(gantry ${cp.headingDeg}, route ${near!.routeBearingDeg.toFixed(0)})  closest route point ` +
          `${near!.point.lat.toFixed(5)},${near!.point.lng.toFixed(5)}`,
      );
    }

    const nameOf = (id: string): string => ref.chargePoints.find((c) => c.id === id)?.name ?? id;
    const usage = roadUsage(
      crossings,
      ref.rates,
      'PASSENGER_CAR_LGV_TAXI',
      ref.holidays,
      config.ERP_BOUNDARY_TOLERANCE_MIN,
      nameOf,
    );
    console.log(`\nPassenger car leaving ${sgDateString(departure)} ${formatSgTime(departure)}:`);
    for (const item of usage.items) {
      console.log(
        `  ${formatSgTime(item.crossingTime)} ${nameOf(item.chargePointId)}: ` +
          (item.excluded
            ? `not priced (${item.reason})`
            : `SGD ${item.charge!.toFixed(2)} (${item.ratePeriod ?? 'no charge at this time'})`),
      );
    }
    console.log(`  ERP total SGD ${usage.subtotal.toFixed(2)}`);
    if (!crossings.length && rows.length) {
      console.log(
        '\nThe route passes near gantries but none is counted. Run "npm run erp:calibrate" to move the ' +
          'gantries onto the roads OneMap uses, then run this check again.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
