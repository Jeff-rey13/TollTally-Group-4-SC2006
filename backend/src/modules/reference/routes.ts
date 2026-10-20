import { Router } from 'express';
import type { AppDeps } from '../../deps';
import { listVehicleModels, lookupEfficiency } from '../vehicles/service';

export function referenceRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get('/efficiency', async (req, res) => {
    const make = typeof req.query.make === 'string' ? req.query.make : '';
    const model = typeof req.query.model === 'string' ? req.query.model : '';
    res.json(await lookupEfficiency(deps, make, model));
  });

  router.get('/vehicle-models', async (_req, res) => {
    res.json({ models: await listVehicleModels(deps) });
  });

  return router;
}
