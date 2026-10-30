import { Router } from 'express';
import { TraceabilityController } from './traceability.controller.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const traceabilityRouter = Router();

// Bidirectional matrix search and filtering
traceabilityRouter.get('/matrix', requirePermission('protheus-data:read'), TraceabilityController.getMatrix);

// Factory summary KPI metrics (strictly calculated from database rows)
traceabilityRouter.get('/metrics', requirePermission('protheus-data:read'), TraceabilityController.getMetrics);

// 360-degree OP detail with routing progress, appointments history, and BOM child OPs
traceabilityRouter.get('/op/:numeroOp', requirePermission('protheus-data:read'), TraceabilityController.getOpDetail);

// Export endpoints (CSV industrial format and JSON format)
traceabilityRouter.get('/export/csv', requirePermission('protheus-data:read'), TraceabilityController.exportCsv);
traceabilityRouter.get('/export/json', requirePermission('protheus-data:read'), TraceabilityController.exportJson);

export default traceabilityRouter;
