import { Router } from 'express';
import { InventoryController } from './inventory.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', InventoryController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR']), InventoryController.create);
router.put('/:id', requireRole(['ADMIN', 'SUPERVISOR', 'OPERATOR']), InventoryController.update);
router.delete('/:id', requireRole(['ADMIN', 'SUPERVISOR']), InventoryController.delete);

export default router;
