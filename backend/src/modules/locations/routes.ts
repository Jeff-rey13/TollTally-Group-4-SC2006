import { Router } from 'express';
import { isInSingapore, locationSearchSchema } from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { ExternalServiceError, HttpError } from '../../lib/errors';
import { parseWith } from '../../middleware/validate';

export function locationRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    const { q } = parseWith(locationSearchSchema, { q: req.query.q });
    try {
      const results = await deps.routing.search(q);
      res.json({ results: results.filter((r) => isInSingapore(r.lat, r.lng)) });
    } catch (err) {
      if (err instanceof ExternalServiceError) {
        throw new HttpError(
          503,
          'SEARCH_UNAVAILABLE',
          'Location search is unavailable right now; try again shortly',
          undefined,
          true,
        );
      }
      throw err;
    }
  });

  return router;
}
