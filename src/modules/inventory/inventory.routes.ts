import { Router } from 'express';
import { InventoryController } from './inventory.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('inventory:read'), InventoryController.list);
router.post('/', requirePermission('inventory:create'), allowBodyFields('sku', 'name', 'description', 'itemType', 'unit', 'costPrice', 'quantityOnHand', 'minimumStock'), InventoryController.create);
router.put('/:id', requirePermission('inventory:update'), allowBodyFields('name', 'description', 'itemType', 'unit', 'costPrice', 'quantityOnHand', 'minimumStock', 'status'), InventoryController.update);
router.delete('/:id', requirePermission('inventory:delete'), InventoryController.delete);

export default router;

