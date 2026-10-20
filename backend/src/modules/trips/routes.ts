import { Router } from 'express';
import { tripSchema, type TripInput } from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { userOf } from '../../middleware/auth';
import { idOf } from '../../lib/params';
import { validateBody } from '../../middleware/validate';
import { tripConditions } from './conditions';
import { estimateTrip, getTrip, planTrip } from './service';

export function tripRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post('/', validateBody(tripSchema), async (req, res) => {
    res.status(201).json(await planTrip(deps, userOf(res).id, req.body as TripInput));
  });

  router.get('/:id', async (req, res) => {
    res.json({ trip: await getTrip(deps, idOf(req), userOf(res).id) });
  });

  router.post('/:id/estimate', async (req, res) => {
    res.json({ trip: await estimateTrip(deps, idOf(req), userOf(res).id) });
  });

  router.get('/:id/conditions', async (req, res) => {
    res.json({ conditions: await tripConditions(deps, idOf(req), userOf(res).id) });
  });

  return router;
}
