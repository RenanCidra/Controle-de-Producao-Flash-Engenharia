import { Router } from 'express';
import { ProductionLinesController } from './production-lines.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('production-lines:read'), ProductionLinesController.list);
router.post('/', requirePermission('production-lines:write'), allowBodyFields('code', 'name', 'description', 'capacityPerHour', 'status', 'supervisorName'), ProductionLinesController.create);
router.put('/:id', requirePermission('production-lines:write'), allowBodyFields('name', 'description', 'capacityPerHour', 'status', 'supervisorName'), ProductionLinesController.update);
router.delete('/:id', requirePermission('production-lines:delete'), ProductionLinesController.delete);

export default router;
