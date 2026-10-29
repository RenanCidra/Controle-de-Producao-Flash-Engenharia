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
  if (path.includes('/auth')) return 'AUTH';
  return 'PRODUCTION_ORDER';
}

function inferActionFromMethod(method: string): AuditAction {
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

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      const sanitizedBody = { ...req.body };
      for (const sensitiveField of ['password', 'setupSecret', 'token', 'accessToken', 'refreshToken', 'apiKey']) {
        if (sensitiveField in sanitizedBody) sanitizedBody[sensitiveField] = '***REDACTED***';
      }

      AuditService.record({
        userId: req.user?.uid || (req.user?.userId ? String(req.user.userId) : null),
        userEmail: req.user?.email || null,
        action: inferActionFromMethod(req.method),
        entity: inferEntityFromPath(req.originalUrl),
        entityId: req.params?.id || null,
        details: {
          path: req.originalUrl,
          statusCode: res.statusCode,
          payload: sanitizedBody,
        },
        ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : '127.0.0.1',
        userAgent,
        status: isSuccess ? 'SUCCESS' : 'FAILURE',
      });

      return originalSend.call(this, body);
    };
  }
  next();
};
