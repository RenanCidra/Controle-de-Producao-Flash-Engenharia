import { Response } from 'express';
import { QualityService } from './quality.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class QualityController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const inspections = await QualityService.list();
      return res.json(inspections);
    } catch (error: any) {
      console.error('Failed to list quality inspections:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar inspeções de qualidade.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const inspection = await QualityService.create(actorId, actorEmail, {
        ...req.body,
        productionOrderId: parseInt(req.body.productionOrderId, 10),
        sampleSize: parseInt(req.body.sampleSize, 10),
        approvedCount: parseInt(req.body.approvedCount || '0', 10),
        rejectedCount: parseInt(req.body.rejectedCount || '0', 10),
      });
      return res.status(201).json(inspection);
    } catch (error: any) {
      console.error('Failed to create quality inspection:', error);
      return res.status(400).json({ error: error.message || 'Falha ao cadastrar inspeção de qualidade.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await QualityService.delete(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete quality inspection:', error);
      return res.status(400).json({ error: error.message || 'Falha ao excluir inspeção de qualidade.' });
    }
  }
}
