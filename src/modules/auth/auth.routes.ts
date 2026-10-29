import { Router } from 'express';
import { AuthController } from './auth.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { allowBodyFields, bootstrapRateLimit, loginRateLimit, passwordChangeRateLimit } from '../../middleware/request-protection.ts';

const router = Router();

router.get('/setup-status', AuthController.setupStatus);
router.post('/bootstrap-admin', bootstrapRateLimit, allowBodyFields('setupSecret', 'loginName', 'password', 'name', 'email'), AuthController.bootstrapAdmin);
router.post('/login', loginRateLimit, allowBodyFields('loginName', 'identifier', 'username', 'email', 'password'), AuthController.login);
router.get('/me', authenticateToken, AuthController.me);
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/change-password', authenticateToken, passwordChangeRateLimit, allowBodyFields('currentPassword', 'newPassword'), AuthController.changePassword);

export default router;
