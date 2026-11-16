import { sendNotification, setVapidDetails } from 'web-push';
import {
  buildGenericNotificationCopy,
  isValidClockTime,
  isWithinQuietHours,
  normalizeNotificationScope,
  safeSectorLabel,
  shouldNotifyUserForOccurrenceEvent,
  validatePushSubscriptionPayload,
  type NotificationEventType,
} from './notification-rules.ts';
import { NotificationsRepository } from './notifications.repository.ts';

export class NotificationInputError extends Error {}
export class NotificationNotFoundError extends Error {}

let vapidInitialized = false;
let vapidEnabled = false;
let vapidPublicKey: string | null = null;

function normalizeVapidSubject(rawSubject?: string): string {
  const trimmed = (rawSubject || '').trim();
  if (!trimmed) return 'mailto:pcp@flashengenharia.com.br';
  if (/^mailto:/i.test(trimmed)) return `mailto:${trimmed.slice(7).trim()}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return trimmed;
}

function ensureVapidConfigured() {
  if (vapidInitialized) return;
  vapidInitialized = true;
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT);

  if (!pub || !priv) {
    vapidEnabled = false;
    vapidPublicKey = null;
    return;
  }
  try {
    setVapidDetails(subject, pub, priv);
    vapidEnabled = true;
    vapidPublicKey = pub;
  } catch (error) {
    console.warn('Configuração VAPID inválida; envio de Web Push desativado até correção das variáveis de ambiente.', error);
    vapidEnabled = false;
    vapidPublicKey = null;
  }
}

export interface OccurrenceNotificationTarget {
  id: number;
  sector: string;
  assigneeId: number | null;
  requesterId: number | null;
}

export class NotificationsService {
  static getVapidPublicKeyInfo() {
    ensureVapidConfigured();
    return {
      enabled: vapidEnabled,
      publicKey: vapidPublicKey,
    };
  }

  static async listForUser(userId: number) {
    const [inbox, shiftSummary] = await Promise.all([
      NotificationsRepository.listForUser(userId, 30),
      NotificationsRepository.getShiftBacklogSummary(),
    ]);
    return {
      items: inbox.items,
      unreadCount: inbox.unreadCount,
      shiftSummary,
    };
  }

  static async markRead(userId: number, rawId: string) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new NotificationInputError('Identificador de notificação inválido.');
    }
    const updated = await NotificationsRepository.markRead(userId, id);
    if (!updated) throw new NotificationNotFoundError('Notificação não encontrada.');
    return updated;
  }

  static async markAllRead(userId: number) {
    const count = await NotificationsRepository.markAllRead(userId);
    return { markedCount: count };
  }

  static getPreferences(userId: number, role: string) {
    return NotificationsRepository.getPreferences(userId, role);
  }

  static async updatePreferences(userId: number, role: string, input: Record<string, unknown>) {
    const current = await NotificationsRepository.getPreferences(userId, role);
    const scope = input.scope !== undefined
      ? normalizeNotificationScope(input.scope, current.scope)
      : current.scope;
    const quietHoursEnabled =
      typeof input.quietHoursEnabled === 'boolean'
        ? input.quietHoursEnabled
        : current.quietHoursEnabled;
    const quietHoursStart =
      input.quietHoursStart !== undefined
        ? isValidClockTime(input.quietHoursStart)
          ? input.quietHoursStart.trim()
          : (() => {
              throw new NotificationInputError('Horário inicial de silêncio inválido (use HH:MM).');
            })()
        : current.quietHoursStart;
    const quietHoursEnd =
      input.quietHoursEnd !== undefined
        ? isValidClockTime(input.quietHoursEnd)
          ? input.quietHoursEnd.trim()
          : (() => {
              throw new NotificationInputError('Horário final de silêncio inválido (use HH:MM).');
            })()
        : current.quietHoursEnd;

    return NotificationsRepository.upsertPreferences(userId, {
      scope,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
    });
  }

  static async subscribeDevice(userId: number, input: Record<string, unknown>, userAgent?: string | null) {
    const valid = validatePushSubscriptionPayload(input);
    if (!valid) {
      throw new NotificationInputError('Assinatura Web Push inválida.');
    }
    const cleanUa = userAgent ? String(userAgent).slice(0, 240) : null;
    const saved = await NotificationsRepository.upsertPushSubscription({
      userId,
      endpoint: valid.endpoint,
      p256dh: valid.p256dh,
      auth: valid.auth,
      deviceLabel: valid.deviceLabel,
      userAgent: cleanUa,
    });
    return saved;
  }

  static async unsubscribeDevice(userId: number, endpoint?: string | null) {
    const removed = await NotificationsRepository.removePushSubscription(userId, endpoint);
    return { removed };
  }

  static getShiftSummary() {
    return NotificationsRepository.getShiftBacklogSummary();
  }

  static async notifyOccurrenceEvent(input: {
    occurrence: OccurrenceNotificationTarget;
    eventType: NotificationEventType;
    actorId?: number | null;
  }) {
    try {
      const now = new Date();
      const [recipients, pendingMap] = await Promise.all([
        NotificationsRepository.listActiveRecipientsWithPrefs(),
        NotificationsRepository.countPendingBySector(),
      ]);

      const sector = safeSectorLabel(input.occurrence.sector);
      const pendingCount = pendingMap.get(sector) || 1;
      const copy = buildGenericNotificationCopy({
        eventType: input.eventType,
        sector,
        pendingCount,
      });

      const matchedRecipients = recipients.filter((user) =>
        shouldNotifyUserForOccurrenceEvent({
          userId: user.id,
          role: user.role,
          department: user.department,
          scope: user.scope,
          occurrenceSector: sector,
          assigneeId: input.occurrence.assigneeId,
          requesterId: input.occurrence.requesterId,
          eventType: input.eventType,
          actorId: input.actorId,
        }),
      );

      if (!matchedRecipients.length) return { notifiedUsers: 0, pushSent: 0 };

      await NotificationsRepository.insertNotifications(
        matchedRecipients.map((user) => ({
          userId: user.id,
          occurrenceId: input.occurrence.id,
          type: input.eventType,
          title: copy.title,
          bodyPreview: copy.bodyPreview,
        })),
      );

      const pushCandidateUserIds = matchedRecipients
        .filter((user) => !isWithinQuietHours(now, user.quietHoursEnabled, user.quietHoursStart, user.quietHoursEnd))
        .map((user) => user.id);

      const pushSent = await this.dispatchWebPushToUsers(pushCandidateUserIds, {
        title: copy.title,
        body: copy.bodyPreview,
        url: `/?tab=occurrences&occurrenceId=${input.occurrence.id}`,
        tag: `nexuspcp-occ-${input.occurrence.id}-${input.eventType.toLowerCase()}`,
      });

      return { notifiedUsers: matchedRecipients.length, pushSent };
    } catch (error) {
      console.error('Failed to dispatch occurrence notification:', error);
      return { notifiedUsers: 0, pushSent: 0 };
    }
  }

  static async sendManualOrInternal(input: {
    userId?: number;
    occurrenceId?: number | null;
    type?: NotificationEventType;
    sector?: string | null;
    title?: string;
    bodyPreview?: string;
  }) {
    const eventType: NotificationEventType = input.type || 'SHIFT_SUMMARY';
    const copy = buildGenericNotificationCopy({
      eventType,
      sector: input.sector,
    });
    const finalTitle = (input.title || copy.title).trim().slice(0, 100);
    const finalBody = (input.bodyPreview || copy.bodyPreview).trim().slice(0, 220);

    let targetUserIds: number[] = [];
    if (input.userId && Number.isSafeInteger(input.userId) && input.userId > 0) {
      targetUserIds = [input.userId];
    } else {
      const activeUsers = await NotificationsRepository.listActiveRecipientsWithPrefs();
      targetUserIds = activeUsers.map((u) => u.id);
    }

    if (!targetUserIds.length) return { notifiedUsers: 0, pushSent: 0 };

    await NotificationsRepository.insertNotifications(
      targetUserIds.map((userId) => ({
        userId,
        occurrenceId: input.occurrenceId ?? null,
        type: eventType,
        title: finalTitle,
        bodyPreview: finalBody,
      })),
    );

    const url = input.occurrenceId
      ? `/?tab=occurrences&occurrenceId=${input.occurrenceId}`
      : '/?tab=occurrences';
    const pushSent = await this.dispatchWebPushToUsers(targetUserIds, {
      title: finalTitle,
      body: finalBody,
      url,
      tag: `nexuspcp-${eventType.toLowerCase()}`,
    });

    return { notifiedUsers: targetUserIds.length, pushSent };
  }

  private static async dispatchWebPushToUsers(
    userIds: number[],
    payload: { title: string; body: string; url: string; tag: string },
  ): Promise<number> {
    if (!userIds.length) return 0;
    ensureVapidConfigured();
    if (!vapidEnabled) return 0;

    const subs = await NotificationsRepository.listActiveSubscriptionsForUsers(userIds);
    if (!subs.length) return 0;

    const jsonPayload = JSON.stringify(payload);
    const succeededIds: number[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            jsonPayload,
            { TTL: 3600 },
          );
          succeededIds.push(sub.id);
        } catch (err: any) {
          const status = Number(err?.statusCode || 0);
          if (status === 404 || status === 410) {
            await NotificationsRepository.deactivateSubscriptionByEndpoint(sub.endpoint).catch(() => undefined);
          } else {
            console.warn('Web Push delivery failed for subscription:', sub.id, status || err?.message);
          }
        }
      }),
    );

    if (succeededIds.length) {
      await NotificationsRepository.touchSubscriptionsUsed(succeededIds).catch(() => undefined);
    }
    return succeededIds.length;
  }

  static async runEscalationSweep(now = new Date()) {
    let escalated30m = 0;
    let slaBreached = 0;

    const [candidates30m, breachCandidates] = await Promise.all([
      NotificationsRepository.findEscalationCandidates30m(now),
      NotificationsRepository.findSlaBreachCandidates(now),
    ]);

    for (const occ of candidates30m) {
      const claimed = await NotificationsRepository.claim30mEscalation(occ.id, now);
      if (!claimed) continue;
      await this.notifyOccurrenceEvent({
        occurrence: {
          id: claimed.id,
          sector: claimed.sector,
          assigneeId: claimed.assigneeId,
          requesterId: claimed.requesterId,
        },
        eventType: 'OCCURRENCE_ESCALATED_30M',
      });
      escalated30m += 1;
    }

    for (const occ of breachCandidates) {
      const claimed = await NotificationsRepository.claimSlaBreach(occ.id, now);
      if (!claimed) continue;
      await this.notifyOccurrenceEvent({
        occurrence: {
          id: claimed.id,
          sector: claimed.sector,
          assigneeId: claimed.assigneeId,
          requesterId: claimed.requesterId,
        },
        eventType: 'OCCURRENCE_SLA_BREACH',
      });
      slaBreached += 1;
    }

    return { escalated30m, slaBreached };
  }
}

let escalationTimer: ReturnType<typeof setInterval> | null = null;
let escalationInFlight = false;

export function startNotificationEscalationWorker(intervalMs = 60_000) {
  if (escalationTimer) return;
  const tick = async () => {
    if (escalationInFlight) return;
    escalationInFlight = true;
    try {
      await NotificationsService.runEscalationSweep();
    } catch (error) {
      console.error('Notification escalation sweep failed:', error);
    } finally {
      escalationInFlight = false;
    }
  };
  escalationTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  escalationTimer.unref?.();
}

export function stopNotificationEscalationWorker() {
  if (escalationTimer) {
    clearInterval(escalationTimer);
    escalationTimer = null;
  }
}
