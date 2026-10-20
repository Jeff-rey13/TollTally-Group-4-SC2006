-- Motorcycles: catalogue entries and parking rates are marked with the vehicle class they apply to
ALTER TABLE "VehicleEfficiencyRecord" ADD COLUMN "vehicleClass" TEXT NOT NULL DEFAULT 'PASSENGER_CAR_LGV_TAXI';
ALTER TABLE "ParkingRate" ADD COLUMN "vehicleClass" TEXT NOT NULL DEFAULT 'PASSENGER_CAR_LGV_TAXI';
