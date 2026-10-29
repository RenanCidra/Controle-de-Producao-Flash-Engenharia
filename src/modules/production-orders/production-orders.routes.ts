import { Router } from 'express';
import { ProductionOrdersController } from './production-orders.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', ProductionOrdersController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR']), ProductionOrdersController.create);
router.put('/:id', requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']), ProductionOrdersController.update);
router.delete('/:id', requireRole(['ADMIN', 'SUPERVISOR']), ProductionOrdersController.delete);

export default router;
