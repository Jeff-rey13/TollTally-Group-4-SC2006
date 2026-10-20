import { Router } from 'express';
import {
  efficiencyRecordSchema,
  erpRateSchema,
  fuelPriceSchema,
  type EfficiencyRecordInput,
  type ErpRateInput,
  type FuelPriceInput,
} from '@tolltally/shared';
import type { AppDeps } from '../../deps';
import { createMailer } from '../../lib/mailer';
import { Monitor } from '../../lib/monitor';
import { idOf } from '../../lib/params';
import { validateBody } from '../../middleware/validate';
import {
  createEfficiencyRecord,
  createErpRate,
  createFuelPrice,
  deleteEfficiencyRecord,
  listChargePoints,
  listEfficiencyRecords,
  listErpRates,
  listFuelPrices,
  updateEfficiencyRecord,
  updateErpRate,
  updateFuelPrice,
  withdrawErpRate,
  withdrawFuelPrice,
} from './service';
import { buildOverview, runLiveCheck } from './overview';

export function adminRoutes(deps: AppDeps): Router {
  const router = Router();
  const overviewDeps = {
    ...deps,
    monitor: deps.monitor ?? new Monitor(deps.prisma),
    mailer: deps.mailer ?? createMailer(deps.config),
  };

  // Users, traffic and service health for the overview screen.
  router.get('/overview', async (_req, res) =>
    res.json({ overview: await buildOverview(overviewDeps) }),
  );
  router.post('/health-check', async (_req, res) =>
    res.json({ overview: await runLiveCheck(overviewDeps) }),
  );

  router.get('/fuel-prices', async (_req, res) =>
    res.json({ fuelPrices: await listFuelPrices(deps) }),
  );
  router.post('/fuel-prices', validateBody(fuelPriceSchema), async (req, res) => {
    res.status(201).json({ fuelPrice: await createFuelPrice(deps, req.body as FuelPriceInput) });
  });
  router.put('/fuel-prices/:id', validateBody(fuelPriceSchema), async (req, res) => {
    res.json({ fuelPrice: await updateFuelPrice(deps, idOf(req), req.body as FuelPriceInput) });
  });
  router.post('/fuel-prices/:id/withdraw', async (req, res) => {
    res.json({ fuelPrice: await withdrawFuelPrice(deps, idOf(req)) });
  });

  router.get('/charge-points', async (_req, res) =>
    res.json({ chargePoints: await listChargePoints(deps) }),
  );
  router.get('/erp-rates', async (_req, res) => res.json({ erpRates: await listErpRates(deps) }));
  router.post('/erp-rates', validateBody(erpRateSchema), async (req, res) => {
    res.status(201).json({ erpRate: await createErpRate(deps, req.body as ErpRateInput) });
  });
  router.put('/erp-rates/:id', validateBody(erpRateSchema), async (req, res) => {
    res.json({ erpRate: await updateErpRate(deps, idOf(req), req.body as ErpRateInput) });
  });
  router.post('/erp-rates/:id/withdraw', async (req, res) => {
    res.json({ erpRate: await withdrawErpRate(deps, idOf(req)) });
  });

  router.get('/efficiency-records', async (_req, res) =>
    res.json({ records: await listEfficiencyRecords(deps) }),
  );
  router.post('/efficiency-records', validateBody(efficiencyRecordSchema), async (req, res) => {
    res
      .status(201)
      .json({ record: await createEfficiencyRecord(deps, req.body as EfficiencyRecordInput) });
  });
  router.put('/efficiency-records/:id', validateBody(efficiencyRecordSchema), async (req, res) => {
    res.json({
      record: await updateEfficiencyRecord(deps, idOf(req), req.body as EfficiencyRecordInput),
    });
  });
  router.delete('/efficiency-records/:id', async (req, res) => {
    await deleteEfficiencyRecord(deps, idOf(req));
    res.status(204).end();
  });

  return router;
}
