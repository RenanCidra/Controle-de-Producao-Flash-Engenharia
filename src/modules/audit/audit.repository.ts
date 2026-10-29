import { db } from '../../db/index.ts';
import { auditLogs } from '../../db/schema.ts';
import { desc, eq, and } from 'drizzle-orm';

export class AuditRepository {
  public static async findLogs(filters?: {
    entity?: string;
    action?: string;
    status?: string;
    limit?: number;
  }) {
    try {
      const limit = filters?.limit || 100;
      const conditions = [];

      if (filters?.entity) {
        conditions.push(eq(auditLogs.entity, filters.entity.toUpperCase()));
      }
      if (filters?.action) {
        conditions.push(eq(auditLogs.action, filters.action.toUpperCase()));
      }
      if (filters?.status) {
        conditions.push(eq(auditLogs.status, filters.status.toUpperCase()));
      }

      if (conditions.length > 0) {
        return await db
          .select()
          .from(auditLogs)
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);
      }

      return await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('Database query error in AuditRepository.findLogs:', error);
      throw new Error('Falha ao consultar logs de auditoria.', { cause: error });
    }
  }
}
