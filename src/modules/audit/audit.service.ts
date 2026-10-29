import { AuditRepository, FindAuditLogsParams, PaginatedAuditResult } from './audit.repository.ts';

export class AuditLogsService {
  public static async getLogs(filters?: FindAuditLogsParams): Promise<PaginatedAuditResult> {
    return await AuditRepository.findLogs(filters);
  }
}
