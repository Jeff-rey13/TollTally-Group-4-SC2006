import type { TrafficIncident } from '../../domain/conditions';
import { ExternalServiceError } from '../../lib/errors';
import { fetchJson } from '../../lib/http';
import { Cached, type TrafficIncidentService } from './ConditionServices';

/** LTA DataMall Traffic Incidents, one of the DataMall dynamic datasets. */
export const LTA_INCIDENTS_URL =
  'https://datamall2.mytransport.sg/ltaodataservice/TrafficIncidents';

interface DataMallIncidents {
  value?: { Type?: unknown; Latitude?: unknown; Longitude?: unknown; Message?: unknown }[];
}

/**
 * «adapter» for LTA DataMall's current traffic incidents. The DataMall Account Key goes in the
 * AccountKey header. Answers are kept for two minutes, which is about how often LTA updates them.
 */
export class LtaIncidentAdapter implements TrafficIncidentService {
  readonly name = 'LTA DataMall';
  private readonly cache: Cached<TrafficIncident[]>;

  constructor(
    private readonly accountKey: string,
    private readonly timeoutMs: number,
  ) {
    this.cache = new Cached(2 * 60 * 1000, () => this.fetch());
  }

  incidents(): Promise<TrafficIncident[]> {
    return this.cache.get();
  }

  private async fetch(): Promise<TrafficIncident[]> {
    const data = await fetchJson<DataMallIncidents>(
      'traffic',
      LTA_INCIDENTS_URL,
      { headers: { AccountKey: this.accountKey, accept: 'application/json' } },
      this.timeoutMs,
    );
    if (!Array.isArray(data?.value)) {
      throw new ExternalServiceError(
        'traffic',
        'MALFORMED',
        'The traffic service returned no incident list',
      );
    }
    return parseIncidents(data.value);
  }
}

/** Keeps the incidents that have a usable position; LTA occasionally sends blank coordinates. */
export function parseIncidents(rows: NonNullable<DataMallIncidents['value']>): TrafficIncident[] {
  const out: TrafficIncident[] = [];
  for (const r of rows) {
    const lat = Number(r.Latitude);
    const lng = Number(r.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
    out.push({
      type: typeof r.Type === 'string' && r.Type.trim() ? r.Type.trim() : 'Incident',
      message: typeof r.Message === 'string' ? r.Message.trim().slice(0, 300) : '',
      lat,
      lng,
    });
  }
  return out;
}
