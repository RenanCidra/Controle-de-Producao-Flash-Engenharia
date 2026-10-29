import { Router } from 'express';
import { IntegrationsController } from './integrations.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('integrations:read'), IntegrationsController.list);
router.post('/', requirePermission('integrations:write'), allowBodyFields('name', 'provider', 'baseUrl', 'apiKey', 'authType', 'headerName'), IntegrationsController.create);
router.put('/:id', requirePermission('integrations:write'), allowBodyFields('name', 'provider', 'baseUrl', 'apiKey', 'authType', 'headerName', 'status'), IntegrationsController.update);
router.delete('/:id', requirePermission('integrations:delete'), IntegrationsController.delete);
router.post('/:id/test', requirePermission('integrations:write'), IntegrationsController.testConnection);

export default router;

