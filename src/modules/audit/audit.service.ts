import { AuditRepository } from './audit.repository.ts';

export class AuditLogsService {
  public static async getLogs(filters?: {
    entity?: string;
    action?: string;
    status?: string;
    limit?: number;
  }) {
    return await AuditRepository.findLogs(filters);
  }
}
