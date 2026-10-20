import type {
  AdminOverviewDto,
  ChargePointDto,
  CompareDto,
  EfficiencyDefaultDto,
  EfficiencyRecordDto,
  ErpRateDto,
  FuelPriceDto,
  HealthDto,
  HistoryDto,
  LocationDto,
  OptimiseDto,
  TripConditionsDto,
  TripDto,
  UserDto,
  VehicleDto,
  VehicleModelDto,
} from '@tolltally/shared';
import { http } from './client';

type Body = Record<string, unknown>;

export interface PlanTripResult {
  trip: TripDto;
  estimateError: { message: string; retryable: boolean } | null;
}

export const authApi = {
  register: (body: Body) => http.post<{ user: UserDto }>('/api/auth/register', body),
  login: (body: Body) => http.post<{ user: UserDto }>('/api/auth/login', body),
  logout: () => http.post<void>('/api/auth/logout'),
  me: () => http.get<{ user: UserDto }>('/api/auth/me'),
  forgotPassword: (email: string) =>
    http.post<{ ok: true }>('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    http.post<{ ok: true }>('/api/auth/reset-password', { token, password }),
  deleteAccount: (password: string) => http.delete<void>('/api/auth/account', { password }),
};

export const healthApi = { get: () => http.get<HealthDto>('/api/health?app=1') };

export const vehiclesApi = {
  list: (includeArchived = false) =>
    http.get<{ vehicles: VehicleDto[] }>(
      `/api/vehicles${includeArchived ? '?includeArchived=1' : ''}`,
    ),
  get: (id: string) => http.get<{ vehicle: VehicleDto }>(`/api/vehicles/${id}`),
  create: (body: Body) => http.post<{ vehicle: VehicleDto }>('/api/vehicles', body),
  update: (id: string, body: Body) =>
    http.put<{ vehicle: VehicleDto }>(`/api/vehicles/${id}`, body),
  remove: (id: string) => http.delete<void>(`/api/vehicles/${id}`),
  archive: (id: string) => http.post<{ vehicle: VehicleDto }>(`/api/vehicles/${id}/archive`),
  unarchive: (id: string) => http.post<{ vehicle: VehicleDto }>(`/api/vehicles/${id}/unarchive`),
};

export const referenceApi = {
  efficiency: (make: string, model: string) =>
    http.get<EfficiencyDefaultDto>(
      `/api/reference/efficiency?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
    ),
  vehicleModels: () => http.get<{ models: VehicleModelDto[] }>('/api/reference/vehicle-models'),
};

export const locationsApi = {
  search: (q: string) =>
    http.get<{ results: LocationDto[] }>(`/api/locations/search?q=${encodeURIComponent(q)}`),
};

/**
 * Typed calls for trips, estimates, comparison, optimisation, top-up, save and log.
 */
export const tripsApi = {
  plan: (body: Body) => http.post<PlanTripResult>('/api/trips', body),
  get: (id: string) => http.get<{ trip: TripDto }>(`/api/trips/${id}`),
  estimate: (id: string) => http.post<{ trip: TripDto }>(`/api/trips/${id}/estimate`),
  conditions: (id: string) =>
    http.get<{ conditions: TripConditionsDto }>(`/api/trips/${id}/conditions`),
  compareRoutes: (id: string) => http.post<CompareDto>(`/api/trips/${id}/compare-routes`),
  chooseRoute: (id: string, optionId: string) =>
    http.post<{ trip: TripDto }>(`/api/trips/${id}/choose-route`, { optionId }),
  optimiseDeparture: (id: string) => http.post<OptimiseDto>(`/api/trips/${id}/optimise-departure`),
  applyDeparture: (id: string, departureTime: string) =>
    http.post<{ trip: TripDto }>(`/api/trips/${id}/apply-departure`, { departureTime }),
  topUp: (id: string, body: Body) =>
    http.post<{ trip: TripDto }>(`/api/trips/${id}/top-up-plan`, body),
  save: (id: string) => http.post<{ trip: TripDto }>(`/api/trips/${id}/save`),
  log: (id: string, body: Body) => http.put<{ trip: TripDto }>(`/api/trips/${id}/log`, body),
};

export const historyApi = {
  list: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return http.get<HistoryDto>(`/api/history${qs ? `?${qs}` : ''}`);
  },
};

/**
 * Typed calls for the administrator's reference-data screens (UC-17 to UC-19).
 */
export const adminApi = {
  overview: () => http.get<{ overview: AdminOverviewDto }>('/api/admin/overview'),
  healthCheck: () => http.post<{ overview: AdminOverviewDto }>('/api/admin/health-check'),
  fuelPrices: () => http.get<{ fuelPrices: FuelPriceDto[] }>('/api/admin/fuel-prices'),
  createFuelPrice: (body: Body) =>
    http.post<{ fuelPrice: FuelPriceDto }>('/api/admin/fuel-prices', body),
  updateFuelPrice: (id: string, body: Body) =>
    http.put<{ fuelPrice: FuelPriceDto }>(`/api/admin/fuel-prices/${id}`, body),
  withdrawFuelPrice: (id: string) =>
    http.post<{ fuelPrice: FuelPriceDto }>(`/api/admin/fuel-prices/${id}/withdraw`),
  chargePoints: () => http.get<{ chargePoints: ChargePointDto[] }>('/api/admin/charge-points'),
  erpRates: () => http.get<{ erpRates: ErpRateDto[] }>('/api/admin/erp-rates'),
  createErpRate: (body: Body) => http.post<{ erpRate: ErpRateDto }>('/api/admin/erp-rates', body),
  updateErpRate: (id: string, body: Body) =>
    http.put<{ erpRate: ErpRateDto }>(`/api/admin/erp-rates/${id}`, body),
  withdrawErpRate: (id: string) =>
    http.post<{ erpRate: ErpRateDto }>(`/api/admin/erp-rates/${id}/withdraw`),
  efficiencyRecords: () =>
    http.get<{ records: EfficiencyRecordDto[] }>('/api/admin/efficiency-records'),
  createEfficiencyRecord: (body: Body) =>
    http.post<{ record: EfficiencyRecordDto }>('/api/admin/efficiency-records', body),
  updateEfficiencyRecord: (id: string, body: Body) =>
    http.put<{ record: EfficiencyRecordDto }>(`/api/admin/efficiency-records/${id}`, body),
  deleteEfficiencyRecord: (id: string) => http.delete<void>(`/api/admin/efficiency-records/${id}`),
};
