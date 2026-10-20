import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields, retryable: err.retryable },
    });
    return;
  }
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.parse.failed') {
    res
      .status(400)
      .json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON' } });
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    res
      .status(413)
      .json({ error: { code: 'TOO_LARGE', message: 'The request body is too large' } });
    return;
  }
  const name = (err as Error)?.name ?? 'Error';
  const code = (err as { code?: string })?.code;
  const detail = process.env.NODE_ENV === 'production' ? '' : `: ${anyErr?.message ?? String(err)}`;
  console.error(`[error] ${req.method} ${req.path} ${name}${code ? ` (${code})` : ''}${detail}`);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such API route' } });
}
