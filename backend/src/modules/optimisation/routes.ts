import { Router } from 'express';
import {
  applyDepartureSchema,
  chooseRouteSchema,
  type ApplyDepartureInput,
  type ChooseRouteInput,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { userOf } from '../../middleware/auth';
import { idOf } from '../../lib/params';
import { validateBody } from '../../middleware/validate';
import {
  applyDeparture,
  chooseRouteOption,
  compareRouteOptions,
  optimiseDepartureTime,
} from './service';

export function optimisationRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post('/:id/compare-routes', async (req, res) => {
    res.json(await compareRouteOptions(deps, idOf(req), userOf(res).id, req.session));
  });

  router.post('/:id/choose-route', validateBody(chooseRouteSchema), async (req, res) => {
    const { optionId } = req.body as ChooseRouteInput;
    res.json({
      trip: await chooseRouteOption(deps, idOf(req), userOf(res).id, req.session, optionId),
    });
  });

  router.post('/:id/optimise-departure', async (req, res) => {
    res.json(await optimiseDepartureTime(deps, idOf(req), userOf(res).id));
  });

  router.post('/:id/apply-departure', validateBody(applyDepartureSchema), async (req, res) => {
    const { departureTime } = req.body as ApplyDepartureInput;
    res.json({ trip: await applyDeparture(deps, idOf(req), userOf(res).id, departureTime) });
  });

  return router;
}
