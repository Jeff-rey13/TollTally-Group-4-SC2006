import type { LocationResult, RouteRequest, RouteResult, RoutingService } from './RoutingService';

/**
 * Combines a primary provider (search and main route) with an optional alternatives provider
 * behind one RoutingService, so callers do not know two providers are involved.
 */
export class CompositeRoutingAdapter implements RoutingService {
  readonly name: string;

  constructor(
    private readonly primary: RoutingService,
    private readonly alternativesProvider?: RoutingService,
  ) {
    this.name = alternativesProvider
      ? `${primary.name}+${alternativesProvider.name}`
      : primary.name;
  }

  search(query: string): Promise<LocationResult[]> {
    return this.primary.search(query);
  }

  route(request: RouteRequest): Promise<RouteResult> {
    return this.primary.route(request);
  }

  alternatives(request: RouteRequest, max: number): Promise<RouteResult[]> {
    return (this.alternativesProvider ?? this.primary).alternatives(request, max);
  }
}
