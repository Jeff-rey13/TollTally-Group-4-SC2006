import type { NextFunction, Request, Response } from 'express';

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
