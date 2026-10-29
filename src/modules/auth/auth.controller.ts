import { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { AuditService } from '../../services/audit.service.ts';

export class AuthController {
  public static async register(req: Request, res: Response) {
    try {
      const { email, password, name, role, department } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'E-mail e nome completo são obrigatórios.' });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const result = await AuthService.register({
        email,
        password,
        name,
        role,
        department,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Registration failed:', error);
      return res.status(400).json({ error: error.message || 'Falha ao registrar usuário.' });
    }
  }

  public static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const result = await AuthService.login({
        email,
        password,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Login failed:', error);
      return res.status(401).json({ error: error.message || 'Falha na autenticação.' });
    }
  }

  public static async firebaseAuth(req: Request, res: Response) {
    try {
      const { firebaseIdToken } = req.body;
      if (!firebaseIdToken) {
        return res.status(400).json({ error: 'Token do Firebase ausente.' });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const result = await AuthService.syncFirebaseUser(
        firebaseIdToken,
        typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined
      );

      return res.json(result);
    } catch (error: any) {
      console.error('Firebase sync failed:', error);
      return res.status(401).json({ error: error.message || 'Falha ao autenticar com Firebase.' });
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    return res.json({ user: req.user });
  }

  public static async logout(req: AuthenticatedRequest, res: Response) {
    if (req.user) {
      await AuditService.record({
        userId: req.user.uid,
        userEmail: req.user.email,
        action: 'LOGOUT',
        entity: 'AUTH',
        details: { message: 'Sessão encerrada pelo usuário' },
      });
    }
    return res.json({ message: 'Sessão encerrada com sucesso.' });
  }
}
