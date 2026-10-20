import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { fieldErrorsOf } from '@tolltally/shared';
import { HttpError } from '../lib/errors';

export function validationError(error: z.ZodError): HttpError {
  return new HttpError(400, 'VALIDATION', 'Check the highlighted fields', fieldErrorsOf(error));
}

/**
 * Middleware that validates the request body with a shared Zod schema (NFR-SEC-04).
 * Invalid input stops here with field-level messages and never reaches a control module.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(validationError(result.error));
    req.body = result.data;
    next();
  };
}

/**
 * Middleware that validates query parameters with a shared Zod schema.
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) return next(validationError(result.error));
    res.locals.query = result.data;
    next();
  };
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}
