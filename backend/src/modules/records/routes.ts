import { Router } from 'express';
import {
  historyQuerySchema,
  tripLogSchema,
  type HistoryQuery,
  type TripLogInput,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { userOf } from '../../middleware/auth';
import { idOf } from '../../lib/params';
import { validateBody, validateQuery } from '../../middleware/validate';
import { logActualCosts, saveTrip, tripHistory } from './service';

export function recordRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post('/:id/save', async (req, res) => {
    res.json({ trip: await saveTrip(deps, idOf(req), userOf(res).id) });
  });

  router.put('/:id/log', validateBody(tripLogSchema), async (req, res) => {
    res.json({
      trip: await logActualCosts(deps, idOf(req), userOf(res).id, req.body as TripLogInput),
    });
  });

  return router;
}

export function historyRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get('/', validateQuery(historyQuerySchema), async (_req, res) => {
    res.json(await tripHistory(deps, userOf(res).id, res.locals.query as HistoryQuery));
  });

  return router;
}
