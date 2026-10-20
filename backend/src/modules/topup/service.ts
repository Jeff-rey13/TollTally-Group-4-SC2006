import type { TopUpInput, TripDto, VehicleDto } from '@tolltally/shared';
import { FUEL_TYPE_LABELS } from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { tripFuelVolume } from '../../domain/fuel';
import { toLitres } from '../../domain/fuelLevel';
import { Decimal, formatLitres, sum } from '../../domain/money';
import { planTopUp } from '../../domain/topUp';
import { HttpError, notFound } from '../../lib/errors';
import { toDb, toDecimal } from '../../lib/decimal';
import { getTrip } from '../trips/service';

/**
 * «control» FuelTopUpController, UC-13 Plan Fuel Top-Up (includes UC-07).
 * Only for a rented vehicle (FR-REN-01). Converts both levels to litres, rejects levels above the tank
 * (FR-REN-02), computes projected return, top-up volume and cost (FR-REN-03 to FR-REN-05) and stores the plan.
 * The plan never changes the trip total (BR-04).
 * @throws HttpError 409 RENTED_ONLY, NO_ESTIMATE, NO_FUEL_PRICE or TRIP_CHANGED; 400 VALIDATION
 */
export async function planFuelTopUp(
  deps: AppDeps,
  tripId: string,
  userId: string,
  input: TopUpInput,
): Promise<TripDto> {
  const trip = await deps.prisma.trip.findFirst({
    where: { id: tripId, driverId: userId },
    include: { vehicleProfile: true, routes: true },
  });
  if (!trip) throw notFound('Trip');
  const vehicle = trip.vehicleSnapshot
    ? (JSON.parse(trip.vehicleSnapshot) as VehicleDto)
    : trip.vehicleProfile;
  if (vehicle.ownershipType !== 'RENTED') {
    throw new HttpError(
      409,
      'RENTED_ONLY',
      'Fuel top-up planning is available only for a rented vehicle profile',
    );
  }
  const tank = toDecimal(vehicle.tankCapacity);
  if (tank.lte(0))
    throw new HttpError(409, 'NO_TANK_CAPACITY', 'The vehicle profile needs a tank capacity');
  if (trip.routes.length === 0) {
    throw new HttpError(
      409,
      'NO_ESTIMATE',
      'Estimate the trip first so that the route distance is known',
    );
  }
  const fuelPrice = await deps.prisma.fuelPrice.findFirst({
    where: { fuelType: vehicle.fuelType, isWithdrawn: false },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
  });
  if (!fuelPrice) {
    throw new HttpError(
      409,
      'NO_FUEL_PRICE',
      `No current ${FUEL_TYPE_LABELS[vehicle.fuelType]} price is recorded, so the top-up cost cannot be computed`,
    );
  }

  const pickUpL = toLitres(new Decimal(String(input.pickUpLevel)), input.unit, tank);
  const requiredL = toLitres(new Decimal(String(input.requiredReturnLevel)), input.unit, tank);
  const fields: Record<string, string> = {};
  if (requiredL.gt(tank))
    fields.requiredReturnLevel = `The required return level exceeds the tank capacity of ${formatLitres(tank)} L`;
  if (pickUpL.gt(tank))
    fields.pickUpLevel = `The pick-up level exceeds the tank capacity of ${formatLitres(tank)} L`;
  if (Object.keys(fields).length)
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', fields);

  const consumption = toDecimal(vehicle.consumptionRate);
  const tripFuelL = sum(
    trip.routes.map((r) => tripFuelVolume(toDecimal(r.distanceKm), consumption)),
  );
  const plan = planTopUp({
    pickUpL,
    requiredReturnL: requiredL,
    tripFuelL,
    pricePerLitre: toDecimal(fuelPrice.price),
  });

  const data = {
    fuelPriceId: fuelPrice.id,
    pickUpLevel: String(input.pickUpLevel),
    requiredReturnLevel: String(input.requiredReturnLevel),
    levelUnit: input.unit,
    pickUpVolume: toDb(pickUpL),
    requiredReturnVolume: toDb(requiredL),
    tripFuelVolume: toDb(tripFuelL),
    projectedReturnVolume: toDb(plan.projectedReturnL),
    shortfall: toDb(plan.shortfallL),
    topUpVolume: toDb(plan.topUpL),
    estimatedCost: toDb(plan.cost),
    sourceSnapshot: JSON.stringify({
      tankCapacity: tank.toString(),
      price: fuelPrice.price.toString(),
      name: `${fuelPrice.brand} ${FUEL_TYPE_LABELS[fuelPrice.fuelType]} price`,
      recordedAt: fuelPrice.recordedAt.toISOString(),
    }),
  };
  await deps.prisma.$transaction(async (tx) => {
    const claimed = await tx.trip.updateMany({
      where: { id: tripId, driverId: userId, revision: trip.revision },
      data: { revision: { increment: 1 } },
    });
    if (!claimed.count)
      throw new HttpError(
        409,
        'TRIP_CHANGED',
        'This trip has changed. Reload it before planning a fuel top-up.',
      );
    await tx.fuelTopUpPlan.upsert({
      where: { tripId },
      create: { tripId, ...data },
      update: { ...data, createdAt: new Date() },
    });
  });
  return getTrip(deps, tripId, userId);
}
