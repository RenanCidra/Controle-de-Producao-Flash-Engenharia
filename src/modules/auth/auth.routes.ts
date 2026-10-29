import { Router } from 'express';
import { AuthController } from './auth.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/firebase-login', AuthController.firebaseAuth);
router.get('/me', authenticateToken, AuthController.me);
router.post('/logout', authenticateToken, AuthController.logout);

export default router;
