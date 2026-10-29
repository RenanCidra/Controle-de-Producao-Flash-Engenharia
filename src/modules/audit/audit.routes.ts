import { Router } from 'express';
import { AuditController } from './audit.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);
router.get('/', requireRole(['ADMIN', 'SUPERVISOR']), AuditController.list);

export default router;
