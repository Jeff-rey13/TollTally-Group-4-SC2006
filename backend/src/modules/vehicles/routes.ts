import { Router } from 'express';
import { vehicleSchema, type VehicleInput } from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { userOf } from '../../middleware/auth';
import { idOf } from '../../lib/params';
import { validateBody } from '../../middleware/validate';
import {
  archiveVehicle,
  createVehicle,
  deleteVehicle,
  getOwnedVehicle,
  listVehicles,
  toVehicleDto,
  updateVehicle,
} from './service';

export function vehicleRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const includeArchived =
      req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    res.json({ vehicles: await listVehicles(deps, userOf(res).id, includeArchived) });
  });

  router.post('/', validateBody(vehicleSchema), async (req, res) => {
    res
      .status(201)
      .json({ vehicle: await createVehicle(deps, userOf(res).id, req.body as VehicleInput) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ vehicle: toVehicleDto(await getOwnedVehicle(deps, userOf(res).id, idOf(req))) });
  });

  router.put('/:id', validateBody(vehicleSchema), async (req, res) => {
    res.json({
      vehicle: await updateVehicle(deps, userOf(res).id, idOf(req), req.body as VehicleInput),
    });
  });

  router.delete('/:id', async (req, res) => {
    await deleteVehicle(deps, userOf(res).id, idOf(req));
    res.status(204).end();
  });

  router.post('/:id/archive', async (req, res) => {
    res.json({ vehicle: await archiveVehicle(deps, userOf(res).id, idOf(req), true) });
  });

  router.post('/:id/unarchive', async (req, res) => {
    res.json({ vehicle: await archiveVehicle(deps, userOf(res).id, idOf(req), false) });
  });

  return router;
}
