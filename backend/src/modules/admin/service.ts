import type { ChargePoint, ErpRate, FuelPrice, VehicleEfficiencyRecord } from '@prisma/client';
import type {
  ChargePointDto,
  EfficiencyRecordDto,
  EfficiencyRecordInput,
  ErpRateDto,
  ErpRateInput,
  FuelPriceDto,
  FuelPriceInput,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { periodsOverlap } from '../../domain/erp';
import { sgDateString, sgDayStart } from '../../domain/time';
import { HttpError, notFound } from '../../lib/errors';

export function toFuelPriceDto(row: FuelPrice): FuelPriceDto {
  return {
    id: row.id,
    brand: row.brand,
    fuelType: row.fuelType,
    price: row.price.toString(),
    recordedAt: row.recordedAt.toISOString(),
    isWithdrawn: row.isWithdrawn,
  };
}

export function toChargePointDto(row: ChargePoint): ChargePointDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    zoneId: row.zoneId,
    lat: row.lat,
    lng: row.lng,
    headingDeg: row.headingDeg,
    isActive: row.isActive,
  };
}

export function toErpRateDto(row: ErpRate & { chargePoint: ChargePoint }): ErpRateDto {
  return {
    id: row.id,
    chargePointId: row.chargePointId,
    chargePointName: row.chargePoint.name,
    vehicleClass: row.vehicleClass,
    dayType: row.dayType,
    startTime: row.startTime,
    endTime: row.endTime,
    rate: row.rate.toString(),
    effectiveDate: sgDateString(row.effectiveDate),
    recordedAt: row.recordedAt.toISOString(),
    isWithdrawn: row.isWithdrawn,
  };
}

export function toEfficiencyDto(row: VehicleEfficiencyRecord): EfficiencyRecordDto {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    consumptionRate: row.consumptionRate.toString(),
    tankCapacity: row.tankCapacity?.toString() ?? null,
    fuelType: row.fuelType ?? null,
    source: row.source ?? null,
    vehicleClass: row.vehicleClass,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFuelPrices(deps: AppDeps): Promise<FuelPriceDto[]> {
  const rows = await deps.prisma.fuelPrice.findMany({
    orderBy: [{ isWithdrawn: 'asc' }, { recordedAt: 'desc' }],
  });
  return rows.map(toFuelPriceDto);
}

/**
 * UC-17. Adds a fuel price with a server-set recorded time (FR-ADM-02).
 */
export async function createFuelPrice(deps: AppDeps, input: FuelPriceInput): Promise<FuelPriceDto> {
  const row = await deps.prisma.fuelPrice.create({
    data: { brand: input.brand, fuelType: input.fuelType, price: String(input.price) },
  });
  return toFuelPriceDto(row);
}

/**
 * UC-17. Amends a fuel price record.
 */
export async function updateFuelPrice(
  deps: AppDeps,
  id: string,
  input: FuelPriceInput,
): Promise<FuelPriceDto> {
  const existing = await deps.prisma.fuelPrice.findUnique({ where: { id } });
  if (!existing) throw notFound('Fuel price record');
  const row = await deps.prisma.fuelPrice.update({
    where: { id },
    data: {
      brand: input.brand,
      fuelType: input.fuelType,
      price: String(input.price),
      recordedAt: new Date(),
    },
  });
  return toFuelPriceDto(row);
}

/**
 * UC-17. Withdraws a fuel price: kept for saved estimates, no longer used for new ones (FR-ADM-03).
 */
export async function withdrawFuelPrice(deps: AppDeps, id: string): Promise<FuelPriceDto> {
  const existing = await deps.prisma.fuelPrice.findUnique({ where: { id } });
  if (!existing) throw notFound('Fuel price record');
  return toFuelPriceDto(
    await deps.prisma.fuelPrice.update({ where: { id }, data: { isWithdrawn: true } }),
  );
}

export async function listChargePoints(deps: AppDeps): Promise<ChargePointDto[]> {
  const rows = await deps.prisma.chargePoint.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toChargePointDto);
}

export async function listErpRates(deps: AppDeps): Promise<ErpRateDto[]> {
  const rows = await deps.prisma.erpRate.findMany({
    include: { chargePoint: true },
    orderBy: [
      { isWithdrawn: 'asc' },
      { chargePoint: { name: 'asc' } },
      { dayType: 'asc' },
      { vehicleClass: 'asc' },
      { startTime: 'asc' },
    ],
  });
  return rows.map(toErpRateDto);
}

async function assertNoOverlap(
  deps: AppDeps,
  input: ErpRateInput,
  excludeId?: string,
): Promise<void> {
  const siblings = await deps.prisma.erpRate.findMany({
    where: {
      chargePointId: input.chargePointId,
      vehicleClass: input.vehicleClass,
      dayType: input.dayType,
      effectiveDate: sgDayStart(input.effectiveDate),
      isWithdrawn: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  const clash = siblings.find((s) => periodsOverlap(s, input));
  if (clash) {
    throw new HttpError(
      409,
      'OVERLAPPING_PERIOD',
      `This period overlaps the existing ${clash.startTime} to ${clash.endTime} record for the same charge point, vehicle class, day type and effective date`,
      { startTime: 'Overlaps an existing period', endTime: 'Overlaps an existing period' },
    );
  }
}

/**
 * UC-18. Adds an ERP rate after checking that no period overlaps for the same charge point,
 * vehicle class, day type and effective date (FR-ADM-04, FR-ADM-05).
 */
export async function createErpRate(deps: AppDeps, input: ErpRateInput): Promise<ErpRateDto> {
  const chargePoint = await deps.prisma.chargePoint.findUnique({
    where: { id: input.chargePointId },
  });
  if (!chargePoint) {
    throw new HttpError(400, 'VALIDATION', 'Check the highlighted fields', {
      chargePointId: 'Choose a charge point from the list',
    });
  }
  await assertNoOverlap(deps, input);
  const row = await deps.prisma.erpRate.create({
    data: {
      chargePointId: input.chargePointId,
      vehicleClass: input.vehicleClass,
      dayType: input.dayType,
      startTime: input.startTime,
      endTime: input.endTime,
      rate: String(input.rate),
      effectiveDate: sgDayStart(input.effectiveDate),
    },
    include: { chargePoint: true },
  });
  return toErpRateDto(row);
}

/**
 * UC-18. Amends an ERP rate with the same overlap check.
 */
export async function updateErpRate(
  deps: AppDeps,
  id: string,
  input: ErpRateInput,
): Promise<ErpRateDto> {
  const existing = await deps.prisma.erpRate.findUnique({ where: { id } });
  if (!existing) throw notFound('ERP rate record');
  await assertNoOverlap(deps, input, id);
  const row = await deps.prisma.erpRate.update({
    where: { id },
    data: {
      chargePointId: input.chargePointId,
      vehicleClass: input.vehicleClass,
      dayType: input.dayType,
      startTime: input.startTime,
      endTime: input.endTime,
      rate: String(input.rate),
      effectiveDate: sgDayStart(input.effectiveDate),
      recordedAt: new Date(),
    },
    include: { chargePoint: true },
  });
  return toErpRateDto(row);
}

/**
 * UC-18. Withdraws an ERP rate while keeping it for saved estimates.
 */
export async function withdrawErpRate(deps: AppDeps, id: string): Promise<ErpRateDto> {
  const existing = await deps.prisma.erpRate.findUnique({ where: { id } });
  if (!existing) throw notFound('ERP rate record');
  const row = await deps.prisma.erpRate.update({
    where: { id },
    data: { isWithdrawn: true },
    include: { chargePoint: true },
  });
  return toErpRateDto(row);
}

export async function listEfficiencyRecords(deps: AppDeps): Promise<EfficiencyRecordDto[]> {
  const rows = await deps.prisma.vehicleEfficiencyRecord.findMany({
    orderBy: [{ make: 'asc' }, { model: 'asc' }],
  });
  return rows.map(toEfficiencyDto);
}

async function findDuplicate(deps: AppDeps, make: string, model: string, excludeId?: string) {
  const rows = await deps.prisma.vehicleEfficiencyRecord.findMany();
  return rows.find(
    (r) =>
      r.id !== excludeId &&
      r.make.toLowerCase() === make.toLowerCase() &&
      r.model.toLowerCase() === model.toLowerCase(),
  );
}

/**
 * UC-19. Adds a make-and-model consumption rate; a duplicate is refused in favour of amending (FR-ADM-08).
 */
export async function createEfficiencyRecord(
  deps: AppDeps,
  input: EfficiencyRecordInput,
): Promise<EfficiencyRecordDto> {
  const duplicate = await findDuplicate(deps, input.make, input.model);
  if (duplicate) {
    throw new HttpError(
      409,
      'DUPLICATE_RECORD',
      `A record for ${duplicate.make} ${duplicate.model} already exists (${duplicate.consumptionRate.toString()} L/100 km). Amend that record instead.`,
      { model: `Already exists; amend record ${duplicate.id}` },
    );
  }
  const row = await deps.prisma.vehicleEfficiencyRecord.create({ data: efficiencyData(input) });
  return toEfficiencyDto(row);
}

/**
 * UC-19. Amends an efficiency record. Existing vehicle profiles are never changed (FR-ADM-09).
 */
export async function updateEfficiencyRecord(
  deps: AppDeps,
  id: string,
  input: EfficiencyRecordInput,
): Promise<EfficiencyRecordDto> {
  const existing = await deps.prisma.vehicleEfficiencyRecord.findUnique({ where: { id } });
  if (!existing) throw notFound('Vehicle efficiency record');
  const duplicate = await findDuplicate(deps, input.make, input.model, id);
  if (duplicate) {
    throw new HttpError(
      409,
      'DUPLICATE_RECORD',
      `A record for ${duplicate.make} ${duplicate.model} already exists`,
      {
        model: 'Already exists on another record',
      },
    );
  }
  const row = await deps.prisma.vehicleEfficiencyRecord.update({
    where: { id },
    data: efficiencyData(input),
  });
  return toEfficiencyDto(row);
}

function efficiencyData(input: EfficiencyRecordInput) {
  return {
    make: input.make,
    model: input.model,
    consumptionRate: String(input.consumptionRate),
    tankCapacity: input.tankCapacity === undefined ? null : String(input.tankCapacity),
    fuelType: input.fuelType ?? null,
    source: input.source ?? null,
    vehicleClass: input.vehicleClass ?? 'PASSENGER_CAR_LGV_TAXI',
  };
}

/**
 * UC-19. Deletes an efficiency record. Existing vehicle profiles keep their own rate.
 */
export async function deleteEfficiencyRecord(deps: AppDeps, id: string): Promise<void> {
  const existing = await deps.prisma.vehicleEfficiencyRecord.findUnique({ where: { id } });
  if (!existing) throw notFound('Vehicle efficiency record');
  await deps.prisma.vehicleEfficiencyRecord.delete({ where: { id } });
}
