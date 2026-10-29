import { Router } from 'express';
import { ProductionLinesController } from './production-lines.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('production-lines:read'), ProductionLinesController.list);
router.post('/', requirePermission('production-lines:write'), ProductionLinesController.create);
router.put('/:id', requirePermission('production-lines:write'), ProductionLinesController.update);
router.delete('/:id', requirePermission('production-lines:delete'), ProductionLinesController.delete);

export default router;
