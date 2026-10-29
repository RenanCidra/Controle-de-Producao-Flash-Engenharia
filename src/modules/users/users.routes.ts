import { Router } from 'express';
import { UsersController } from './users.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('accounts:manage'), UsersController.list);
router.post('/', requirePermission('accounts:manage'), UsersController.create);
router.put('/:id', requirePermission('accounts:manage'), UsersController.update);
router.delete('/:id', requirePermission('accounts:manage'), UsersController.delete);

export default router;
