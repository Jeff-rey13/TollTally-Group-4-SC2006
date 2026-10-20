-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DRIVER',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "ownershipType" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL DEFAULT 'PASSENGER_CAR_LGV_TAXI',
    "consumptionRate" DECIMAL NOT NULL,
    "tankCapacity" DECIMAL NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleProfile_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleEfficiencyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "consumptionRate" DECIMAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "vehicleProfileId" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "originLat" REAL NOT NULL,
    "originLng" REAL NOT NULL,
    "destinationName" TEXT NOT NULL,
    "destinationLat" REAL NOT NULL,
    "destinationLng" REAL NOT NULL,
    "departureTime" DATETIME NOT NULL,
    "isReturnTrip" BOOLEAN NOT NULL DEFAULT false,
    "returnDepartureTime" DATETIME,
    "parkingDurationMin" INTEGER NOT NULL,
    "parkingDurationAssumed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "savedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trip_vehicleProfileId_fkey" FOREIGN KEY ("vehicleProfileId") REFERENCES "VehicleProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "isReturnLeg" BOOLEAN NOT NULL DEFAULT false,
    "distanceKm" DECIMAL NOT NULL,
    "drivingTimeSec" INTEGER NOT NULL,
    "geometry" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    CONSTRAINT "Route_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "total" DECIMAL NOT NULL,
    "totalIsLowerBound" BOOLEAN NOT NULL,
    "lowerBound" DECIMAL NOT NULL,
    "upperBound" DECIMAL,
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEstimate_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isReturnLeg" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL,
    "lowerBound" DECIMAL,
    "upperBound" DECIMAL,
    "isAvailable" BOOLEAN NOT NULL,
    "unavailableReason" TEXT,
    "sourceName" TEXT,
    "sourceRecordedAt" DATETIME,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT,
    "fuelPriceId" TEXT,
    "parkingRateId" TEXT,
    CONSTRAINT "CostComponent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "CostEstimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostComponent_fuelPriceId_fkey" FOREIGN KEY ("fuelPriceId") REFERENCES "FuelPrice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostComponent_parkingRateId_fkey" FOREIGN KEY ("parkingRateId") REFERENCES "ParkingRate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChargePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "headingDeg" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ErpRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chargePointId" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "dayType" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ErpRate_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChargePointCrossing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "chargePointId" TEXT NOT NULL,
    "erpRateId" TEXT,
    "adjacentErpRateId" TEXT,
    "estimatedCrossingTime" DATETIME NOT NULL,
    "dayType" TEXT NOT NULL,
    "charge" DECIMAL,
    "lowerBound" DECIMAL,
    "upperBound" DECIMAL,
    "nearPeriodBoundary" BOOLEAN NOT NULL DEFAULT false,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusionReason" TEXT,
    CONSTRAINT "ChargePointCrossing_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "CostComponent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChargePointCrossing_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChargePointCrossing_erpRateId_fkey" FOREIGN KEY ("erpRateId") REFERENCES "ErpRate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChargePointCrossing_adjacentErpRateId_fkey" FOREIGN KEY ("adjacentErpRateId") REFERENCES "ErpRate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParkingRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "carparkName" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "ratePerPeriod" DECIMAL NOT NULL,
    "chargingPeriodMin" INTEGER NOT NULL,
    "roundingRule" TEXT NOT NULL DEFAULT 'CEIL',
    "source" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FuelPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isWithdrawn" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "FuelTopUpPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "fuelPriceId" TEXT NOT NULL,
    "pickUpLevel" DECIMAL NOT NULL,
    "requiredReturnLevel" DECIMAL NOT NULL,
    "levelUnit" TEXT NOT NULL,
    "pickUpVolume" DECIMAL NOT NULL,
    "requiredReturnVolume" DECIMAL NOT NULL,
    "tripFuelVolume" DECIMAL NOT NULL,
    "projectedReturnVolume" DECIMAL NOT NULL,
    "shortfall" DECIMAL NOT NULL,
    "topUpVolume" DECIMAL NOT NULL,
    "estimatedCost" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FuelTopUpPlan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuelTopUpPlan_fuelPriceId_fkey" FOREIGN KEY ("fuelPriceId") REFERENCES "FuelPrice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "actualFuelCost" DECIMAL,
    "actualRoadUsageCharge" DECIMAL,
    "actualParkingFee" DECIMAL,
    "actualTotal" DECIMAL NOT NULL,
    "varianceAbsolute" DECIMAL,
    "variancePercent" DECIMAL,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");

-- CreateIndex
CREATE INDEX "VehicleProfile_driverId_idx" ON "VehicleProfile"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleEfficiencyRecord_make_model_key" ON "VehicleEfficiencyRecord"("make", "model");

-- CreateIndex
CREATE INDEX "Trip_driverId_status_idx" ON "Trip"("driverId", "status");

-- CreateIndex
CREATE INDEX "Route_tripId_idx" ON "Route"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "CostEstimate_tripId_key" ON "CostEstimate"("tripId");

-- CreateIndex
CREATE INDEX "CostComponent_estimateId_idx" ON "CostComponent"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargePoint_code_key" ON "ChargePoint"("code");

-- CreateIndex
CREATE INDEX "ErpRate_chargePointId_vehicleClass_dayType_idx" ON "ErpRate"("chargePointId", "vehicleClass", "dayType");

-- CreateIndex
CREATE INDEX "ChargePointCrossing_componentId_idx" ON "ChargePointCrossing"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingRate_code_key" ON "ParkingRate"("code");

-- CreateIndex
CREATE INDEX "FuelPrice_fuelType_isWithdrawn_recordedAt_idx" ON "FuelPrice"("fuelType", "isWithdrawn", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelTopUpPlan_tripId_key" ON "FuelTopUpPlan"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripLog_tripId_key" ON "TripLog"("tripId");
