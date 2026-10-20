ALTER TABLE "Trip" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "vehicleSnapshot" TEXT;
ALTER TABLE "CostEstimate" ADD COLUMN "pricingPolicy" TEXT;
ALTER TABLE "ChargePointCrossing" ADD COLUMN "chargePointName" TEXT;
ALTER TABLE "ChargePointCrossing" ADD COLUMN "ratePeriod" TEXT;
ALTER TABLE "FuelTopUpPlan" ADD COLUMN "sourceSnapshot" TEXT;

-- Preserve the reference details still available for existing records.
UPDATE "ChargePointCrossing" SET "chargePointName" = (
  SELECT "name" FROM "ChargePoint" WHERE "id" = "ChargePointCrossing"."chargePointId"
), "ratePeriod" = (
  SELECT "startTime" || ' to ' || "endTime" FROM "ErpRate" WHERE "id" = "ChargePointCrossing"."erpRateId"
);

UPDATE "Trip" SET "vehicleSnapshot" = (
  SELECT json_object('id', "id", 'displayName', "displayName", 'make', "make", 'model', "model",
    'ownershipType', "ownershipType", 'fuelType', "fuelType", 'vehicleClass', "vehicleClass",
    'consumptionRate', CAST("consumptionRate" AS TEXT), 'tankCapacity', CAST("tankCapacity" AS TEXT),
    'isArchived', json(CASE WHEN "isArchived" THEN 'true' ELSE 'false' END),
    'createdAt', strftime('%Y-%m-%dT%H:%M:%fZ', "createdAt" / 1000.0, 'unixepoch'))
  FROM "VehicleProfile" WHERE "id" = "Trip"."vehicleProfileId"
);

UPDATE "FuelTopUpPlan" SET "sourceSnapshot" = (
  SELECT json_object('tankCapacity', CAST(v."tankCapacity" AS TEXT), 'price', CAST(f."price" AS TEXT),
    'name', f."brand" || ' fuel price',
    'recordedAt', strftime('%Y-%m-%dT%H:%M:%fZ', f."recordedAt" / 1000.0, 'unixepoch'))
  FROM "Trip" t JOIN "VehicleProfile" v ON v."id" = t."vehicleProfileId"
  JOIN "FuelPrice" f ON f."id" = "FuelTopUpPlan"."fuelPriceId"
  WHERE t."id" = "FuelTopUpPlan"."tripId"
);
