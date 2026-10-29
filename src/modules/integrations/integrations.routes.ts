import { Router } from 'express';
import { IntegrationsController } from './integrations.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', IntegrationsController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR']), IntegrationsController.create);
router.put('/:id', requireRole(['ADMIN', 'SUPERVISOR']), IntegrationsController.update);
router.delete('/:id', requireRole(['ADMIN']), IntegrationsController.delete);
router.post('/:id/test', requireRole(['ADMIN', 'SUPERVISOR']), IntegrationsController.testConnection);

export default router;
