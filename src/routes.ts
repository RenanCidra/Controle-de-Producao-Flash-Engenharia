import { Router, type Request, type Response } from 'express';
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
import communicationsRouter from './modules/communications/communications.routes.ts';
import feedbackRouter from './modules/feedback/feedback.routes.ts';
import employeesRouter from './modules/employees/employees.routes.ts';
import notificationsRouter from './modules/notifications/notifications.routes.ts';
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
import {
  OCCURRENCE_SECTORS,
  OCCURRENCE_TYPES,
  type OccurrenceSector,
  type OccurrenceType,
} from './modules/occurrences/occurrence-engine.ts';
import { evaluateMirrorFreshness } from './modules/occurrences/occurrence-stats.ts';
import { OccurrencesService } from './modules/occurrences/occurrences.service.ts';

const apiRouter = Router();

apiRouter.use(validateRequestBody);

// Enforce local-preview read-only mode before mounting any router, including
// public authentication/bootstrap endpoints that otherwise bypass the global auth middleware.
apiRouter.use((req: Request, res: Response, next) => {
  const previewAuthEnabled = process.env.DEV_PREVIEW_AUTH === 'true' && process.env.NODE_ENV !== 'production';
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (previewAuthEnabled && isMutation) {
    return res.status(403).json({ error: 'Modo de prévia local: alterações estão desativadas.' });
  }
  return next();
});
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
apiRouter.use('/communications', communicationsRouter);
apiRouter.use('/feedback', feedbackRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/notifications', notificationsRouter);

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

    const latestBatch = latestImport[0] || null;
    res.json({
      totalProtheusPv: Number(protheusPvCount[0]?.count || 0),
      totalProtheusOp: Number(protheusOpCount[0]?.count || 0),
      totalProtheusProducts: Number(protheusProdCount[0]?.count || 0),
      totalProtheusBatches: Number(protheusBatchesCount[0]?.count || 0),
      totalProtheusStructures: Number(protheusStructuresCount[0]?.count || 0),
      totalProtheusRoutings: Number(protheusRoutingsCount[0]?.count || 0),
      totalProtheusAppointments: Number(protheusAppointmentsCount[0]?.count || 0),
      latestProtheusImport: latestBatch,
      mirrorFreshness: evaluateMirrorFreshness(latestBatch),
      organization: organizationProfile[0] || null,
    });
  } catch (error: any) {
    console.error('Failed to query system stats:', error);
    res.status(500).json({ error: 'Falha ao buscar estatísticas de produção.' });
  }
});

apiRouter.get('/stats/occurrences', requirePermission('occurrences:read'), async (req: Request, res: Response) => {
  try {
    const queryText = (value: unknown, maxLen = 32): string | undefined =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLen) : undefined;

    const from = queryText(req.query.from, 10);
    const to = queryText(req.query.to, 10);
    const validDate = (value?: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));
    if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
      return res.status(400).json({ error: 'Período de consulta inválido.' });
    }

    const rawSector = queryText(req.query.sector, 20)?.toUpperCase();
    if (rawSector && !(OCCURRENCE_SECTORS as readonly string[]).includes(rawSector)) {
      return res.status(400).json({ error: 'Setor inválido.' });
    }

    const rawType = queryText(req.query.type, 30)?.toUpperCase();
    if (rawType && !(OCCURRENCE_TYPES as readonly string[]).includes(rawType)) {
      return res.status(400).json({ error: 'Tipo de ocorrência inválido.' });
    }

    const stats = await OccurrencesService.getAnalyticsStats({
      from,
      to,
      sector: rawSector as OccurrenceSector | undefined,
      type: rawType as OccurrenceType | undefined,
    });
    return res.json(stats);
  } catch (error: any) {
    console.error('Failed to query occurrence stats:', error);
    return res.status(500).json({ error: 'Falha ao buscar indicadores de ocorrências.' });
  }
});

export default apiRouter;

