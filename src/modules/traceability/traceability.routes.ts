import { Router } from 'express';
import { TraceabilityController } from './traceability.controller.ts';

const traceabilityRouter = Router();

// Bidirectional matrix search and filtering
traceabilityRouter.get('/matrix', TraceabilityController.getMatrix);

// Factory summary KPI metrics (strictly calculated from database rows)
traceabilityRouter.get('/metrics', TraceabilityController.getMetrics);

// 360-degree OP detail with routing progress, appointments history, and BOM child OPs
traceabilityRouter.get('/op/:numeroOp', TraceabilityController.getOpDetail);

// Export endpoints (CSV industrial format and JSON format)
traceabilityRouter.get('/export/csv', TraceabilityController.exportCsv);
traceabilityRouter.get('/export/json', TraceabilityController.exportJson);

export default traceabilityRouter;
