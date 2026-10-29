import { Response } from 'express';
import { UsersService } from './users.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class UsersController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const users = await UsersService.listUsers();
      return res.json(users);
    } catch (error: any) {
      console.error('Failed to list users:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar usuários.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const { name, loginName, email, password, role, department, customUid } = req.body;
      if (!name || !loginName || !password) {
        return res.status(400).json({ error: 'Nome, identificador de acesso e senha são obrigatórios.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const user = await UsersService.createUser(actorId, actorEmail, {
        name,
        loginName,
        email,
        password,
        role: role || 'OPERATOR',
        department,
        customUid,
      });

      return res.status(201).json(user);
    } catch (error: any) {
      console.error('Failed to create user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao cadastrar conta de acesso.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      if (id === req.user?.userId && ((req.body.role && req.body.role !== 'ADMIN') || req.body.status === 'INACTIVE')) {
        return res.status(400).json({ error: 'Não é possível remover seus próprios privilégios administrativos ou desativar sua conta.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const { name, email, role, status, department } = req.body;
      const updated = await UsersService.updateUser(actorId, actorEmail, id, {
        name,
        email,
        role,
        status,
        department,
      });
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar conta de acesso.' });
    }
  }

  public static async resetPassword(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const { password } = req.body;
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'A nova senha é obrigatória.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await UsersService.resetPassword(actorId, actorEmail, id, password);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to reset user password:', error);
      return res.status(400).json({ error: error.message || 'Falha ao redefinir a senha do usuário.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      if (id === req.user?.userId) {
        return res.status(400).json({ error: 'Não é possível excluir a própria conta em uso.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await UsersService.deleteUser(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao remover conta de acesso.' });
    }
  }
}
