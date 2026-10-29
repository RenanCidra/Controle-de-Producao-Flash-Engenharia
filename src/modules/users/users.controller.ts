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
      const { name, email, password, role, department } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const user = await UsersService.createUser(actorId, actorEmail, {
        name,
        email,
        password,
        role: role || 'OPERATOR',
        department,
      });

      return res.status(201).json(user);
    } catch (error: any) {
      console.error('Failed to create user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao cadastrar colaborador.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const updated = await UsersService.updateUser(actorId, actorEmail, id, req.body);
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar colaborador.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
      }

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await UsersService.deleteUser(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      return res.status(400).json({ error: error.message || 'Falha ao remover colaborador.' });
    }
  }
}
