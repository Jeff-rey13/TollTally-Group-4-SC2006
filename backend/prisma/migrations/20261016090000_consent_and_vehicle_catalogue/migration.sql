-- AlterTable
ALTER TABLE "User" ADD COLUMN "privacyConsentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "privacyNoticeVersion" TEXT;

-- AlterTable
ALTER TABLE "VehicleEfficiencyRecord" ADD COLUMN "fuelType" TEXT;
ALTER TABLE "VehicleEfficiencyRecord" ADD COLUMN "source" TEXT;
ALTER TABLE "VehicleEfficiencyRecord" ADD COLUMN "tankCapacity" DECIMAL;
