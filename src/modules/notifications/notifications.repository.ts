import { and, desc, eq, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  notificationPreferences,
  notifications,
  productionOccurrences,
  pushSubscriptions,
  users,
} from '../../db/schema.ts';
import {
  defaultScopeForRole,
  normalizeNotificationScope,
  type NotificationEventType,
  type NotificationScope,
} from './notification-rules.ts';

export class NotificationsRepository {
  static async listForUser(userId: number, limit = 30) {
    const [items, unreadRows] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
    ]);

    return {
      items,
      unreadCount: Number(unreadRows[0]?.count || 0),
    };
  }

  static async markRead(userId: number, notificationId: number) {
    const now = new Date();
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();
    return updated || null;
  }

  static async markAllRead(userId: number) {
    const now = new Date();
    const updated = await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });
    return updated.length;
  }

  static async getPreferences(userId: number, role: string) {
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    const activeSubs = await db
      .select({ count: sql<number>`count(*)` })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)));

    return {
      scope: normalizeNotificationScope(row?.scope, defaultScopeForRole(role)),
      quietHoursEnabled: row?.quietHoursEnabled ?? false,
      quietHoursStart: row?.quietHoursStart ?? '22:00',
      quietHoursEnd: row?.quietHoursEnd ?? '06:00',
      activeSubscriptionsCount: Number(activeSubs[0]?.count || 0),
    };
  }

  static async upsertPreferences(
    userId: number,
    input: {
      scope: NotificationScope;
      quietHoursEnabled: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
    },
  ) {
    const now = new Date();
    const [saved] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        scope: input.scope,
        quietHoursEnabled: input.quietHoursEnabled,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          scope: input.scope,
          quietHoursEnabled: input.quietHoursEnabled,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          updatedAt: now,
        },
      })
      .returning();
    return saved;
  }

  static async upsertPushSubscription(input: {
    userId: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceLabel: string | null;
    userAgent: string | null;
  }) {
    const now = new Date();
    const [saved] = await db
      .insert(pushSubscriptions)
      .values({
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        deviceLabel: input.deviceLabel,
        userAgent: input.userAgent,
        createdAt: now,
        lastUsedAt: now,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: input.userId,
          p256dh: input.p256dh,
          auth: input.auth,
          deviceLabel: input.deviceLabel,
          userAgent: input.userAgent,
          lastUsedAt: now,
          isActive: true,
        },
      })
      .returning({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        deviceLabel: pushSubscriptions.deviceLabel,
        isActive: pushSubscriptions.isActive,
        lastUsedAt: pushSubscriptions.lastUsedAt,
      });
    return saved;
  }

  static async removePushSubscription(userId: number, endpoint?: string | null) {
    if (endpoint && endpoint.trim()) {
      const removed = await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint.trim())))
        .returning({ id: pushSubscriptions.id });
      return removed.length;
    }
    const removed = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .returning({ id: pushSubscriptions.id });
    return removed.length;
  }

  static async deactivateSubscriptionByEndpoint(endpoint: string) {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  static async listActiveRecipientsWithPrefs() {
    const rows = await db
      .select({
        id: users.id,
        role: users.role,
        department: users.department,
        scope: notificationPreferences.scope,
        quietHoursEnabled: notificationPreferences.quietHoursEnabled,
        quietHoursStart: notificationPreferences.quietHoursStart,
        quietHoursEnd: notificationPreferences.quietHoursEnd,
      })
      .from(users)
      .leftJoin(notificationPreferences, eq(users.id, notificationPreferences.userId))
      .where(eq(users.status, 'ACTIVE'));

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      department: row.department,
      scope: normalizeNotificationScope(row.scope, defaultScopeForRole(row.role)),
      quietHoursEnabled: row.quietHoursEnabled ?? false,
      quietHoursStart: row.quietHoursStart ?? '22:00',
      quietHoursEnd: row.quietHoursEnd ?? '06:00',
    }));
  }

  static async countPendingBySector() {
    const rows = await db
      .select({
        sector: productionOccurrences.sector,
        count: sql<number>`count(*)`,
      })
      .from(productionOccurrences)
      .where(notInArray(productionOccurrences.status, ['CLOSED', 'CONCLUIDA', 'CANCELADA']))
      .groupBy(productionOccurrences.sector);

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.sector, Number(row.count || 0));
    }
    return map;
  }

  static async insertNotifications(
    entries: Array<{
      userId: number;
      occurrenceId: number | null;
      type: NotificationEventType;
      title: string;
      bodyPreview: string;
    }>,
  ) {
    if (!entries.length) return [];
    return db.insert(notifications).values(entries).returning();
  }

  static async listActiveSubscriptionsForUsers(userIds: number[]) {
    if (!userIds.length) return [];
    return db
      .select()
      .from(pushSubscriptions)
      .where(and(inArray(pushSubscriptions.userId, userIds), eq(pushSubscriptions.isActive, true)));
  }

  static async touchSubscriptionsUsed(ids: number[]) {
    if (!ids.length) return;
    await db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(inArray(pushSubscriptions.id, ids));
  }

  static async getShiftBacklogSummary() {
    const now = new Date();
    const [totals] = await db
      .select({
        totalOpen: sql<number>`count(*)`,
        slaBreached: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.slaDueAt} <= ${now})`,
        unassigned: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.assigneeId} IS NULL)`,
        critical: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.priority} = 'CRITICA')`,
      })
      .from(productionOccurrences)
      .where(notInArray(productionOccurrences.status, ['CLOSED', 'CONCLUIDA', 'CANCELADA']));

    const bySector = await db
      .select({
        sector: productionOccurrences.sector,
        openCount: sql<number>`count(*)`,
        breachedCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.slaDueAt} <= ${now})`,
      })
      .from(productionOccurrences)
      .where(notInArray(productionOccurrences.status, ['CLOSED', 'CONCLUIDA', 'CANCELADA']))
      .groupBy(productionOccurrences.sector);

    return {
      totalOpen: Number(totals?.totalOpen || 0),
      slaBreached: Number(totals?.slaBreached || 0),
      unassigned: Number(totals?.unassigned || 0),
      critical: Number(totals?.critical || 0),
      bySector: bySector.map((row) => ({
        sector: row.sector,
        openCount: Number(row.openCount || 0),
        breachedCount: Number(row.breachedCount || 0),
      })),
      generatedAt: now.toISOString(),
    };
  }

  static async findEscalationCandidates30m(now: Date) {
    const threshold = new Date(now.getTime() - 30 * 60_000);
    return db
      .select()
      .from(productionOccurrences)
      .where(
        and(
          inArray(productionOccurrences.status, ['ABERTA', 'OPEN']),
          isNull(productionOccurrences.firstResponseAt),
          isNull(productionOccurrences.notified30mAt),
          lte(productionOccurrences.openedAt, threshold),
        ),
      )
      .limit(50);
  }

  static async claim30mEscalation(occurrenceId: number, now: Date) {
    const [claimed] = await db
      .update(productionOccurrences)
      .set({ notified30mAt: now })
      .where(and(eq(productionOccurrences.id, occurrenceId), isNull(productionOccurrences.notified30mAt)))
      .returning();
    return claimed || null;
  }

  static async findSlaBreachCandidates(now: Date) {
    return db
      .select()
      .from(productionOccurrences)
      .where(
        and(
          notInArray(productionOccurrences.status, ['CLOSED', 'CONCLUIDA', 'CANCELADA']),
          isNull(productionOccurrences.notifiedSlaBreachAt),
          lte(productionOccurrences.slaDueAt, now),
        ),
      )
      .limit(50);
  }

  static async claimSlaBreach(occurrenceId: number, now: Date) {
    const [claimed] = await db
      .update(productionOccurrences)
      .set({ notifiedSlaBreachAt: now })
      .where(and(eq(productionOccurrences.id, occurrenceId), isNull(productionOccurrences.notifiedSlaBreachAt)))
      .returning();
    return claimed || null;
  }
}
