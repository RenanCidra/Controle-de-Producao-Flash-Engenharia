import { Router } from 'express';
import { ProtheusSyncController } from './protheus-sync.controller.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const protheusRouter = Router();

// Ingestion endpoints (Both REST API JSON & File Import)
protheusRouter.post('/sync/rest', requirePermission('integrations:write'), ProtheusSyncController.syncRest);
protheusRouter.post('/sync/upload', requirePermission('integrations:write'), allowBodyFields('content', 'fileName', 'entityType'), ProtheusSyncController.syncUpload);
protheusRouter.get('/mock/validate', requirePermission('protheus-data:read'), ProtheusSyncController.validateMock);
protheusRouter.get('/mock/flow-check', requirePermission('protheus-data:read'), ProtheusSyncController.validateMockFlow);
protheusRouter.get('/mock/data', requirePermission('protheus-data:read'), ProtheusSyncController.previewMockData);

// Traceability & Query endpoints
protheusRouter.get('/pv', requirePermission('protheus-data:read'), ProtheusSyncController.getSalesOrders);
protheusRouter.get('/pv/:numeroPv', requirePermission('protheus-data:read'), ProtheusSyncController.getSalesOrderDetail);

protheusRouter.get('/op', requirePermission('protheus-data:read'), ProtheusSyncController.getProductionOrders);
protheusRouter.get('/op/:numeroOp', requirePermission('protheus-data:read'), ProtheusSyncController.getProductionOrderDetail);

protheusRouter.get('/products', requirePermission('protheus-data:read'), ProtheusSyncController.getProducts);
protheusRouter.get('/batches', requirePermission('protheus-data:read'), ProtheusSyncController.getBatches);
protheusRouter.get('/table-data/:entity', requirePermission('protheus-data:read'), ProtheusSyncController.getTableData);

export default protheusRouter;
