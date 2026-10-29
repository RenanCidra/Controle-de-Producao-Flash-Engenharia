import { Response } from 'express';
import { ProductionLinesService } from './production-lines.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class ProductionLinesController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const lines = await ProductionLinesService.list();
      return res.json(lines);
    } catch (error: any) {
      console.error('Failed to list production lines:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar linhas de produção.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const line = await ProductionLinesService.create(actorId, actorEmail, req.body);
      return res.status(201).json(line);
    } catch (error: any) {
      console.error('Failed to create production line:', error);
      return res.status(400).json({ error: error.message || 'Falha ao cadastrar linha de produção.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const updated = await ProductionLinesService.update(actorId, actorEmail, id, req.body);
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update production line:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar linha de produção.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await ProductionLinesService.delete(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete production line:', error);
      return res.status(400).json({ error: error.message || 'Falha ao remover linha de produção.' });
    }
  }
}
