import { Response } from 'express';
import { AuditLogsService } from './audit.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class AuditController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const { entity, action, status, limit } = req.query;
      const logs = await AuditLogsService.getLogs({
        entity: entity as string,
        action: action as string,
        status: status as string,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });
      return res.json(logs);
    } catch (error: any) {
      console.error('Failed to list audit logs:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar logs de auditoria.' });
    }
  }
}
