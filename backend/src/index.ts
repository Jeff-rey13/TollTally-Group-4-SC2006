import { buildParkingService } from './adapters/parking';
import { buildRoutingService } from './adapters/routing';
import { createApp } from './app';
import { loadConfig } from './config';
import { Monitor } from './lib/monitor';
import { createPrisma } from './lib/prisma';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (config.SESSION_SECRET.length < 32 || /change-me/i.test(config.SESSION_SECRET))
    problems.push('SESSION_SECRET must be a random value of at least 32 characters');
  if (config.ADMIN_PASSWORD === 'Admin1234')
    problems.push('ADMIN_PASSWORD must not be the documented default');
  if (problems.length) {
    console.error(`Refusing to start in production: ${problems.join('; ')}.`);
    process.exit(1);
  }
}
const prisma = createPrisma();
const routing = buildRoutingService(config);
const parking = buildParkingService(config, prisma);
const monitor = new Monitor(prisma);
const app = createApp({ prisma, routing, parking, config, monitor });

const server = app.listen(config.PORT, () => {
  console.log(
    `TollTally API listening on http://localhost:${config.PORT} (env: ${config.NODE_ENV}, routing: ${routing.name}, parking: ${parking.name})`,
  );
  if (config.ROUTING_PROVIDER === 'onemap' && !(config.ONEMAP_EMAIL && config.ONEMAP_PASSWORD)) {
    console.warn(
      'WARNING: ROUTING_PROVIDER=onemap but ONEMAP_EMAIL or ONEMAP_PASSWORD is empty in backend/.env. Place search works, but every trip estimate will fail until you add them and restart.',
    );
  }
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    monitor.stop();
    monitor
      .flush()
      .catch(() => undefined)
      .finally(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
