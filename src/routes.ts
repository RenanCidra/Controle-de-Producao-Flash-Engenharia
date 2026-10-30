import { Router, Request, Response } from 'express';
import authRoutes from './modules/auth/auth.routes.ts';
import usersRoutes from './modules/users/users.routes.ts';
import orgRoutes from './modules/org/org.routes.ts';
import inventoryRoutes from './modules/inventory/inventory.routes.ts';
import productionOrdersRoutes from './modules/production-orders/production-orders.routes.ts';
import productionLinesRoutes from './modules/production-lines/production-lines.routes.ts';
import qualityRoutes from './modules/quality/quality.routes.ts';
import integrationsRoutes from './modules/integrations/integrations.routes.ts';
import auditRoutes from './modules/audit/audit.routes.ts';
import protheusRouter from './modules/protheus-sync/protheus-sync.routes.ts';
import traceabilityRouter from './modules/traceability/traceability.routes.ts';
import occurrencesRouter from './modules/occurrences/occurrences.routes.ts';
import copilotRouter from './modules/copilot/copilot.routes.ts';
import { db } from './db/index.ts';
import {
  protheusSalesOrders,
  protheusProductionOrders,
  protheusProducts,
  protheusProductStructures,
  protheusRoutings,
  protheusProductionAppointments,
  protheusImportBatches,
  organizations,
} from './db/schema.ts';
import { desc, sql } from 'drizzle-orm';
import { auditHttpMiddleware } from './middleware/audit.middleware.ts';
import { authenticateToken } from './middleware/auth.middleware.ts';
import { mutationRateLimit, validateRequestBody } from './middleware/request-protection.ts';
import { requirePermission } from './middleware/access-control.ts';

const apiRouter = Router();

apiRouter.use(validateRequestBody);
apiRouter.use(auditHttpMiddleware);

apiRouter.use('/auth', authRoutes);
apiRouter.get('/health', async (req: Request, res: Response) => {
  let databaseTimeout: ReturnType<typeof setTimeout> | undefined;
  const databaseStatus = await Promise.race([
    db.execute(sql`select 1`).then(() => 'online' as const).catch(() => 'offline' as const),
    new Promise<'timeout'>((resolve) => {
      databaseTimeout = setTimeout(() => resolve('timeout'), 3000);
    }),
  ]);
  if (databaseTimeout) clearTimeout(databaseTimeout);

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'NexusPCP Production Control & Protheus Sync API',
    databaseStatus,
    version: '1.0.0',
  });
});

// Every business endpoint below this point requires a provisioned, active account.
apiRouter.use(authenticateToken);
apiRouter.use((req: Request, res: Response, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return mutationRateLimit(req, res, next);
  return next();
});
apiRouter.use((req: Request, res: Response, next) => {
  const previewAuthEnabled = process.env.DEV_PREVIEW_AUTH === 'true' && process.env.NODE_ENV !== 'production';
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (previewAuthEnabled && isMutation) {
    return res.status(403).json({ error: 'Modo de prévia local: alterações estão desativadas.' });
  }
  return next();
});
apiRouter.use('/users', usersRoutes);
apiRouter.use('/org', orgRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/production-orders', productionOrdersRoutes);
apiRouter.use('/production-lines', productionLinesRoutes);
apiRouter.use('/quality', qualityRoutes);
apiRouter.use('/integrations', integrationsRoutes);
apiRouter.use('/audit-logs', auditRoutes);
apiRouter.use('/protheus', protheusRouter);
apiRouter.use('/traceability', traceabilityRouter);
apiRouter.use('/occurrences', occurrencesRouter);
apiRouter.use('/copilot', copilotRouter);

apiRouter.get('/stats', requirePermission('production-orders:read'), async (_req: Request, res: Response) => {
  try {
    const [
      protheusPvCount,
      protheusOpCount,
      protheusProdCount,
      protheusBatchesCount,
      protheusStructuresCount,
      protheusRoutingsCount,
      protheusAppointmentsCount,
      latestImport,
      organizationProfile,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(distinct ${protheusSalesOrders.numeroPv})` }).from(protheusSalesOrders),
      db.select({ count: sql<number>`count(*)` }).from(protheusProductionOrders),
      db.select({ count: sql<number>`count(*)` }).from(protheusProducts),
      db.select({ count: sql<number>`count(*)` }).from(protheusImportBatches),
      db.select({ count: sql<number>`count(*)` }).from(protheusProductStructures),
      db.select({ count: sql<number>`count(*)` }).from(protheusRoutings),
      db.select({ count: sql<number>`count(*)` }).from(protheusProductionAppointments),
      db.select({
        batchCode: protheusImportBatches.batchCode,
        sourceType: protheusImportBatches.sourceType,
        entityType: protheusImportBatches.entityType,
        recordsCount: protheusImportBatches.recordsCount,
        status: protheusImportBatches.status,
        createdAt: protheusImportBatches.createdAt,
      }).from(protheusImportBatches).orderBy(desc(protheusImportBatches.createdAt)).limit(1),
      db.select({
        id: organizations.id,
        name: organizations.name,
        tradeName: organizations.tradeName,
        plantCode: organizations.plantCode,
        timezone: organizations.timezone,
      }).from(organizations).limit(1),
    ]);

    res.json({
      totalProtheusPv: Number(protheusPvCount[0]?.count || 0),
      totalProtheusOp: Number(protheusOpCount[0]?.count || 0),
      totalProtheusProducts: Number(protheusProdCount[0]?.count || 0),
      totalProtheusBatches: Number(protheusBatchesCount[0]?.count || 0),
      totalProtheusStructures: Number(protheusStructuresCount[0]?.count || 0),
      totalProtheusRoutings: Number(protheusRoutingsCount[0]?.count || 0),
      totalProtheusAppointments: Number(protheusAppointmentsCount[0]?.count || 0),
      latestProtheusImport: latestImport[0] || null,
      organization: organizationProfile[0] || null,
    });
  } catch (error: any) {
    console.error('Failed to query system stats:', error);
    res.status(500).json({ error: 'Falha ao buscar estatísticas de produção.' });
  }
});

export default apiRouter;

