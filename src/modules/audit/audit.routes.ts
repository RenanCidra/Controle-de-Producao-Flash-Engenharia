import { Router } from 'express';
import { AuditController } from './audit.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);
router.get('/', requirePermission('audit:read'), AuditController.list);

export default router;
