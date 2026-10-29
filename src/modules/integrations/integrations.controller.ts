import { Response } from 'express';
import { IntegrationsService } from './integrations.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class IntegrationsController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const integrations = await IntegrationsService.list();
      return res.json(integrations);
    } catch (error: any) {
      console.error('Failed to list integrations:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar integrações.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const created = await IntegrationsService.create(actorId, actorEmail, req.body);
      return res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create integration:', error);
      return res.status(400).json({ error: error.message || 'Falha ao configurar integração.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const updated = await IntegrationsService.update(actorId, actorEmail, id, req.body);
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update integration:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar integração.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await IntegrationsService.delete(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete integration:', error);
      return res.status(400).json({ error: error.message || 'Falha ao excluir integração.' });
    }
  }

  public static async testConnection(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const testResult = await IntegrationsService.testConnection(actorId, actorEmail, id);
      return res.json(testResult);
    } catch (error: any) {
      console.error('Failed to test integration connection:', error);
      return res.status(400).json({ error: error.message || 'Falha no teste de conexão.' });
    }
  }
}
