import type { NextFunction, Request, Response } from 'express';

/**
 * Content Security Policy for the single-page app. Scripts, styles, fonts and API calls come only
 * from this site; map tiles come from the map provider's origins. Leaflet positions map
 * layers with inline style attributes, which is why style-src allows 'unsafe-inline'.
 */
export function contentSecurityPolicy(isProduction: boolean, imageOrigins: string[] = []): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...imageOrigins].join(' '),
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isProduction) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export function securityHeaders(isProduction: boolean, imageOrigins: string[] = []) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(isProduction, imageOrigins));
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (
        req.get('sec-fetch-site') === 'cross-site' ||
        (origin && origin !== `${req.protocol}://${req.get('host')}`)
      ) {
        res
          .status(403)
          .json({ error: { code: 'CROSS_ORIGIN', message: 'Reload TollTally and try again.' } });
        return;
      }
    }
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!isProduction) return next();

    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    const host = req.get('host');
    if (!req.secure && host && req.path !== '/api/health') {
      res.redirect(308, `https://${host}${req.originalUrl}`);
      return;
    }
    next();
  };
}
