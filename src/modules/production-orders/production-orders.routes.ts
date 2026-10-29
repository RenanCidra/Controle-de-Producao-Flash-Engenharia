import { Router } from 'express';
import { ProductionOrdersController } from './production-orders.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('production-orders:read'), ProductionOrdersController.list);
router.post('/', requirePermission('production-orders:create'), allowBodyFields('orderNumber', 'inventoryItemId', 'productionLineId', 'quantityPlanned', 'priority', 'startDate', 'plannedEndDate', 'notes'), ProductionOrdersController.create);
router.put('/:id', requirePermission('production-orders:update'), allowBodyFields('productionLineId', 'quantityProduced', 'quantityScrap', 'status', 'priority', 'startDate', 'plannedEndDate', 'completedDate', 'notes'), ProductionOrdersController.update);
router.delete('/:id', requirePermission('production-orders:delete'), ProductionOrdersController.delete);

export default router;

