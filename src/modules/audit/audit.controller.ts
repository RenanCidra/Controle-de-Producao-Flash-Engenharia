import { Response } from 'express';
import { AuditLogsService } from './audit.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class AuditController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const { entity, action, status, limit, page, pageSize, search } = req.query;

      const parsedPage = page ? parseInt(page as string, 10) : 1;
      const parsedPageSize = pageSize
        ? parseInt(pageSize as string, 10)
        : limit
        ? parseInt(limit as string, 10)
        : 25;

      const result = await AuditLogsService.getLogs({
        entity: typeof entity === 'string' ? entity : undefined,
        action: typeof action === 'string' ? action : undefined,
        status: typeof status === 'string' ? status : undefined,
        search: typeof search === 'string' ? search : undefined,
        page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        pageSize: Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 25,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('Failed to list audit logs:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar logs de auditoria.' });
    }
  }
}
