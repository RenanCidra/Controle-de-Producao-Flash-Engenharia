import { Router } from 'express';
import { AuthController } from './auth.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';

const router = Router();

router.get('/setup-status', AuthController.setupStatus);
router.post('/bootstrap-admin', AuthController.bootstrapAdmin);
router.post('/login', AuthController.login);
router.get('/me', authenticateToken, AuthController.me);
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/change-password', authenticateToken, AuthController.changePassword);

export default router;
