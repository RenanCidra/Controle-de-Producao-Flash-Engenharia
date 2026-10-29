import { Router } from 'express';
import { UsersController } from './users.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('accounts:manage'), UsersController.list);
router.post('/', requirePermission('accounts:manage'), allowBodyFields('name', 'loginName', 'email', 'password', 'role', 'department', 'customUid'), UsersController.create);
router.put('/:id', requirePermission('accounts:manage'), allowBodyFields('name', 'email', 'role', 'status', 'department'), UsersController.update);
router.post('/:id/reset-password', requirePermission('accounts:manage'), allowBodyFields('password'), UsersController.resetPassword);
router.delete('/:id', requirePermission('accounts:manage'), UsersController.delete);

export default router;

