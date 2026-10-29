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
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Dados de configuração inválidos.' });
      }
      const { setupSecret, loginName, password, name, email } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
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
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Dados de acesso inválidos.' });
      }
      const { loginName, identifier, username, email, password } = req.body;
      const targetIdentifier = identifier || loginName || username || email;
      if (typeof targetIdentifier !== 'string' || !targetIdentifier.trim() || targetIdentifier.length > 120
        || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 1_024) {
        return res.status(400).json({ error: 'Informe um usuário e uma senha válida.' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await AuthService.login({
        identifier: targetIdentifier,
        password,
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : undefined,
      });

      return res.json(result);
    } catch (error: any) {
      if (error?.message === 'Credenciais inválidas.') return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      console.error('Login service unavailable:', error?.message || 'Unknown error');
      return res.status(503).json({ error: 'Não foi possível concluir a autenticação. Tente novamente.' });
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

  public static async changePassword(req: AuthenticatedRequest, res: Response) {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Sessão não autenticada.' });
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
      }
      if (Buffer.byteLength(currentPassword, 'utf8') > 1_024) {
        return res.status(400).json({ error: 'A senha atual excede o limite permitido.' });
      }
      if (Buffer.byteLength(newPassword, 'utf8') > 72) {
        return res.status(400).json({ error: 'A nova senha deve ter no máximo 72 bytes.' });
      }
      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await AuthService.changeOwnPassword(uid, currentPassword, newPassword, ipAddress);
      return res.json(result);
    } catch (error: any) {
      const message = error?.message || 'Não foi possível alterar a senha.';
      const status = message === 'SENHA_ATUAL_INCORRETA' ? 400
        : message === 'CONTA_INATIVA' ? 403
          : message === 'SENHA_NOVA_IGUAL' || message.includes('mínimo 12 caracteres') || message.includes('máximo 72 bytes') ? 400 : 500;
      const safeMessage = message === 'SENHA_ATUAL_INCORRETA'
        ? 'A senha atual não confere.'
        : message === 'CONTA_INATIVA' ? 'A conta não está ativa.'
          : message === 'SENHA_NOVA_IGUAL' ? 'A nova senha precisa ser diferente da senha atual.'
            : status === 400 ? message : 'Não foi possível alterar a senha. Tente novamente.';
      return res.status(status).json({ error: safeMessage });
    }
  }
}
