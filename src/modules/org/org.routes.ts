import { Router } from 'express';
import { OrgController } from './org.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', OrgController.get);
router.post('/', requireRole(['ADMIN']), OrgController.save);
router.put('/', requireRole(['ADMIN']), OrgController.save);

export default router;
