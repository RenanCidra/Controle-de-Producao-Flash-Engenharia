import { Response } from 'express';
import { OrgService } from './org.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class OrgController {
  public static async get(req: AuthenticatedRequest, res: Response) {
    try {
      const org = await OrgService.get();
      return res.json(org);
    } catch (error: any) {
      console.error('Failed to get org:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar dados da empresa.' });
    }
  }

  public static async save(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const saved = await OrgService.save(actorId, actorEmail, req.body);
      return res.json(saved);
    } catch (error: any) {
      console.error('Failed to save org:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar dados da empresa.' });
    }
  }
}
