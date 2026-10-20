import type { VehicleProfile } from '@prisma/client';
import type {
  EfficiencyDefaultDto,
  VehicleDto,
  VehicleInput,
  VehicleModelDto,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { HttpError, notFound } from '../../lib/errors';

export function toVehicleDto(v: VehicleProfile): VehicleDto {
  return {
    id: v.id,
    displayName: v.displayName,
    make: v.make,
    model: v.model,
    ownershipType: v.ownershipType,
    fuelType: v.fuelType,
    vehicleClass: v.vehicleClass,
    consumptionRate: v.consumptionRate.toString(),
    tankCapacity: v.tankCapacity.toString(),
    isArchived: v.isArchived,
    createdAt: v.createdAt.toISOString(),
  };
}

/**
 * Finds the administrator's reference consumption rate for a make and model (FR-SET-03).
 */
export async function lookupEfficiency(
  deps: AppDeps,
  make: string,
  model: string,
): Promise<EfficiencyDefaultDto> {
  const wantedMake = make.trim().toLowerCase();
  const wantedModel = model.trim().toLowerCase();
  if (!wantedMake || !wantedModel) return { found: false, make, model, consumptionRate: null };
  const records = await deps.prisma.vehicleEfficiencyRecord.findMany();
  const match = records.find(
    (r) => r.make.toLowerCase() === wantedMake && r.model.toLowerCase() === wantedModel,
  );
  return match
    ? {
        found: true,
        make: match.make,
        model: match.model,
        consumptionRate: match.consumptionRate.toString(),
        tankCapacity: match.tankCapacity?.toString() ?? null,
        fuelType: match.fuelType ?? null,
        source: match.source ?? null,
      }
    : { found: false, make, model, consumptionRate: null };
}

/**
 * The make-and-model list behind the vehicle picker, sorted for display (UC-04 convenience).
 */
export async function listVehicleModels(deps: AppDeps): Promise<VehicleModelDto[]> {
  const rows = await deps.prisma.vehicleEfficiencyRecord.findMany({
    orderBy: [{ make: 'asc' }, { model: 'asc' }],
  });
  return rows.map((r) => ({
    make: r.make,
    model: r.model,
    consumptionRate: r.consumptionRate.toString(),
    tankCapacity: r.tankCapacity?.toString() ?? null,
    fuelType: r.fuelType ?? null,
    source: r.source ?? null,
    vehicleClass: r.vehicleClass,
  }));
}

async function resolveConsumptionRate(deps: AppDeps, input: VehicleInput): Promise<string> {
  if (input.consumptionRate !== undefined) return String(input.consumptionRate);
  const reference = await lookupEfficiency(deps, input.make ?? '', input.model ?? '');
  if (reference.found && reference.consumptionRate) return reference.consumptionRate;
  throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
    consumptionRate: 'Enter a consumption rate; no reference value exists for this make and model',
  });
}

/**
 * Lists the Driver's own vehicle profiles, optionally including archived ones (UC-04).
 */
export async function listVehicles(
  deps: AppDeps,
  userId: string,
  includeArchived: boolean,
): Promise<VehicleDto[]> {
  const rows = await deps.prisma.vehicleProfile.findMany({
    where: { driverId: userId, ...(includeArchived ? {} : { isArchived: false }) },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toVehicleDto);
}

export async function getOwnedVehicle(
  deps: AppDeps,
  userId: string,
  id: string,
): Promise<VehicleProfile> {
  const row = await deps.prisma.vehicleProfile.findFirst({ where: { id, driverId: userId } });
  if (!row) throw notFound('Vehicle profile');
  return row;
}

/**
 * Creates a vehicle profile owned by the Driver (UC-04, FR-SET-02).
 * Uses the reference rate when no consumption rate is given and one exists; rejects the profile otherwise (FR-SET-04).
 */
export async function createVehicle(
  deps: AppDeps,
  userId: string,
  input: VehicleInput,
): Promise<VehicleDto> {
  const consumptionRate = await resolveConsumptionRate(deps, input);
  const row = await deps.prisma.vehicleProfile.create({
    data: {
      driverId: userId,
      displayName: input.displayName,
      make: input.make ?? null,
      model: input.model ?? null,
      ownershipType: input.ownershipType,
      fuelType: input.fuelType,
      vehicleClass: input.vehicleClass,
      consumptionRate,
      tankCapacity: String(input.tankCapacity),
    },
  });
  return toVehicleDto(row);
}

/**
 * Updates one of the Driver's vehicle profiles (UC-04).
 */
export async function updateVehicle(
  deps: AppDeps,
  userId: string,
  id: string,
  input: VehicleInput,
): Promise<VehicleDto> {
  await getOwnedVehicle(deps, userId, id);
  const consumptionRate = await resolveConsumptionRate(deps, input);
  const row = await deps.prisma.vehicleProfile.update({
    where: { id },
    data: {
      displayName: input.displayName,
      make: input.make ?? null,
      model: input.model ?? null,
      ownershipType: input.ownershipType,
      fuelType: input.fuelType,
      vehicleClass: input.vehicleClass,
      consumptionRate,
      tankCapacity: String(input.tankCapacity),
    },
  });
  return toVehicleDto(row);
}

/**
 * Deletes a vehicle profile unless a saved trip uses it, in which case it throws 409 VEHICLE_IN_USE
 * so the Driver archives it instead (FR-SET-01).
 */
export async function deleteVehicle(deps: AppDeps, userId: string, id: string): Promise<void> {
  await getOwnedVehicle(deps, userId, id);
  const savedTrips = await deps.prisma.trip.count({
    where: { vehicleProfileId: id, status: { in: ['SAVED', 'COMPLETED'] } },
  });
  if (savedTrips > 0) {
    throw new HttpError(
      409,
      'VEHICLE_IN_USE',
      `This vehicle is used by ${savedTrips} saved trip${savedTrips === 1 ? '' : 's'}. Archive it instead to keep the saved trip details.`,
    );
  }
  await deps.prisma.$transaction([
    deps.prisma.trip.deleteMany({ where: { vehicleProfileId: id } }),
    deps.prisma.vehicleProfile.delete({ where: { id } }),
  ]);
}

/**
 * Archives or restores a vehicle profile. Archived profiles leave the planner but stay readable on saved trips.
 */
export async function archiveVehicle(
  deps: AppDeps,
  userId: string,
  id: string,
  archived: boolean,
): Promise<VehicleDto> {
  await getOwnedVehicle(deps, userId, id);
  const row = await deps.prisma.vehicleProfile.update({
    where: { id },
    data: { isArchived: archived },
  });
  return toVehicleDto(row);
}
