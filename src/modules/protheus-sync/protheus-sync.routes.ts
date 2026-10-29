import { Router } from 'express';
import { ProtheusSyncController } from './protheus-sync.controller.ts';

const protheusRouter = Router();

// Ingestion endpoints (Both REST API JSON & File Import)
protheusRouter.post('/sync/rest', ProtheusSyncController.syncRest);
protheusRouter.post('/sync/upload', ProtheusSyncController.syncUpload);

// Traceability & Query endpoints
protheusRouter.get('/pv', ProtheusSyncController.getSalesOrders);
protheusRouter.get('/pv/:numeroPv', ProtheusSyncController.getSalesOrderDetail);

protheusRouter.get('/op', ProtheusSyncController.getProductionOrders);
protheusRouter.get('/op/:numeroOp', ProtheusSyncController.getProductionOrderDetail);

protheusRouter.get('/products', ProtheusSyncController.getProducts);
protheusRouter.get('/batches', ProtheusSyncController.getBatches);

export default protheusRouter;
