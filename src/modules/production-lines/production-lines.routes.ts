import { Router } from 'express';
import { ProductionLinesController } from './production-lines.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', ProductionLinesController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR']), ProductionLinesController.create);
router.put('/:id', requireRole(['ADMIN', 'SUPERVISOR']), ProductionLinesController.update);
router.delete('/:id', requireRole(['ADMIN', 'SUPERVISOR']), ProductionLinesController.delete);

export default router;
