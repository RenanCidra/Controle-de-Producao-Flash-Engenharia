import { Router } from 'express';
import { UsersController } from './users.controller.ts';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', UsersController.list);
router.post('/', requireRole(['ADMIN', 'SUPERVISOR']), UsersController.create);
router.put('/:id', requireRole(['ADMIN', 'SUPERVISOR']), UsersController.update);
router.delete('/:id', requireRole(['ADMIN']), UsersController.delete);

export default router;
