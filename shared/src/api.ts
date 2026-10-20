import type {
  ComponentType,
  DayType,
  FuelLevelUnit,
  FuelType,
  OwnershipType,
  Role,
  TripStatus,
  VehicleClass,
} from './enums';

export type MoneyString = string;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    retryable?: boolean;
  };
}

export interface UserDto {
  id: string;
  email: string;
  role: Role;
}

export interface VehicleDto {
  id: string;
  displayName: string;
  make: string | null;
  model: string | null;
  ownershipType: OwnershipType;
  fuelType: FuelType;
  vehicleClass: VehicleClass;
  consumptionRate: string;
  tankCapacity: string;
  isArchived: boolean;
  createdAt: string;
}

export interface EfficiencyDefaultDto {
  found: boolean;
  make: string;
  model: string;
  consumptionRate: string | null;
  tankCapacity?: string | null;
  fuelType?: FuelType | null;
  source?: string | null;
}

/** One make and model the vehicle picker offers, with the published figures behind it. */
export interface VehicleModelDto {
  make: string;
  model: string;
  consumptionRate: string;
  tankCapacity: string | null;
  fuelType: FuelType | null;
  source: string | null;
  /** MOTORCYCLE for bikes; cars use the passenger car class. */
  vehicleClass: VehicleClass;
}

export interface LocationDto {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface LocationRef {
  name: string;
  lat: number;
  lng: number;
}

export interface CrossingDto {
  chargePointId: string;
  rateId: string | null;
  adjacentRateId: string | null;
  chargePointName: string;
  lat?: number;
  lng?: number;
  estimatedCrossingTime: string;
  dayType: DayType;
  ratePeriod: string | null;
  charge: MoneyString | null;
  lowerBound: MoneyString | null;
  upperBound: MoneyString | null;
  nearPeriodBoundary: boolean;
  isExcluded: boolean;
  exclusionReason: string | null;
}

export interface ComponentDto {
  type: ComponentType;
  isReturnLeg: boolean;
  amount: MoneyString | null;
  lowerBound: MoneyString | null;
  upperBound: MoneyString | null;
  isAvailable: boolean;
  unavailableReason: string | null;
  exclusions: string[];
  source: {
    recordId: string | null;
    name: string | null;
    recordedAt: string | null;
    isStale: boolean;
  };
  detail: Record<string, string | number | null>;
  crossings: CrossingDto[];
}

export interface LegDto {
  isReturnLeg: boolean;
  departureTime: string;
  distanceKm: string;
  drivingTimeSec: number;
  provider: string;
  geometry: { lat: number; lng: number }[];
  components: ComponentDto[];
  subtotal: MoneyString;
  subtotalIsLowerBound: boolean;
}

export interface TimingDto {
  durationMs: number;
  budgetMs: number;
  withinBudget: boolean;
}

export interface EstimateDto {
  calculatedAt: string;
  timing: TimingDto;
  total: MoneyString;
  totalIsLowerBound: boolean;
  lowerBound: MoneyString;
  upperBound: MoneyString | null;
  legs: LegDto[];
  assumptions: string[];
  unavailable: { type: ComponentType; isReturnLeg: boolean; reason: string }[];
  exclusions: string[];
  rangeBasis: string[];
}

export type VarianceStatus = 'OK' | 'NOT_LOGGED' | 'NOT_APPLICABLE';

export interface VarianceDto {
  absolute: MoneyString;
  percent: string | null;
}

export interface LogComponentDto {
  type: ComponentType;
  actual: MoneyString | null;
  estimated: MoneyString | null;
  status: VarianceStatus;
  variance: VarianceDto | null;
}

export interface TripLogDto {
  loggedAt: string;
  actualTotal: MoneyString;
  components: LogComponentDto[];
  totalVariance: VarianceDto | null;
  totalVarianceBasis: string;
}

export interface TopUpPlanDto {
  createdAt: string;
  unit: FuelLevelUnit;
  tankCapacityL: string;
  pickUp: { litres: string; inUnit: string };
  requiredReturn: { litres: string; inUnit: string };
  tripFuel: { litres: string; inUnit: string };
  projectedReturn: { litres: string; inUnit: string };
  shortfall: { litres: string; inUnit: string };
  topUp: { litres: string; inUnit: string };
  estimatedCost: MoneyString;
  pricePerLitre: MoneyString;
  fuelPriceSource: { name: string; recordedAt: string };
  outcome: 'TOP_UP' | 'NONE_NEEDED' | 'REFUEL_EN_ROUTE';
  message: string;
}

export interface TripDto {
  id: string;
  status: TripStatus;
  origin: LocationRef;
  destination: LocationRef;
  departureTime: string;
  isReturnTrip: boolean;
  returnDepartureTime: string | null;
  parkingDurationMin: number;
  parkingDurationAssumed: boolean;
  vehicle: VehicleDto;
  savedAt: string | null;
  createdAt: string;
  estimate: EstimateDto | null;
  log: TripLogDto | null;
  topUpPlan: TopUpPlanDto | null;
}

export interface RouteOptionDto {
  id: string;
  label: string;
  distanceKm: string;
  drivingTimeSec: number;
  provider: string;
  total: MoneyString;
  lowerBound: MoneyString;
  upperBound: MoneyString | null;
  isComplete: boolean;
  exclusionReason: string | null;
  components: { type: ComponentType; amount: MoneyString | null }[];
  isCheapest: boolean;
  isIndistinguishable: boolean;
}

export interface CompareDto {
  options: RouteOptionDto[];
  cheapestOptionId: string | null;
  indistinguishable: boolean;
  noAlternatives: boolean;
  message: string;
  timing: TimingDto;
}

export interface SlotDto {
  time: string;
  total: MoneyString;
  lowerBound: MoneyString;
  upperBound: MoneyString | null;
  isComplete: boolean;
  isPlanned: boolean;
  isRecommended: boolean;
}

export interface OptimiseDto {
  slots: SlotDto[];
  recommendedTime: string | null;
  saving: MoneyString | null;
  withinMargin: boolean;
  plannedIsCheapest: boolean;
  allIdentical: boolean;
  message: string;
}

export interface HistoryItemDto {
  id: string;
  status: TripStatus;
  departureTime: string;
  origin: string;
  destination: string;
  vehicleName: string;
  estimatedTotal: MoneyString;
  totalIsLowerBound: boolean;
  log: {
    actualTotal: MoneyString;
    varianceAbsolute: MoneyString | null;
    variancePercent: string | null;
  } | null;
}

export interface SpendReportDto {
  from: string | null;
  to: string | null;
  tripCount: number;
  loggedCount: number;
  actualSpend: MoneyString;
  varianceTotal: MoneyString | null;
}

export interface HistoryDto {
  trips: HistoryItemDto[];
  report: SpendReportDto | null;
  message: string | null;
}

export interface FuelPriceDto {
  id: string;
  brand: string;
  fuelType: FuelType;
  price: MoneyString;
  recordedAt: string;
  isWithdrawn: boolean;
}

export interface ChargePointDto {
  id: string;
  code: string;
  name: string;
  zoneId: string;
  lat: number;
  lng: number;
  headingDeg: number;
  isActive: boolean;
}

export interface ErpRateDto {
  id: string;
  chargePointId: string;
  chargePointName: string;
  vehicleClass: VehicleClass;
  dayType: DayType;
  startTime: string;
  endTime: string;
  rate: MoneyString;
  effectiveDate: string;
  recordedAt: string;
  isWithdrawn: boolean;
}

export interface EfficiencyRecordDto {
  id: string;
  make: string;
  model: string;
  consumptionRate: string;
  tankCapacity: string | null;
  fuelType: FuelType | null;
  source: string | null;
  vehicleClass: VehicleClass;
  updatedAt: string;
}

export interface HealthDto {
  ok: boolean;
  routingProvider: string;
  parkingProvider: string;
  /** False when live routing is selected but its login is missing, so estimates will fail. */
  routingReady: boolean;
  /** False when password reset emails are only written to the server log. */
  mailReady: boolean;
  /** Where traffic incidents come from, or null when the feature is off. */
  trafficProvider: string | null;
  /** Where weather forecasts come from, or null when the feature is off. */
  weatherProvider: string | null;
  time: string;
}

/** Status of one check on the administrator's overview. "off" means deliberately not set up. */
export type HealthStatus = 'ok' | 'warning' | 'down' | 'off';

export interface HealthCheckDto {
  key:
    | 'server'
    | 'database'
    | 'routing'
    | 'mail'
    | 'traffic'
    | 'weather'
    | 'erp'
    | 'fuel'
    | 'holidays';
  label: string;
  status: HealthStatus;
  /** One plain sentence on what the status means. */
  detail: string;
  /** Response time of the last call or query, when there was one. */
  latencyMs: number | null;
  /** When this was last confirmed working or failing, if known. */
  checkedAt: string | null;
}

export interface DayCountDto {
  /** YYYY-MM-DD, Singapore time */
  date: string;
  count: number;
}

export interface TrafficHourDto {
  /** Start of the hour, ISO 8601 */
  hour: string;
  requests: number;
  appOpens: number;
  errors: number;
}

export interface TrafficDayDto {
  date: string;
  requests: number;
  appOpens: number;
  errors: number;
}

export interface EndpointTrafficDto {
  endpoint: string;
  requests: number;
  errors: number;
  avgMs: number;
  maxMs: number;
}

export interface AdminOverviewDto {
  generatedAt: string;
  users: {
    drivers: number;
    administrators: number;
    newLast7Days: number;
    newLast30Days: number;
    /** Distinct accounts with an unexpired session. */
    signedInNow: number;
    /** Drivers who planned at least one trip in the last 7 days. */
    activeLast7Days: number;
    registrationsByDay: DayCountDto[];
  };
  usage: {
    vehicles: number;
    trips: number;
    tripsLast24Hours: number;
    tripsLast7Days: number;
    loggedTrips: number;
    tripsByDay: DayCountDto[];
  };
  traffic: {
    /** When counting started for this database, or null if nothing is recorded yet. */
    since: string | null;
    last24Hours: {
      requests: number;
      appOpens: number;
      clientErrors: number;
      serverErrors: number;
      rateLimited: number;
      avgMs: number;
    };
    byHour: TrafficHourDto[];
    byDay: TrafficDayDto[];
    topEndpoints: EndpointTrafficDto[];
  };
  health: {
    overall: HealthStatus;
    checks: HealthCheckDto[];
    server: {
      startedAt: string;
      uptimeSec: number;
      memoryMb: number;
      nodeVersion: string;
      environment: string;
      routingProvider: string;
    };
  };
}

/**
 * "shown": the information is current for this trip. "too-far-ahead": the trip leaves later than
 * the information covers. "past": the trip has already ended. "unavailable": the outside service
 * did not answer. "off": the feature is not set up on this server.
 */
export type ConditionStatus = 'shown' | 'too-far-ahead' | 'past' | 'unavailable' | 'off';

export interface RouteIncidentDto {
  /** LTA's incident type, for example "Accident" or "Roadwork". */
  type: string;
  message: string;
  lat: number;
  lng: number;
  /** Distance along the route from the start, in kilometres, to 1 decimal place. */
  alongKm: string;
  distanceFromRouteM: number;
}

export interface PlaceForecastDto {
  /** Which point of the trip this forecast is for. */
  point: 'start' | 'destination' | 'return';
  placeName: string;
  /** The time the Driver is expected at that point. */
  at: string;
  /** The forecast area (a town for the 2-hour forecast, a region for the 24-hour one). */
  area: string;
  forecast: string;
  /** The period the forecast covers, as the provider words it. */
  period: string;
  rain: boolean;
  basis: '2-hour' | '24-hour';
}

/**
 * Live road and weather information for a planned trip (FR-EST-17, FR-EST-18). It is fetched when
 * the estimate is viewed and never stored, so it does not change the estimate or a saved trip.
 */
export interface TripConditionsDto {
  checkedAt: string;
  incidents: {
    status: ConditionStatus;
    source: string | null;
    message: string;
    items: RouteIncidentDto[];
  };
  weather: {
    status: ConditionStatus;
    source: string | null;
    message: string;
    rainLikely: boolean;
    forecasts: PlaceForecastDto[];
  };
}
