import { Router } from 'express';
import { TraceabilityController } from './traceability.controller.ts';
import { requireAnyPermission } from '../../middleware/access-control.ts';

const traceabilityRouter = Router();

// Bidirectional matrix search and filtering
traceabilityRouter.get('/matrix', requireAnyPermission('protheus-data:read', 'production-orders:read'), TraceabilityController.getMatrix);

// Factory summary KPI metrics (strictly calculated from database rows)
traceabilityRouter.get('/metrics', requireAnyPermission('protheus-data:read', 'production-orders:read'), TraceabilityController.getMetrics);

// 360-degree OP detail with routing progress, appointments history, and BOM child OPs
traceabilityRouter.get('/op/:numeroOp', requireAnyPermission('protheus-data:read', 'production-orders:read'), TraceabilityController.getOpDetail);

// Export endpoints (CSV industrial format and JSON format)
traceabilityRouter.get('/export/csv', requireAnyPermission('protheus-data:read', 'production-orders:read'), TraceabilityController.exportCsv);
traceabilityRouter.get('/export/json', requireAnyPermission('protheus-data:read', 'production-orders:read'), TraceabilityController.exportJson);

export default traceabilityRouter;
