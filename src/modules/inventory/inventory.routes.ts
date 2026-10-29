import { Router } from 'express';
import { InventoryController } from './inventory.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('inventory:read'), InventoryController.list);
router.post('/', requirePermission('inventory:create'), InventoryController.create);
router.put('/:id', requirePermission('inventory:update'), InventoryController.update);
router.delete('/:id', requirePermission('inventory:delete'), InventoryController.delete);

export default router;
