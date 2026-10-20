import chargePointFile from '../../../prisma/data/charge-points.json';
import type { TrafficIncident } from '../../domain/conditions';
import { offsetPoint } from '../../domain/geo';
import type {
  DailyForecast,
  TrafficIncidentService,
  TwoHourForecast,
  WeatherService,
} from './ConditionServices';

function gantry(code: string) {
  const cp = chargePointFile.chargePoints.find((c) => c.code === code);
  if (!cp) throw new Error(`demo data needs gantry ${code}`);
  return { lat: cp.lat, lng: cp.lng };
}

/**
 * Demo-mode incidents: one on the AYE near the Clementi gantries and one on the PIE near Eunos,
 * where the simulated routes run, plus one far away that no demo route passes.
 */
export class MockIncidentAdapter implements TrafficIncidentService {
  readonly name = 'demo data';

  constructor(private readonly mode: 'fixed' | 'failure' = 'fixed') {}

  async incidents(): Promise<TrafficIncident[]> {
    if (this.mode === 'failure') throw new Error('demo traffic service failure');
    const aye = offsetPoint(gantry('G74'), 315, 250);
    const pie = offsetPoint(gantry('G65'), 120, 150);
    return [
      {
        type: 'Accident',
        message: 'Accident on AYE (towards City) after Clementi Ave 6 Exit. Avoid lane 1.',
        ...aye,
      },
      {
        type: 'Vehicle breakdown',
        message: 'Vehicle breakdown on PIE (towards Tuas) at Eunos Link Exit.',
        ...pie,
      },
      {
        type: 'Roadwork',
        message: 'Roadworks on Woodlands Avenue 2 (towards Woodlands Avenue 3).',
        lat: 1.4366,
        lng: 103.7867,
      },
    ];
  }
}

const DEMO_AREAS: { name: string; lat: number; lng: number; forecast: string }[] = [
  { name: 'Jurong East', lat: 1.326, lng: 103.737, forecast: 'Partly Cloudy (Day)' },
  { name: 'Clementi', lat: 1.315, lng: 103.76, forecast: 'Cloudy' },
  { name: 'Queenstown', lat: 1.291, lng: 103.786, forecast: 'Cloudy' },
  { name: 'City', lat: 1.292, lng: 103.844, forecast: 'Light Showers' },
  { name: 'Toa Payoh', lat: 1.334, lng: 103.856, forecast: 'Cloudy' },
  { name: 'Ang Mo Kio', lat: 1.375, lng: 103.839, forecast: 'Partly Cloudy (Day)' },
  { name: 'Tampines', lat: 1.345, lng: 103.944, forecast: 'Thundery Showers' },
  { name: 'Changi', lat: 1.357, lng: 103.987, forecast: 'Thundery Showers' },
  { name: 'Woodlands', lat: 1.432, lng: 103.786, forecast: 'Fair (Day)' },
];

const HALF_HOUR = 30 * 60 * 1000;
const HOUR = 2 * HALF_HOUR;

/** Demo-mode forecasts, issued for the current half hour, with showers over the city and east. */
export class MockWeatherAdapter implements WeatherService {
  readonly name = 'demo data';

  constructor(private readonly mode: 'fixed' | 'failure' = 'fixed') {}

  async twoHour(): Promise<TwoHourForecast> {
    if (this.mode === 'failure') throw new Error('demo weather service failure');
    const from = new Date(Math.floor(Date.now() / HALF_HOUR) * HALF_HOUR);
    return {
      validFrom: from,
      validTo: new Date(from.getTime() + 2 * HOUR),
      periodText: 'the next two hours',
      areas: DEMO_AREAS,
    };
  }

  async daily(): Promise<DailyForecast> {
    if (this.mode === 'failure') throw new Error('demo weather service failure');
    const start = new Date(Math.floor(Date.now() / (6 * HOUR)) * 6 * HOUR);
    const wet = {
      north: 'Cloudy',
      south: 'Thundery Showers',
      east: 'Thundery Showers',
      west: 'Showers',
      central: 'Thundery Showers',
    };
    const dry = {
      north: 'Cloudy',
      south: 'Cloudy',
      east: 'Partly Cloudy',
      west: 'Cloudy',
      central: 'Cloudy',
    };
    return {
      periods: [0, 1, 2, 3].map((i) => ({
        from: new Date(start.getTime() + i * 6 * HOUR),
        to: new Date(start.getTime() + (i + 1) * 6 * HOUR),
        text: `period ${i + 1}`,
        regions: i % 2 === 0 ? dry : wet,
      })),
    };
  }
}
