import { Router } from 'express';
import { QualityController } from './quality.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('quality:read'), QualityController.list);
router.post('/', requirePermission('quality:create'), allowBodyFields('productionOrderId', 'batchNumber', 'sampleSize', 'approvedCount', 'rejectedCount', 'status', 'inspectorName', 'notes'), QualityController.create);
router.delete('/:id', requirePermission('quality:delete'), QualityController.delete);

export default router;
