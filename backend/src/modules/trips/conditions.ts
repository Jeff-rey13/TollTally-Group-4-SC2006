import type {
  ConditionStatus,
  PlaceForecastDto,
  RouteIncidentDto,
  TripConditionsDto,
} from '@tolltally/shared';
import type { DailyForecast, TwoHourForecast } from '../../adapters/conditions';
import { incidentsNearRoute, isRain, nearestArea, regionOf } from '../../domain/conditions';
import type { LatLng } from '../../domain/types';
import type { AppDeps } from '../../deps';
import { decodePolyline } from '../../lib/polyline';
import { loadTrip } from './service';

const MINUTE = 60 * 1000;
const REGION_LABEL = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  central: 'Central',
} as const;

interface Point {
  point: PlaceForecastDto['point'];
  placeName: string;
  place: LatLng;
  at: Date;
}

/**
 * The incident part (FR-EST-17). Incidents are only shown for a trip leaving within the next
 * INCIDENT_WINDOW_MIN minutes, or already under way, because they are cleared within hours.
 */
async function incidentPart(
  deps: AppDeps,
  route: LatLng[],
  departure: Date,
  arrival: Date,
  now: Date,
): Promise<TripConditionsDto['incidents']> {
  const service = deps.traffic;
  const windowMin = deps.config.INCIDENT_WINDOW_MIN;
  const empty = (status: ConditionStatus, message: string) => ({
    status,
    source: service?.name ?? null,
    message,
    items: [],
  });
  if (!service) return empty('off', 'Live traffic incidents are not set up on this server.');
  if (arrival.getTime() < now.getTime())
    return empty('past', 'This trip has already ended, so current incidents are not shown.');
  if (departure.getTime() - now.getTime() > windowMin * MINUTE) {
    return empty(
      'too-far-ahead',
      `Incidents are shown for trips leaving within the next ${windowMin} minutes. Open this estimate again closer to the time.`,
    );
  }
  if (route.length < 2) return empty('unavailable', 'There is no route for this trip yet.');
  let all;
  try {
    all = await service.incidents();
  } catch {
    return empty(
      'unavailable',
      'Traffic incidents could not be loaded just now. The cost estimate is not affected.',
    );
  }
  const near = incidentsNearRoute(route, all, deps.config.INCIDENT_DISTANCE_M);
  const items: RouteIncidentDto[] = near.map((i) => ({
    type: i.type,
    message: i.message,
    lat: i.lat,
    lng: i.lng,
    alongKm: i.alongKm.toFixed(1),
    distanceFromRouteM: i.distanceFromRouteM,
  }));
  return {
    status: 'shown',
    source: service.name,
    message: items.length
      ? `${items.length} incident${items.length === 1 ? '' : 's'} reported on or next to your route.`
      : 'No incidents are reported on your route right now.',
    items,
  };
}

function fromTwoHour(p: Point, f: TwoHourForecast): PlaceForecastDto | null {
  if (p.at < f.validFrom || p.at >= f.validTo) return null;
  const area = nearestArea(p.place, f.areas);
  if (!area) return null;
  return {
    point: p.point,
    placeName: p.placeName,
    at: p.at.toISOString(),
    area: area.name,
    forecast: area.forecast,
    period: f.periodText,
    rain: isRain(area.forecast),
    basis: '2-hour',
  };
}

function fromDaily(p: Point, f: DailyForecast): PlaceForecastDto | null {
  const period = f.periods.find((x) => p.at >= x.from && p.at < x.to);
  if (!period) return null;
  const region = regionOf(p.place);
  const forecast = period.regions[region];
  return {
    point: p.point,
    placeName: p.placeName,
    at: p.at.toISOString(),
    area: `${REGION_LABEL[region]} region`,
    forecast,
    period: period.text,
    rain: isRain(forecast),
    basis: '24-hour',
  };
}

/**
 * The weather part (FR-EST-18): the 2-hour town forecast when the Driver is at a point within its
 * period, otherwise the 24-hour regional forecast, otherwise nothing for that point.
 */
async function weatherPart(
  deps: AppDeps,
  points: Point[],
  now: Date,
): Promise<TripConditionsDto['weather']> {
  const service = deps.weather;
  const empty = (status: ConditionStatus, message: string) => ({
    status,
    source: service?.name ?? null,
    message,
    rainLikely: false,
    forecasts: [],
  });
  if (!service) return empty('off', 'Weather forecasts are not set up on this server.');
  const upcoming = points.filter((p) => p.at.getTime() >= now.getTime() - 30 * MINUTE);
  if (!upcoming.length)
    return empty('past', 'This trip has already ended, so no forecast is shown.');

  const [twoHour, daily] = await Promise.allSettled([service.twoHour(), service.daily()]);
  if (twoHour.status === 'rejected' && daily.status === 'rejected') {
    return empty('unavailable', 'The weather forecast could not be loaded just now.');
  }
  const forecasts: PlaceForecastDto[] = [];
  for (const p of upcoming) {
    const f =
      (twoHour.status === 'fulfilled' ? fromTwoHour(p, twoHour.value) : null) ??
      (daily.status === 'fulfilled' ? fromDaily(p, daily.value) : null);
    if (f) forecasts.push(f);
  }
  if (!forecasts.length) {
    return empty(
      'too-far-ahead',
      'Forecasts cover about the next 24 hours. Open this estimate again closer to the day.',
    );
  }
  const rainLikely = forecasts.some((f) => f.rain);
  return {
    status: 'shown',
    source: service.name,
    message: rainLikely
      ? 'Rain is forecast for part of this trip.'
      : 'No rain is forecast for this trip.',
    rainLikely,
    forecasts,
  };
}

/**
 * Builds the live road and weather information for one of the Driver's trips. Nothing about the
 * trip is sent to the providers: the server fetches the whole incident list and forecast and
 * matches them to the route itself.
 */
export async function tripConditions(
  deps: AppDeps,
  tripId: string,
  userId: string,
  now = new Date(),
): Promise<TripConditionsDto> {
  const trip = await loadTrip(deps, tripId, userId);
  const outbound = trip.routes.find((r) => !r.isReturnLeg);
  const route = outbound ? decodePolyline(outbound.geometry) : [];
  const departure = trip.departureTime;
  const arrival = new Date(departure.getTime() + (outbound?.drivingTimeSec ?? 0) * 1000);
  const origin = { lat: trip.originLat, lng: trip.originLng };
  const destination = { lat: trip.destinationLat, lng: trip.destinationLng };
  const points: Point[] = [
    { point: 'start', placeName: trip.originName, place: origin, at: departure },
    { point: 'destination', placeName: trip.destinationName, place: destination, at: arrival },
  ];
  if (trip.isReturnTrip && trip.returnDepartureTime) {
    points.push({
      point: 'return',
      placeName: trip.destinationName,
      place: destination,
      at: trip.returnDepartureTime,
    });
  }
  const [incidents, weather] = await Promise.all([
    incidentPart(deps, route, departure, arrival, now),
    weatherPart(deps, points, now),
  ]);
  return { checkedAt: now.toISOString(), incidents, weather };
}
