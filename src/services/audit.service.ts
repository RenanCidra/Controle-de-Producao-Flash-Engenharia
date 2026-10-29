import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { AuditLogEntry } from '../types/index.ts';

export class AuditService {
  public static async record(entry: AuditLogEntry, req?: any): Promise<void> {
    try {
      if (req) {
        req._auditRecorded = true;
        if (!entry.ipAddress) {
          const forwarded = req.headers?.['x-forwarded-for'];
          entry.ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || '127.0.0.1';
        }
        if (!entry.userAgent) {
          entry.userAgent = req.headers?.['user-agent'] || 'Unknown';
        }
        if (!entry.userId && req.user) {
          entry.userId = req.user.uid || (req.user.userId ? String(req.user.userId) : null);
        }
        if (!entry.userEmail && req.user) {
          entry.userEmail = req.user.email || req.user.loginName || null;
        }
      }

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
