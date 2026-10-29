import { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { AuditService } from '../../services/audit.service.ts';

export class AuthController {
  public static async setupStatus(_req: Request, res: Response) {
    try {
      return res.json(await AuthService.getSetupStatus());
    } catch (error: any) {
      console.error('Failed to read initial setup status:', error);
      return res.status(503).json({ error: 'Não foi possível verificar a configuração inicial.' });
    }
  }

  public static async bootstrapAdmin(req: Request, res: Response) {
    try {
      const { setupSecret, loginName, password, name, email } = req.body;
      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddress = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress;
      const result = await AuthService.bootstrapAdmin({
        setupSecret,
        loginName,
        password,
        name,
        email,
        ipAddress,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      const setupError = /configuração inicial/i.test(String(error.message || ''));
      return res.status(setupError ? 403 : 400).json({ error: error.message || 'Falha ao criar a conta inicial.' });
    }
  }

  public static async login(req: Request, res: Response) {
    try {
      const { loginName, identifier, username, email, password } = req.body;
      const targetIdentifier = identifier || loginName || username || email;
      if (!targetIdentifier || !password) {
        return res.status(400).json({ error: 'Usuário ou ID e senha são obrigatórios.' });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const result = await AuthService.login({
        identifier: targetIdentifier,
        password,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Login failed:', error);
      return res.status(401).json({ error: error.message || 'Falha na autenticação.' });
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
