import type { Config } from '../../config';
import { CompositeRoutingAdapter } from './CompositeRoutingAdapter';
import { GoogleRoutesAdapter } from './GoogleRoutesAdapter';
import { MockRoutingAdapter } from './MockRoutingAdapter';
import { OneMapRoutingAdapter } from './OneMapRoutingAdapter';
import type { RoutingService } from './RoutingService';

/**
 * Factory that picks the routing implementation from ROUTING_PROVIDER (mock or onemap).
 */
export function buildRoutingService(config: Config): RoutingService {
  if (config.ROUTING_PROVIDER === 'mock') return new MockRoutingAdapter();
  const primary = new OneMapRoutingAdapter({
    email: config.ONEMAP_EMAIL,
    password: config.ONEMAP_PASSWORD,
    timeoutMs: config.EXTERNAL_TIMEOUT_MS,
  });
  const alternatives = config.GOOGLE_ROUTES_API_KEY
    ? new GoogleRoutesAdapter({
        apiKey: config.GOOGLE_ROUTES_API_KEY,
        timeoutMs: config.EXTERNAL_TIMEOUT_MS,
      })
    : undefined;
  return new CompositeRoutingAdapter(primary, alternatives);
}

export * from './RoutingService';
export { MockRoutingAdapter, MOCK_PLACES } from './MockRoutingAdapter';
export { MAP_IMAGE_ORIGINS, OneMapRoutingAdapter } from './OneMapRoutingAdapter';
export { GoogleRoutesAdapter } from './GoogleRoutesAdapter';
export { CompositeRoutingAdapter } from './CompositeRoutingAdapter';
