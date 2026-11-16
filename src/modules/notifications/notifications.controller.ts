import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import {
  NotificationInputError,
  NotificationNotFoundError,
  NotificationsService,
} from './notifications.service.ts';
import type { NotificationEventType } from './notification-rules.ts';

function respondError(res: Response, error: unknown) {
  if (error instanceof NotificationNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof NotificationInputError) return res.status(400).json({ error: error.message });
  console.error('Notifications request failed:', error);
  return res.status(500).json({ error: 'Não foi possível processar a solicitação de notificações.' });
}

const VALID_MANUAL_EVENTS = new Set<NotificationEventType>([
  'OCCURRENCE_CREATED',
  'OCCURRENCE_ASSIGNED',
  'OCCURRENCE_MESSAGE',
  'OCCURRENCE_ESCALATED_30M',
  'OCCURRENCE_SLA_BREACH',
  'OCCURRENCE_COMPLETED',
  'SHIFT_SUMMARY',
]);

export class NotificationsController {
  static async listForUser(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.json(await NotificationsService.listForUser(user.userId));
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.json(await NotificationsService.markAllRead(user.userId));
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.json(await NotificationsService.markRead(user.userId, req.params.id));
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async getPreferences(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.json(await NotificationsService.getPreferences(user.userId, user.role));
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async updatePreferences(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      const updated = await NotificationsService.updatePreferences(user.userId, user.role, req.body || {});
      return res.json(updated);
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async getVapidPublicKey(_req: AuthenticatedRequest, res: Response) {
    try {
      return res.json(NotificationsService.getVapidPublicKeyInfo());
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async subscribe(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      const saved = await NotificationsService.subscribeDevice(
        user.userId,
        req.body || {},
        req.get('user-agent') || null,
      );
      return res.status(201).json(saved);
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async unsubscribe(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      const bodyEndpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null;
      const queryEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : null;
      const result = await NotificationsService.unsubscribeDevice(user.userId, bodyEndpoint || queryEndpoint);
      return res.json(result);
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async shiftSummary(_req: AuthenticatedRequest, res: Response) {
    try {
      return res.json(await NotificationsService.getShiftSummary());
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async send(req: AuthenticatedRequest, res: Response) {
    try {
      const rawUserId = req.body?.userId;
      const rawOccId = req.body?.occurrenceId;
      const rawType = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : 'SHIFT_SUMMARY';

      if (!VALID_MANUAL_EVENTS.has(rawType as NotificationEventType)) {
        throw new NotificationInputError('Tipo de notificação inválido.');
      }

      const userId = rawUserId !== undefined && rawUserId !== null && rawUserId !== '' ? Number(rawUserId) : undefined;
      if (userId !== undefined && (!Number.isSafeInteger(userId) || userId < 1)) {
        throw new NotificationInputError('Usuário de destino inválido.');
      }

      const occurrenceId = rawOccId !== undefined && rawOccId !== null && rawOccId !== '' ? Number(rawOccId) : null;
      if (occurrenceId !== null && (!Number.isSafeInteger(occurrenceId) || occurrenceId < 1)) {
        throw new NotificationInputError('Ocorrência inválida.');
      }

      const result = await NotificationsService.sendManualOrInternal({
        userId,
        occurrenceId,
        type: rawType as NotificationEventType,
        sector: typeof req.body?.sector === 'string' ? req.body.sector : null,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        bodyPreview: typeof req.body?.bodyPreview === 'string' ? req.body.bodyPreview : undefined,
      });

      return res.status(201).json(result);
    } catch (error) {
      return respondError(res, error);
    }
  }

  static async escalate(_req: AuthenticatedRequest, res: Response) {
    try {
      return res.json(await NotificationsService.runEscalationSweep());
    } catch (error) {
      return respondError(res, error);
    }
  }
}
