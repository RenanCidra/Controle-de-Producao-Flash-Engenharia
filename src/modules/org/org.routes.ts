import { Router } from 'express';
import { OrgController } from './org.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('organization:read'), OrgController.get);
router.post('/', requirePermission('organization:manage'), OrgController.save);
router.put('/', requirePermission('organization:manage'), OrgController.save);

export default router;
