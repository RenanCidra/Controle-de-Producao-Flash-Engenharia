import { Router } from 'express';
import { IntegrationsController } from './integrations.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('integrations:read'), IntegrationsController.list);
router.post('/', requirePermission('integrations:write'), IntegrationsController.create);
router.put('/:id', requirePermission('integrations:write'), IntegrationsController.update);
router.delete('/:id', requirePermission('integrations:delete'), IntegrationsController.delete);
router.post('/:id/test', requirePermission('integrations:write'), IntegrationsController.testConnection);

export default router;
