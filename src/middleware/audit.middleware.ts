import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.ts';
import { AuditService } from '../services/audit.service.ts';
import { AuditAction, AuditEntity } from '../types/index.ts';

function inferEntityFromPath(path: string): AuditEntity {
  if (path.includes('/production-orders')) return 'PRODUCTION_ORDER';
  if (path.includes('/production-lines')) return 'PRODUCTION_LINE';
  if (path.includes('/quality')) return 'QUALITY';
  if (path.includes('/inventory')) return 'INVENTORY';
  if (path.includes('/users')) return 'USER';
  if (path.includes('/org')) return 'ORGANIZATION';
  if (path.includes('/integrations')) return 'INTEGRATION';
  if (path.includes('/protheus')) return 'PROTHEUS_SYNC';
  if (path.includes('/auth')) return 'AUTH';
  return 'SYSTEM';
}

function extractEntityId(path: string): string | null {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && /^[0-9a-zA-Z_-]+$/.test(last) && last !== 'sync' && last !== 'upload' && last !== 'test' && last !== 'login' && last !== 'logout') {
    return last;
  }
  return null;
}

function inferActionFromMethod(method: string, path: string): AuditAction {
  if (path.includes('/login')) return 'LOGIN';
  if (path.includes('/logout')) return 'LOGOUT';
  if (path.includes('/reset-password')) return 'PASSWORD_RESET';
  if (path.includes('/test')) return 'TEST_INTEGRATION';
  if (path.includes('/sync/rest')) return 'SYNC';
  if (path.includes('/sync/upload')) return 'IMPORT';

  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'UPDATE';
  }
}

export const auditHttpMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalSend = res.send;
    res.send = function (body) {
      res.send = originalSend;

      // If already recorded with precise business context by a domain service, avoid duplicate HTTP log
      if ((req as any)._auditRecorded) {
        return originalSend.call(this, body);
      }

      const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      const sensitiveFields = new Set(['password', 'currentpassword', 'confirmpassword', 'passwordconfirm', 'setuppassword', 'setupsecret', 'token', 'accesstoken', 'refreshtoken', 'bearertoken', 'apikey', 'clientsecret', 'secretkey', 'privatekey', 'credential', 'credentials', 'secret', 'newpassword', 'authorization']);
      const redact = (value: unknown, depth = 0): unknown => {
        if (depth > 12) return '[OMITTED]';
        if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
          key,
          sensitiveFields.has(key.toLowerCase().replace(/[_-]/g, '')) ? '***REDACTED***' : redact(item, depth + 1),
        ]));
      };
      const sanitizedBody = redact(req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

      AuditService.record({
        userId: req.user?.uid || (req.user?.userId ? String(req.user.userId) : null),
        userEmail: req.user?.email || req.user?.loginName || null,
        action: inferActionFromMethod(req.method, req.originalUrl),
        entity: inferEntityFromPath(req.originalUrl),
        entityId: req.params?.id || extractEntityId(req.originalUrl),
        details: {
          path: req.path,
          statusCode: res.statusCode,
          payload: sanitizedBody,
        },
        ipAddress,
        userAgent,
        status: isSuccess ? 'SUCCESS' : 'FAILURE',
      });

      return originalSend.call(this, body);
    };
  }
  next();
};
