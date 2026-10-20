import { Router } from 'express';
import { topUpSchema, type TopUpInput } from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { userOf } from '../../middleware/auth';
import { idOf } from '../../lib/params';
import { validateBody } from '../../middleware/validate';
import { planFuelTopUp } from './service';

export function topUpRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post('/:id/top-up-plan', validateBody(topUpSchema), async (req, res) => {
    res.json({
      trip: await planFuelTopUp(deps, idOf(req), userOf(res).id, req.body as TopUpInput),
    });
  });

  return router;
}
