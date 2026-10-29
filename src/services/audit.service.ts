import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { AuditLogEntry } from '../types/index.ts';

export class AuditService {
  public static async record(entry: AuditLogEntry): Promise<void> {
    try {
      const detailsString =
        typeof entry.details === 'object' && entry.details !== null
          ? JSON.stringify(entry.details)
          : entry.details || null;

      await db.insert(auditLogs).values({
        userId: entry.userId || null,
        userEmail: entry.userEmail || null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ? String(entry.entityId) : null,
        details: detailsString,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        status: entry.status || 'SUCCESS',
      });
    } catch (error) {
      // Log silently to avoid aborting primary business logic while keeping console trace
      console.error('Failed to persist audit log to PostgreSQL:', error);
    }
  }
}
