import 'express-session';
import type { Role } from '@tolltally/shared';
import type { CachedRouteOption } from '../modules/optimisation/types';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    role?: Role;
    routeOptions?: Record<string, CachedRouteOption[]>;
  }
}
