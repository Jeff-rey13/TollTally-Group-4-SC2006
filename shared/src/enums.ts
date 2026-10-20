export const ROLES = ['DRIVER', 'ADMINISTRATOR'] as const;
export type Role = (typeof ROLES)[number];

export const OWNERSHIP_TYPES = ['OWNED', 'RENTED'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const FUEL_TYPES = ['PETROL_92', 'PETROL_95', 'PETROL_98', 'DIESEL'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const VEHICLE_CLASSES = [
  'PASSENGER_CAR_LGV_TAXI',
  'MOTORCYCLE',
  'HGV_SMALL_BUS',
  'VHGV_BIG_BUS',
] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export const DAY_TYPES = ['WEEKDAY', 'SATURDAY', 'SUNDAY_PUBLIC_HOLIDAY'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const TRIP_STATUSES = ['PLANNED', 'ESTIMATED', 'SAVED', 'COMPLETED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const COMPONENT_TYPES = ['FUEL', 'ROAD_USAGE', 'PARKING'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const FUEL_LEVEL_UNITS = ['LITRES', 'TANK_FRACTION', 'PERCENT'] as const;
export type FuelLevelUnit = (typeof FUEL_LEVEL_UNITS)[number];

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  PETROL_92: 'Petrol 92',
  PETROL_95: 'Petrol 95',
  PETROL_98: 'Petrol 98',
  DIESEL: 'Diesel',
};

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  PASSENGER_CAR_LGV_TAXI: 'Passenger car, light goods vehicle or taxi',
  MOTORCYCLE: 'Motorcycle',
  HGV_SMALL_BUS: 'Heavy goods vehicle or small bus',
  VHGV_BIG_BUS: 'Very heavy goods vehicle or big bus',
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WEEKDAY: 'Weekday',
  SATURDAY: 'Saturday',
  SUNDAY_PUBLIC_HOLIDAY: 'Sunday or public holiday',
};

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  FUEL: 'Fuel',
  ROAD_USAGE: 'Road usage (ERP)',
  PARKING: 'Parking',
};

export const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  OWNED: 'Owned',
  RENTED: 'Rented',
};

export const FUEL_LEVEL_UNIT_LABELS: Record<FuelLevelUnit, string> = {
  LITRES: 'Litres',
  TANK_FRACTION: 'Fraction of tank (0 to 1)',
  PERCENT: 'Percent of tank',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: 'Planned',
  ESTIMATED: 'Estimated',
  SAVED: 'Saved',
  COMPLETED: 'Completed',
};
