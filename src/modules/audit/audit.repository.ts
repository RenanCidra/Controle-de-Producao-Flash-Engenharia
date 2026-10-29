import { db } from '../../db/index.ts';
import { auditLogs } from '../../db/schema.ts';
import { desc, eq, and, or, ilike, sql } from 'drizzle-orm';

export interface FindAuditLogsParams {
  entity?: string;
  action?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
}

export interface PaginatedAuditResult {
  items: Array<typeof auditLogs.$inferSelect>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class AuditRepository {
  public static async findLogs(filters?: FindAuditLogsParams): Promise<PaginatedAuditResult> {
    try {
      const page = Math.max(1, Math.floor(filters?.page || 1));
      const pageSize = Math.min(100, Math.max(1, Math.floor(filters?.pageSize || filters?.limit || 25)));
      const offset = (page - 1) * pageSize;

      const conditions = [];

      if (filters?.entity && filters.entity.toUpperCase() !== 'ALL') {
        conditions.push(eq(auditLogs.entity, filters.entity.toUpperCase()));
      }
      if (filters?.action && filters.action.toUpperCase() !== 'ALL') {
        conditions.push(eq(auditLogs.action, filters.action.toUpperCase()));
      }
      if (filters?.status && filters.status.toUpperCase() !== 'ALL') {
        conditions.push(eq(auditLogs.status, filters.status.toUpperCase()));
      }
      if (filters?.search && filters.search.trim()) {
        const search = filters.search.trim().slice(0, 100);
        conditions.push(
          or(
            ilike(auditLogs.entity, `%${search}%`),
            ilike(auditLogs.action, `%${search}%`),
            ilike(auditLogs.userId, `%${search}%`),
            ilike(auditLogs.userEmail, `%${search}%`),
            ilike(auditLogs.entityId, `%${search}%`),
            ilike(auditLogs.details, `%${search}%`),
            ilike(auditLogs.ipAddress, `%${search}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countRows] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(whereClause)
          .orderBy(desc(auditLogs.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(auditLogs)
          .where(whereClause),
      ]);

      const total = Number(countRows[0]?.count || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return {
        items,
        total,
        page,
        pageSize,
        totalPages,
      };
    } catch (error) {
      console.error('Database query error in AuditRepository.findLogs:', error);
      throw new Error('Falha ao consultar logs de auditoria.', { cause: error });
    }
  }
}
