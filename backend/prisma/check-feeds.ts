/**
 * Checks the two live-information feeds with the settings in backend/.env: LTA traffic incidents
 * (needs LTA_ACCOUNT_KEY) and the data.gov.sg weather forecasts (no key needed). Prints what each
 * returned, so you can confirm the key works before showing the feature.
 *
 * Usage: npm run feeds:check
 */
import { LtaIncidentAdapter, NeaWeatherAdapter } from '../src/adapters/conditions';
import { loadConfig } from '../src/config';
import { isRain } from '../src/domain/conditions';
import { formatSgDateTime } from '../src/domain/time';

async function main(): Promise<void> {
  const config = loadConfig();
  let failed = false;

  console.log('Traffic incidents (LTA)');
  if (!config.LTA_ACCOUNT_KEY) {
    console.log('  Skipped: LTA_ACCOUNT_KEY is empty in backend/.env.');
  } else {
    try {
      const incidents = await new LtaIncidentAdapter(
        config.LTA_ACCOUNT_KEY,
        config.EXTERNAL_TIMEOUT_MS,
      ).incidents();
      console.log(`  OK: ${incidents.length} incidents reported right now.`);
      for (const i of incidents.slice(0, 5)) console.log(`  - ${i.type}: ${i.message}`);
    } catch (err) {
      failed = true;
      console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      console.log('  Check that the key in LTA_ACCOUNT_KEY is the one LTA emailed you.');
    }
  }

  console.log('\nWeather forecast (data.gov.sg)');
  const weather = new NeaWeatherAdapter(config.EXTERNAL_TIMEOUT_MS, config.DATA_GOV_SG_API_KEY);
  try {
    const f = await weather.twoHour();
    const wet = f.areas.filter((a) => isRain(a.forecast));
    console.log(
      `  OK: 2-hour forecast for ${f.areas.length} areas, ${formatSgDateTime(f.validFrom)} to ${formatSgDateTime(f.validTo)}.`,
    );
    console.log(
      wet.length
        ? `  Rain forecast in: ${wet.map((a) => `${a.name} (${a.forecast})`).join(', ')}`
        : '  No rain forecast in any area.',
    );
    const d = await weather.daily();
    console.log(`  OK: 24-hour forecast with ${d.periods.length} periods.`);
  } catch (err) {
    failed = true;
    console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(failed ? 1 : 0);
}

void main();
