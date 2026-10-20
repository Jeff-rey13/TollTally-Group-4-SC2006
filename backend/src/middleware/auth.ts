import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@tolltally/shared';
import { HttpError } from '../lib/errors';

export interface SessionUser {
  id: string;
  role: Role;
}

export function currentUser(req: Request): SessionUser | null {
  if (!req.session?.userId || !req.session.role) return null;
  return { id: req.session.userId, role: req.session.role };
}

/**
 * Middleware that rejects a request without a signed-in session with 401 UNAUTHENTICATED.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
  res.locals.user = user;
  next();
}

/**
 * Middleware factory that only lets the given role through (403 FORBIDDEN otherwise).
 * Used to protect the administration API (FR-ADM-01).
 */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (!user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    if (user.role !== role)
      return next(new HttpError(403, 'FORBIDDEN', 'Your account is not permitted to do this'));
    res.locals.user = user;
    next();
  };
}

/**
 * Returns the signed-in user placed on the response by requireAuth or requireRole.
 */
export function userOf(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return user;
}
