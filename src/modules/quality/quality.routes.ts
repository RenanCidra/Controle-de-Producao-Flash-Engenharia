import { Router } from 'express';
import { QualityController } from './quality.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', QualityController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR', 'QUALITY_INSPECTOR']), QualityController.create);
router.delete('/:id', requireRole(['ADMIN', 'SUPERVISOR']), QualityController.delete);

export default router;
