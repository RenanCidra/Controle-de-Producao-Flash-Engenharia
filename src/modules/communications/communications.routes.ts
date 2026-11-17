import express, { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { createPool, db, withDbRetry } from '../../db/index.ts';
import { communicationDirectConversations, communicationDirectMembers, communicationDirectMessages, communicationGroupMembers, communicationGroups, communicationMessages, communicationMessageReactions, users } from '../../db/schema.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';
import {
  MAX_IMAGE_BYTES,
  MediaValidationError,
  deletePrivateFile,
  savePrivateFile,
  streamPrivateFile,
  validateDrawingData,
  validateImageUpload,
} from '../../lib/private-storage.ts';
import { AuditService } from '../../services/audit.service.ts';

const router = Router();
router.use(requirePermission('communications:read'));
const MESSAGE_PAGE_SIZE = 30;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_DURATION_MS = 120_000;
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);
const IMAGE_RAW_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);
const asyncHandler = (handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req as AuthenticatedRequest, res).catch(next); };

function messagePageOptions(req: Request) {
  const rawBefore = req.query.beforeId, rawAfter = req.query.afterId, rawChangedAfter = req.query.changedAfter;
  const beforeId = typeof rawBefore === 'string' ? Number(rawBefore) : null;
  const afterId = typeof rawAfter === 'string' ? Number(rawAfter) : null;
  const changedAfterDate = typeof rawChangedAfter === 'string' ? new Date(rawChangedAfter) : null;
  const requestedLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : MESSAGE_PAGE_SIZE;
  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  return {
    beforeId: Number.isSafeInteger(beforeId) && beforeId! > 0 ? beforeId : null,
    afterId: Number.isSafeInteger(afterId) && afterId! > 0 ? afterId : null,
    changedAfter: changedAfterDate && Number.isFinite(changedAfterDate.getTime()) ? changedAfterDate : null,
    search: rawSearch,
    limit: Number.isSafeInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : MESSAGE_PAGE_SIZE,
  };
}

function messageSearchPredicate(body: AnyColumn, authorName: AnyColumn, search: string) {
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return or(ilike(body, pattern), ilike(authorName, pattern))!;
}

type MessageTableCols = {
  replyToMessageId: boolean;
  audioStoragePath: boolean;
  audioMimeType: boolean;
  audioDurationMs: boolean;
  deletedAt: boolean;
  deletedByUid: boolean;
  updatedAt: boolean;
  attachmentType: boolean;
  imageStoragePath: boolean;
  imageMimeType: boolean;
  imageSizeBytes: boolean;
  drawingData: boolean;
};

type CommunicationSchemaSupport = {
  directMessages: MessageTableCols;
  groupMessages: MessageTableCols;
  directMembersLastReadAt: boolean;
  directMembersHistoryClearedAt: boolean;
  groupMembersLastReadAt: boolean;
  groupMembersHistoryClearedAt: boolean;
  hasReactionsTable: boolean;
  userAvatarUrl: boolean;
};

let schemaSupportCache: { value: CommunicationSchemaSupport; expiresAt: number } | null = null;

function buildMessageTableCols(cols: Set<string>): MessageTableCols {
  return {
    replyToMessageId: cols.has('reply_to_message_id'),
    audioStoragePath: cols.has('audio_storage_path'),
    audioMimeType: cols.has('audio_mime_type'),
    audioDurationMs: cols.has('audio_duration_ms'),
    deletedAt: cols.has('deleted_at'),
    deletedByUid: cols.has('deleted_by_uid'),
    updatedAt: cols.has('updated_at'),
    attachmentType: cols.has('attachment_type'),
    imageStoragePath: cols.has('image_storage_path'),
    imageMimeType: cols.has('image_mime_type'),
    imageSizeBytes: cols.has('image_size_bytes'),
    drawingData: cols.has('drawing_data'),
  };
}

async function getCommunicationSchemaSupport(): Promise<CommunicationSchemaSupport> {
  const now = Date.now();
  if (schemaSupportCache && schemaSupportCache.expiresAt > now) {
    return schemaSupportCache.value;
  }
  const pool = createPool();
  const tables = [
    'communication_direct_messages',
    'communication_messages',
    'communication_direct_members',
    'communication_group_members',
    'communication_message_reactions',
    'users',
  ];
  const { rows } = await withDbRetry(() =>
    pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [tables],
    ),
  );
  const byTable = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = byTable.get(row.table_name);
    if (!set) byTable.set(row.table_name, set = new Set());
    set.add(row.column_name);
  }
  const dm = byTable.get('communication_direct_messages') ?? new Set<string>();
  const gm = byTable.get('communication_messages') ?? new Set<string>();
  const dMem = byTable.get('communication_direct_members') ?? new Set<string>();
  const gMem = byTable.get('communication_group_members') ?? new Set<string>();
  const reactions = byTable.get('communication_message_reactions') ?? new Set<string>();
  const userCols = byTable.get('users') ?? new Set<string>();

  const support: CommunicationSchemaSupport = {
    directMessages: buildMessageTableCols(dm),
    groupMessages: buildMessageTableCols(gm),
    directMembersLastReadAt: dMem.has('last_read_at'),
    directMembersHistoryClearedAt: dMem.has('history_cleared_at'),
    groupMembersLastReadAt: gMem.has('last_read_at'),
    groupMembersHistoryClearedAt: gMem.has('history_cleared_at'),
    hasReactionsTable: reactions.has('group_message_id') && reactions.has('direct_message_id'),
    userAvatarUrl: userCols.has('avatar_url'),
  };
  const allComplete =
    Object.values(support.directMessages).every(Boolean)
    && Object.values(support.groupMessages).every(Boolean)
    && support.directMembersLastReadAt
    && support.directMembersHistoryClearedAt
    && support.groupMembersLastReadAt
    && support.groupMembersHistoryClearedAt
    && support.hasReactionsTable
    && support.userAvatarUrl;
  schemaSupportCache = {
    value: support,
    expiresAt: allComplete ? now + 3_600_000 : now + 60_000,
  };
  return support;
}

function directMessageSelectCols(cols: MessageTableCols) {
  return {
    id: communicationDirectMessages.id,
    conversationId: communicationDirectMessages.conversationId,
    authorUid: communicationDirectMessages.authorUid,
    authorName: communicationDirectMessages.authorName,
    body: communicationDirectMessages.body,
    createdAt: communicationDirectMessages.createdAt,
    ...(cols.replyToMessageId ? { replyToMessageId: communicationDirectMessages.replyToMessageId } : {}),
    ...(cols.audioStoragePath ? { audioStoragePath: communicationDirectMessages.audioStoragePath } : {}),
    ...(cols.audioMimeType ? { audioMimeType: communicationDirectMessages.audioMimeType } : {}),
    ...(cols.audioDurationMs ? { audioDurationMs: communicationDirectMessages.audioDurationMs } : {}),
    ...(cols.deletedAt ? { deletedAt: communicationDirectMessages.deletedAt } : {}),
    ...(cols.deletedByUid ? { deletedByUid: communicationDirectMessages.deletedByUid } : {}),
    ...(cols.updatedAt ? { updatedAt: communicationDirectMessages.updatedAt } : {}),
    ...(cols.attachmentType ? { attachmentType: communicationDirectMessages.attachmentType } : {}),
    ...(cols.imageStoragePath ? { imageStoragePath: communicationDirectMessages.imageStoragePath } : {}),
    ...(cols.imageMimeType ? { imageMimeType: communicationDirectMessages.imageMimeType } : {}),
    ...(cols.imageSizeBytes ? { imageSizeBytes: communicationDirectMessages.imageSizeBytes } : {}),
    ...(cols.drawingData ? { drawingData: communicationDirectMessages.drawingData } : {}),
  };
}

function groupMessageSelectCols(cols: MessageTableCols) {
  return {
    id: communicationMessages.id,
    groupId: communicationMessages.groupId,
    authorUid: communicationMessages.authorUid,
    authorName: communicationMessages.authorName,
    body: communicationMessages.body,
    createdAt: communicationMessages.createdAt,
    ...(cols.replyToMessageId ? { replyToMessageId: communicationMessages.replyToMessageId } : {}),
    ...(cols.audioStoragePath ? { audioStoragePath: communicationMessages.audioStoragePath } : {}),
    ...(cols.audioMimeType ? { audioMimeType: communicationMessages.audioMimeType } : {}),
    ...(cols.audioDurationMs ? { audioDurationMs: communicationMessages.audioDurationMs } : {}),
    ...(cols.deletedAt ? { deletedAt: communicationMessages.deletedAt } : {}),
    ...(cols.deletedByUid ? { deletedByUid: communicationMessages.deletedByUid } : {}),
    ...(cols.updatedAt ? { updatedAt: communicationMessages.updatedAt } : {}),
    ...(cols.attachmentType ? { attachmentType: communicationMessages.attachmentType } : {}),
    ...(cols.imageStoragePath ? { imageStoragePath: communicationMessages.imageStoragePath } : {}),
    ...(cols.imageMimeType ? { imageMimeType: communicationMessages.imageMimeType } : {}),
    ...(cols.imageSizeBytes ? { imageSizeBytes: communicationMessages.imageSizeBytes } : {}),
    ...(cols.drawingData ? { drawingData: communicationMessages.drawingData } : {}),
  };
}

type DbExecutor = Pick<typeof db, 'execute'>;

type MessageInsertFields = {
  body: string;
  authorUid: string;
  authorName: string;
  replyToMessageId?: number | null;
  audioStoragePath?: string;
  audioMimeType?: string;
  audioDurationMs?: number;
  attachmentType?: string;
  imageStoragePath?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
};

type InsertedMessageRow = {
  id: number;
  conversationId?: number;
  groupId?: number;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: Date;
  replyToMessageId?: number | null;
  audioStoragePath?: string | null;
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
  deletedAt?: Date | null;
  deletedByUid?: string | null;
  updatedAt?: Date;
  attachmentType?: string | null;
  imageStoragePath?: string | null;
  imageMimeType?: string | null;
  imageSizeBytes?: number | null;
  drawingData?: Record<string, unknown> | null;
};

function messageReturningSql(cols: MessageTableCols, parentAliasSql: string): SQL {
  const parts: SQL[] = [
    sql.raw('id'),
    sql.raw(parentAliasSql),
    sql.raw('author_uid AS "authorUid"'),
    sql.raw('author_name AS "authorName"'),
    sql.raw('body'),
    sql.raw('created_at AS "createdAt"'),
  ];
  if (cols.replyToMessageId) parts.push(sql.raw('reply_to_message_id AS "replyToMessageId"'));
  if (cols.audioStoragePath) parts.push(sql.raw('audio_storage_path AS "audioStoragePath"'));
  if (cols.audioMimeType) parts.push(sql.raw('audio_mime_type AS "audioMimeType"'));
  if (cols.audioDurationMs) parts.push(sql.raw('audio_duration_ms AS "audioDurationMs"'));
  if (cols.deletedAt) parts.push(sql.raw('deleted_at AS "deletedAt"'));
  if (cols.deletedByUid) parts.push(sql.raw('deleted_by_uid AS "deletedByUid"'));
  if (cols.updatedAt) parts.push(sql.raw('updated_at AS "updatedAt"'));
  if (cols.attachmentType) parts.push(sql.raw('attachment_type AS "attachmentType"'));
  if (cols.imageStoragePath) parts.push(sql.raw('image_storage_path AS "imageStoragePath"'));
  if (cols.imageMimeType) parts.push(sql.raw('image_mime_type AS "imageMimeType"'));
  if (cols.imageSizeBytes) parts.push(sql.raw('image_size_bytes AS "imageSizeBytes"'));
  if (cols.drawingData) parts.push(sql.raw('drawing_data AS "drawingData"'));
  return sql.join(parts, sql.raw(', '));
}

async function insertMessageRow(
  executor: DbExecutor,
  tableName: 'communication_direct_messages' | 'communication_messages',
  parentColName: 'conversation_id' | 'group_id',
  parentAliasSql: 'conversation_id AS "conversationId"' | 'group_id AS "groupId"',
  parentId: number,
  cols: MessageTableCols,
  fields: MessageInsertFields,
): Promise<InsertedMessageRow> {
  const columnNames: SQL[] = [
    sql.raw(parentColName),
    sql.raw('body'),
    sql.raw('author_uid'),
    sql.raw('author_name'),
  ];
  const columnValues: SQL[] = [
    sql`${parentId}`,
    sql`${fields.body}`,
    sql`${fields.authorUid}`,
    sql`${fields.authorName}`,
  ];
  if (cols.replyToMessageId && fields.replyToMessageId !== undefined) {
    columnNames.push(sql.raw('reply_to_message_id'));
    columnValues.push(sql`${fields.replyToMessageId}`);
  }
  if (cols.audioStoragePath && fields.audioStoragePath !== undefined) {
    columnNames.push(sql.raw('audio_storage_path'));
    columnValues.push(sql`${fields.audioStoragePath}`);
  }
  if (cols.audioMimeType && fields.audioMimeType !== undefined) {
    columnNames.push(sql.raw('audio_mime_type'));
    columnValues.push(sql`${fields.audioMimeType}`);
  }
  if (cols.audioDurationMs && fields.audioDurationMs !== undefined) {
    columnNames.push(sql.raw('audio_duration_ms'));
    columnValues.push(sql`${fields.audioDurationMs}`);
  }
  if (cols.attachmentType && fields.attachmentType !== undefined) {
    columnNames.push(sql.raw('attachment_type'));
    columnValues.push(sql`${fields.attachmentType}`);
  }
  if (cols.imageStoragePath && fields.imageStoragePath !== undefined) {
    columnNames.push(sql.raw('image_storage_path'));
    columnValues.push(sql`${fields.imageStoragePath}`);
  }
  if (cols.imageMimeType && fields.imageMimeType !== undefined) {
    columnNames.push(sql.raw('image_mime_type'));
    columnValues.push(sql`${fields.imageMimeType}`);
  }
  if (cols.imageSizeBytes && fields.imageSizeBytes !== undefined) {
    columnNames.push(sql.raw('image_size_bytes'));
    columnValues.push(sql`${fields.imageSizeBytes}`);
  }

  const query = sql`
    INSERT INTO ${sql.raw(tableName)} (${sql.join(columnNames, sql.raw(', '))})
    VALUES (${sql.join(columnValues, sql.raw(', '))})
    RETURNING ${messageReturningSql(cols, parentAliasSql)}
  `;
  const result = await executor.execute(query);
  return result.rows[0] as InsertedMessageRow;
}

async function insertDirectMembers(executor: DbExecutor, conversationId: number, userIds: number[]) {
  const valueTuples = userIds.map((userId) => sql`(${conversationId}, ${userId})`);
  await executor.execute(sql`
    INSERT INTO communication_direct_members (conversation_id, user_id)
    VALUES ${sql.join(valueTuples, sql.raw(', '))}
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `);
}

async function insertGroupMembers(executor: DbExecutor, groupId: number, userIds: number[], addedByUid: string) {
  const valueTuples = userIds.map((userId) => sql`(${groupId}, ${userId}, ${addedByUid})`);
  await executor.execute(sql`
    INSERT INTO communication_group_members (group_id, user_id, added_by_uid)
    VALUES ${sql.join(valueTuples, sql.raw(', '))}
    ON CONFLICT (group_id, user_id) DO NOTHING
  `);
}

function publicMessage<T extends {
  audioStoragePath?: string | null;
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
  imageStoragePath?: string | null;
  attachmentType?: string | null;
  imageMimeType?: string | null;
  imageSizeBytes?: number | null;
  drawingData?: Record<string, unknown> | null;
}>(message: T) {
  const { audioStoragePath, imageStoragePath, ...visibleMessage } = message;
  return {
    ...visibleMessage,
    hasAudio: Boolean(audioStoragePath),
    hasImage: Boolean(imageStoragePath),
    attachmentType: visibleMessage.attachmentType ?? (imageStoragePath ? 'IMAGE' : null),
    imageMimeType: visibleMessage.imageMimeType ?? null,
    imageSizeBytes: visibleMessage.imageSizeBytes ?? null,
    drawingData: visibleMessage.drawingData ?? null,
  };
}

async function messagePagePayload<T extends {
  id: number;
  authorUid: string;
  createdAt: Date;
  audioStoragePath?: string | null;
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
  imageStoragePath?: string | null;
  attachmentType?: string | null;
  imageMimeType?: string | null;
  imageSizeBytes?: number | null;
  drawingData?: Record<string, unknown> | null;
}>(
  rows: T[],
  kind: 'group' | 'direct',
  conversationId: number,
  currentUserId: number,
  currentUid: string,
  support: CommunicationSchemaSupport,
) {
  if (!rows.length) return [];
  const messageIds = rows.map((message) => message.id);
  const [reactionRows, members] = await Promise.all([
    !support.hasReactionsTable
      ? Promise.resolve([] as Array<{ messageId: number | null; userId: number; emoji: string }>)
      : kind === 'group'
        ? db.select({ messageId: communicationMessageReactions.groupMessageId, userId: communicationMessageReactions.userId, emoji: communicationMessageReactions.emoji })
          .from(communicationMessageReactions).where(inArray(communicationMessageReactions.groupMessageId, messageIds))
        : db.select({ messageId: communicationMessageReactions.directMessageId, userId: communicationMessageReactions.userId, emoji: communicationMessageReactions.emoji })
          .from(communicationMessageReactions).where(inArray(communicationMessageReactions.directMessageId, messageIds)),
    kind === 'group'
      ? db.select({
          userId: communicationGroupMembers.userId,
          lastReadAt: support.groupMembersLastReadAt ? communicationGroupMembers.lastReadAt : communicationGroupMembers.addedAt,
          name: users.name,
          department: users.department,
          ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
        })
          .from(communicationGroupMembers).innerJoin(users, eq(users.id, communicationGroupMembers.userId)).where(eq(communicationGroupMembers.groupId, conversationId))
      : db.select({
          userId: communicationDirectMembers.userId,
          lastReadAt: support.directMembersLastReadAt ? communicationDirectMembers.lastReadAt : communicationDirectMembers.addedAt,
          name: users.name,
          department: users.department,
          ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
        })
          .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId)).where(eq(communicationDirectMembers.conversationId, conversationId)),
  ]);
  const reactionsByMessage = new Map<number, Map<string, Set<number>>>();
  for (const reaction of reactionRows) {
    if (reaction.messageId === null) continue;
    let byEmoji = reactionsByMessage.get(reaction.messageId);
    if (!byEmoji) reactionsByMessage.set(reaction.messageId, byEmoji = new Map());
    let usersForEmoji = byEmoji.get(reaction.emoji);
    if (!usersForEmoji) byEmoji.set(reaction.emoji, usersForEmoji = new Set());
    usersForEmoji.add(reaction.userId);
  }
  const recipients = members.filter((member) => member.userId !== currentUserId);
  return rows.map((message) => {
    const reactions = [...(reactionsByMessage.get(message.id)?.entries() || [])]
      .map(([emoji, reactingUsers]) => ({ emoji, count: reactingUsers.size, reactedByMe: reactingUsers.has(currentUserId) }));
    const readBy = recipients.filter((member) => member.lastReadAt >= message.createdAt);
    return {
      ...publicMessage(message),
      reactions,
      ...(message.authorUid === currentUid ? {
        readByCount: readBy.length,
        recipientCount: recipients.length,
        readBy: readBy.map((member) => ({
          userId: member.userId,
          name: member.name,
          department: member.department,
          avatarUrl: 'avatarUrl' in member ? (member.avatarUrl ?? null) : null,
          readAt: member.lastReadAt.toISOString(),
        })),
      } : {}),
    };
  });
}

function normalizedAudioMimeType(req: Request) {
  return (req.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

function parseDuration(req: Request) {
  const duration = Number(req.query.durationMs);
  return Number.isInteger(duration) ? Math.min(MAX_AUDIO_DURATION_MS, Math.max(0, duration)) : null;
}

function validatedAudioBody(req: AuthenticatedRequest, res: Response) {
  const mimeType = normalizedAudioMimeType(req);
  const durationMs = parseDuration(req);
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    res.status(415).json({ error: 'Formato de áudio não suportado. Grave novamente em WebM, Ogg ou MP4.' });
    return null;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_AUDIO_BYTES || durationMs === null || durationMs < 250) {
    res.status(400).json({ error: 'Áudio inválido; o limite é 5 MB e 2 minutos.' });
    return null;
  }
  return { mimeType, durationMs, buffer: req.body as Buffer };
}

async function streamAudio(objectPath: string, mimeType: string, res: Response, onError: (error: unknown) => void) {
  return streamPrivateFile(objectPath, mimeType, 'voice-message', res, onError);
}
async function isGroupMember(groupId: number, userId: number) {
  const [member] = await db.select({ id: communicationGroupMembers.id }).from(communicationGroupMembers)
    .where(and(eq(communicationGroupMembers.groupId, groupId), eq(communicationGroupMembers.userId, userId))).limit(1);
  return Boolean(member);
}
async function isDirectMember(conversationId: number, userId: number) {
  const [member] = await db.select({ id: communicationDirectMembers.id }).from(communicationDirectMembers)
    .where(and(eq(communicationDirectMembers.conversationId, conversationId), eq(communicationDirectMembers.userId, userId))).limit(1);
  return Boolean(member);
}

router.get('/directory', asyncHandler(async (req, res) => {
  const support = await getCommunicationSchemaSupport();
  const directory = await withDbRetry(() =>
    db.select({
      id: users.id,
      name: users.name,
      department: users.department,
      role: users.role,
      ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
    })
      .from(users).where(and(eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'SUPERVISOR', 'OPERATOR']), ne(users.id, req.user!.userId))).orderBy(asc(users.name)).limit(200),
  );
  return res.json(directory.map((entry) => ({ ...entry, avatarUrl: 'avatarUrl' in entry ? (entry.avatarUrl ?? null) : null })));
}));

router.get('/direct', asyncHandler(async (req, res) => {
  const support = await getCommunicationSchemaSupport();
  const payload = await withDbRetry(async () => {
    const mine = await db.select({
      id: communicationDirectConversations.id,
      createdAt: communicationDirectConversations.createdAt,
      ...(support.directMembersLastReadAt ? { lastReadAt: communicationDirectMembers.lastReadAt } : {}),
      ...(support.directMembersHistoryClearedAt ? { historyClearedAt: communicationDirectMembers.historyClearedAt } : {}),
    })
      .from(communicationDirectConversations).innerJoin(communicationDirectMembers, eq(communicationDirectMembers.conversationId, communicationDirectConversations.id))
      .where(eq(communicationDirectMembers.userId, req.user!.userId)).orderBy(desc(communicationDirectConversations.createdAt)).limit(100);
    if (!mine.length) return [];
    const ids = mine.map((conversation) => conversation.id);
    const [others, latestMessages, unreadRows] = await Promise.all([
      db.select({
        conversationId: communicationDirectMembers.conversationId,
        userId: users.id,
        name: users.name,
        department: users.department,
        role: users.role,
        ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
      })
        .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId))
        .where(and(inArray(communicationDirectMembers.conversationId, ids), ne(communicationDirectMembers.userId, req.user!.userId))),
      db.selectDistinctOn([communicationDirectMessages.conversationId], {
        conversationId: communicationDirectMessages.conversationId,
        body: communicationDirectMessages.body,
        authorUid: communicationDirectMessages.authorUid,
        authorName: communicationDirectMessages.authorName,
        createdAt: communicationDirectMessages.createdAt,
      }).from(communicationDirectMessages).innerJoin(communicationDirectMembers, and(
        eq(communicationDirectMembers.conversationId, communicationDirectMessages.conversationId),
        eq(communicationDirectMembers.userId, req.user!.userId),
      )).where(and(
        inArray(communicationDirectMessages.conversationId, ids),
        ...(support.directMembersHistoryClearedAt ? [or(
          isNull(communicationDirectMembers.historyClearedAt),
          gt(communicationDirectMessages.createdAt, communicationDirectMembers.historyClearedAt),
        )!] : []),
      ))
        .orderBy(communicationDirectMessages.conversationId, desc(communicationDirectMessages.createdAt)),
      support.directMembersLastReadAt
        ? db.select({ conversationId: communicationDirectMembers.conversationId, unreadCount: count() })
          .from(communicationDirectMessages)
          .innerJoin(communicationDirectMembers, and(
            eq(communicationDirectMembers.conversationId, communicationDirectMessages.conversationId),
            eq(communicationDirectMembers.userId, req.user!.userId),
          ))
          .where(and(
            inArray(communicationDirectMessages.conversationId, ids),
            gt(communicationDirectMessages.createdAt, communicationDirectMembers.lastReadAt),
            ne(communicationDirectMessages.authorUid, req.user!.uid),
          ))
          .groupBy(communicationDirectMembers.conversationId)
        : Promise.resolve([] as Array<{ conversationId: number; unreadCount: number }>),
    ]);
    const otherByConversation = new Map(others.map((user) => [user.conversationId, user]));
    const latestByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
    const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row.unreadCount]));
    return mine.flatMap((conversation) => {
      const other = otherByConversation.get(conversation.id);
      return other ? [{
        conversationId: conversation.id,
        id: conversation.id,
        createdAt: conversation.createdAt,
        userId: other.userId,
        name: other.name,
        department: other.department,
        role: other.role,
        avatarUrl: 'avatarUrl' in other ? (other.avatarUrl ?? null) : null,
        lastMessage: latestByConversation.get(conversation.id) || null,
        unreadCount: unreadByConversation.get(conversation.id) || 0,
      }] : [];
    });
  });
  return res.json(payload);
}));

router.get('/direct/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const page = messagePageOptions(req);
  if (page.beforeId && page.afterId) return res.status(400).json({ error: 'Use um único cursor de mensagens.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.directMessages;
  const result = await withDbRetry(async () => {
    const [membership] = await db.select({
      id: communicationDirectMembers.id,
      ...(support.directMembersHistoryClearedAt ? { historyClearedAt: communicationDirectMembers.historyClearedAt } : {}),
    }).from(communicationDirectMembers).where(and(
      eq(communicationDirectMembers.conversationId, id), eq(communicationDirectMembers.userId, req.user!.userId),
    )).limit(1);
    if (!membership) return null;
    const basePredicates = [eq(communicationDirectMessages.conversationId, id)];
    const historyClearedAt = 'historyClearedAt' in membership ? membership.historyClearedAt : null;
    if (historyClearedAt) basePredicates.push(gt(communicationDirectMessages.createdAt, historyClearedAt));
    if (page.search) basePredicates.push(messageSearchPredicate(communicationDirectMessages.body, communicationDirectMessages.authorName, page.search));
    const predicates = [...basePredicates];
    const changeFilters = (afterDate: Date) => [
      ...(cols.updatedAt ? [gt(communicationDirectMessages.updatedAt, afterDate)] : []),
      ...(cols.deletedAt ? [gt(communicationDirectMessages.deletedAt, afterDate)] : []),
    ];
    if (page.beforeId) predicates.push(lt(communicationDirectMessages.id, page.beforeId));
    else if (page.afterId && page.changedAfter) predicates.push(or(gt(communicationDirectMessages.id, page.afterId), ...changeFilters(page.changedAfter))!);
    else if (page.afterId) predicates.push(gt(communicationDirectMessages.id, page.afterId));
    else if (page.changedAfter) predicates.push(or(gt(communicationDirectMessages.createdAt, page.changedAfter), ...changeFilters(page.changedAfter))!);
    const [rows, totalRows] = await Promise.all([
      db.select(directMessageSelectCols(cols)).from(communicationDirectMessages).where(and(...predicates))
        .orderBy(page.afterId ? asc(communicationDirectMessages.id) : desc(communicationDirectMessages.id)).limit(page.limit),
      page.search ? db.select({ total: count() }).from(communicationDirectMessages).where(and(...basePredicates)) : Promise.resolve(null),
    ]);
    const items = await messagePagePayload(page.afterId ? rows : rows.reverse(), 'direct', id, req.user!.userId, req.user!.uid, support);
    return page.search ? { items, total: totalRows?.[0]?.total || 0 } : items;
  });
  if (!result) return res.status(404).json({ error: 'Conversa não encontrada.' });
  return res.json(result);
}));

router.patch('/direct/:id/clear', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  if (!support.directMembersHistoryClearedAt) {
    return res.status(503).json({ error: 'Limpar histórico não está disponível antes da atualização do banco de dados.' });
  }
  const clearedAt = new Date();
  const [membership] = await db.update(communicationDirectMembers).set({
    historyClearedAt: clearedAt,
    ...(support.directMembersLastReadAt ? { lastReadAt: clearedAt } : {}),
  }).where(and(
    eq(communicationDirectMembers.conversationId, id), eq(communicationDirectMembers.userId, req.user!.userId),
  )).returning({ id: communicationDirectMembers.id });
  if (!membership) return res.status(404).json({ error: 'Conversa não encontrada.' });
  return res.json({ success: true, clearedAt });
}));

router.put('/direct/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.hasReactionsTable) return res.status(503).json({ error: 'Reações não estão disponíveis no momento.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({
    id: communicationDirectMessages.id,
    ...(support.directMessages.deletedAt ? { deletedAt: communicationDirectMessages.deletedAt } : {}),
  }).from(communicationDirectMessages)
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message || ('deletedAt' in message && message.deletedAt)) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.insert(communicationMessageReactions).values({ directMessageId: messageId, userId: req.user!.userId, emoji }).onConflictDoNothing();
  if (support.directMessages.updatedAt) {
    await db.update(communicationDirectMessages).set({ updatedAt: new Date() }).where(eq(communicationDirectMessages.id, messageId));
  }
  return res.json({ success: true });
}));

router.delete('/direct/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.hasReactionsTable) return res.status(503).json({ error: 'Reações não estão disponíveis no momento.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ id: communicationDirectMessages.id }).from(communicationDirectMessages)
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.delete(communicationMessageReactions).where(and(eq(communicationMessageReactions.directMessageId, messageId), eq(communicationMessageReactions.userId, req.user!.userId), eq(communicationMessageReactions.emoji, emoji)));
  if (support.directMessages.updatedAt) {
    await db.update(communicationDirectMessages).set({ updatedAt: new Date() }).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId)));
  }
  return res.json({ success: true });
}));

router.delete('/direct/:id/messages/:messageId', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.directMessages;
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({
    id: communicationDirectMessages.id,
    authorUid: communicationDirectMessages.authorUid,
    ...(cols.audioStoragePath ? { audioStoragePath: communicationDirectMessages.audioStoragePath } : {}),
    ...(cols.imageStoragePath ? { imageStoragePath: communicationDirectMessages.imageStoragePath } : {}),
    ...(cols.deletedAt ? { deletedAt: communicationDirectMessages.deletedAt } : {}),
  }).from(communicationDirectMessages).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message || message.authorUid !== req.user!.uid || ('deletedAt' in message && message.deletedAt)) {
    return res.status(404).json({ error: 'Mensagem não encontrada ou sem permissão para apagá-la.' });
  }
  const deletedAt = new Date();
  let deleted: { id: number } | undefined;
  if (cols.deletedAt) {
    [deleted] = await db.update(communicationDirectMessages).set({
      body: 'Mensagem apagada',
      deletedAt,
      ...(cols.deletedByUid ? { deletedByUid: req.user!.uid } : {}),
      ...(cols.audioStoragePath ? { audioStoragePath: null } : {}),
      ...(cols.audioMimeType ? { audioMimeType: null } : {}),
      ...(cols.audioDurationMs ? { audioDurationMs: null } : {}),
      ...(cols.attachmentType ? { attachmentType: null } : {}),
      ...(cols.imageStoragePath ? { imageStoragePath: null } : {}),
      ...(cols.imageMimeType ? { imageMimeType: null } : {}),
      ...(cols.imageSizeBytes ? { imageSizeBytes: null } : {}),
      ...(cols.drawingData ? { drawingData: null } : {}),
      ...(cols.updatedAt ? { updatedAt: deletedAt } : {}),
    })
      .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId), eq(communicationDirectMessages.authorUid, req.user!.uid), isNull(communicationDirectMessages.deletedAt)))
      .returning({ id: communicationDirectMessages.id });
  } else {
    [deleted] = await db.delete(communicationDirectMessages)
      .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId), eq(communicationDirectMessages.authorUid, req.user!.uid)))
      .returning({ id: communicationDirectMessages.id });
  }
  if (!deleted) return res.status(404).json({ error: 'Mensagem não encontrada ou já apagada.' });
  const audioPath = 'audioStoragePath' in message ? message.audioStoragePath : null;
  const imagePath = 'imageStoragePath' in message ? message.imageStoragePath : null;
  if (audioPath) await deletePrivateFile(audioPath).catch((error) => console.error('Failed to remove deleted direct-message audio:', error));
  if (imagePath) await deletePrivateFile(imagePath).catch((error) => console.error('Failed to remove deleted direct-message image:', error));
  await AuditService.record({ userId: req.user!.uid, userEmail: req.user!.loginName, action: 'DELETE', entity: 'SYSTEM', entityId: String(messageId), details: { type: 'COMMUNICATION_DIRECT_MESSAGE', conversationId } }, req);
  return res.json({ success: true });
}));

router.get('/direct/:id/messages/:messageId/audio', asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(conversationId) || conversationId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.directMessages.audioStoragePath || !support.directMessages.audioMimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ path: communicationDirectMessages.audioStoragePath, mimeType: communicationDirectMessages.audioMimeType })
    .from(communicationDirectMessages).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message?.path || !message.mimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  return streamAudio(message.path, message.mimeType, res, () => { if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar o áudio.' }); else res.destroy(); });
}));

router.get('/direct/:id/messages/:messageId/image', asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(conversationId) || conversationId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.directMessages.imageStoragePath || !support.directMessages.imageMimeType) return res.status(404).json({ error: 'Imagem não encontrada.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({
    path: communicationDirectMessages.imageStoragePath,
    mimeType: communicationDirectMessages.imageMimeType,
    ...(support.directMessages.deletedAt ? { deletedAt: communicationDirectMessages.deletedAt } : {}),
  }).from(communicationDirectMessages).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message?.path || !message.mimeType || ('deletedAt' in message && message.deletedAt)) return res.status(404).json({ error: 'Imagem não encontrada.' });
  return streamPrivateFile(message.path, message.mimeType, `chat-direct-${messageId}`, res, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar a imagem.' });
    else res.destroy();
  });
}));

router.put('/direct/:id/messages/:messageId/drawing', requirePermission('communications:write'), allowBodyFields('drawingData'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) {
    return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  }
  const support = await getCommunicationSchemaSupport();
  const cols = support.directMessages;
  if (!cols.drawingData || !cols.imageStoragePath) {
    return res.status(503).json({ error: 'Anotações em imagens não estão disponíveis no momento.' });
  }
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select(directMessageSelectCols(cols)).from(communicationDirectMessages)
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message || ('deletedAt' in message && message.deletedAt) || !('imageStoragePath' in message && message.imageStoragePath)) {
    return res.status(404).json({ error: 'Imagem não encontrada nesta conversa.' });
  }
  let sanitized;
  try {
    sanitized = validateDrawingData(req.body?.drawingData);
  } catch (err) {
    return res.status(400).json({ error: err instanceof MediaValidationError ? err.message : 'Anotação inválida.' });
  }
  const [updated] = await db.update(communicationDirectMessages).set({
    ...(cols.attachmentType ? { attachmentType: sanitized.strokes.length > 0 ? 'DRAWING' : 'IMAGE' } : {}),
    drawingData: sanitized as unknown as Record<string, unknown>,
    ...(cols.updatedAt ? { updatedAt: new Date() } : {}),
  }).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId)))
    .returning(directMessageSelectCols(cols));
  await AuditService.record({
    userId: req.user!.uid,
    userEmail: req.user!.loginName,
    action: 'UPDATE',
    entity: 'SYSTEM',
    entityId: String(messageId),
    details: { type: 'COMMUNICATION_DIRECT_DRAWING', conversationId, strokes: sanitized.strokes.length },
  }, req);
  return res.json(publicMessage(updated));
}));

router.get('/direct/:id/profile', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  const participant = await withDbRetry(async () => {
    if (!await isDirectMember(id, req.user!.userId)) return 'NOT_FOUND' as const;
    const [found] = await db.select({
      id: users.id,
      name: users.name,
      department: users.department,
      role: users.role,
      status: users.status,
      ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
    })
      .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId))
      .where(and(eq(communicationDirectMembers.conversationId, id), ne(users.id, req.user!.userId))).limit(1);
    return found ? { ...found, avatarUrl: 'avatarUrl' in found ? (found.avatarUrl ?? null) : null } : null;
  });
  if (participant === 'NOT_FOUND') return res.status(404).json({ error: 'Conversa não encontrada.' });
  return participant ? res.json(participant) : res.status(404).json({ error: 'Participante não encontrado.' });
}));

router.patch('/direct/:id/read', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  if (!support.directMembersLastReadAt) return res.json({ success: true });
  const [member] = await db.select({ lastReadAt: communicationDirectMembers.lastReadAt }).from(communicationDirectMembers).where(and(
    eq(communicationDirectMembers.conversationId, id),
    eq(communicationDirectMembers.userId, req.user!.userId),
  )).limit(1);
  const readAt = new Date();
  await db.update(communicationDirectMembers).set({ lastReadAt: readAt }).where(and(
    eq(communicationDirectMembers.conversationId, id),
    eq(communicationDirectMembers.userId, req.user!.userId),
  ));
  if (member && support.directMessages.updatedAt) {
    await db.update(communicationDirectMessages).set({ updatedAt: readAt }).where(and(
      eq(communicationDirectMessages.conversationId, id),
      ne(communicationDirectMessages.authorUid, req.user!.uid),
      gt(communicationDirectMessages.createdAt, member.lastReadAt),
    ));
  }
  return res.json({ success: true });
}));

router.post('/direct/messages', requirePermission('communications:write'), allowBodyFields('recipientId', 'body'), asyncHandler(async (req, res) => {
  const recipientId = Number(req.body.recipientId);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(recipientId) || recipientId < 1 || recipientId === req.user!.userId || !body || body.length > 4000) {
    return res.status(400).json({ error: 'Destinatário ou mensagem inválidos.' });
  }
  const support = await getCommunicationSchemaSupport();
  const [recipient] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, recipientId), eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'SUPERVISOR', 'OPERATOR']))).limit(1);
  if (!recipient) return res.status(404).json({ error: 'Usuário ativo não encontrado.' });
  const [lowerId, higherId] = [req.user!.userId, recipientId].sort((left, right) => left - right);
  const directKey = `${lowerId}:${higherId}`;
  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(communicationDirectConversations)
      .values({ directKey, createdByUid: req.user!.uid })
      .onConflictDoNothing({ target: communicationDirectConversations.directKey }).returning();
    let conversation = inserted;
    if (!conversation) {
      [conversation] = await tx.select().from(communicationDirectConversations).where(eq(communicationDirectConversations.directKey, directKey)).limit(1);
    }
    if (!conversation) throw new Error('Não foi possível iniciar a conversa.');
    await insertDirectMembers(tx, conversation.id, [req.user!.userId, recipientId]);
    const message = await insertMessageRow(
      tx,
      'communication_direct_messages',
      'conversation_id',
      'conversation_id AS "conversationId"',
      conversation.id,
      support.directMessages,
      { body, authorUid: req.user!.uid, authorName: req.user!.name },
    );
    return { conversationId: conversation.id, message: publicMessage(message) };
  });
  return res.status(201).json(result);
}));

router.post('/direct/:id/messages', requirePermission('communications:write'), allowBodyFields('body', 'replyToMessageId'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const replyToMessageId = req.body.replyToMessageId == null ? null : Number(req.body.replyToMessageId);
  if (replyToMessageId !== null) {
    const [source] = await db.select({ id: communicationDirectMessages.id }).from(communicationDirectMessages)
      .where(and(eq(communicationDirectMessages.id, replyToMessageId), eq(communicationDirectMessages.conversationId, id))).limit(1);
    if (!Number.isInteger(replyToMessageId) || !source) return res.status(400).json({ error: 'A mensagem respondida não pertence a esta conversa.' });
  }
  const message = await insertMessageRow(
    db,
    'communication_direct_messages',
    'conversation_id',
    'conversation_id AS "conversationId"',
    id,
    support.directMessages,
    {
      body,
      ...(support.directMessages.replyToMessageId ? { replyToMessageId } : {}),
      authorUid: req.user!.uid,
      authorName: req.user!.name,
    },
  );
  return res.status(201).json(publicMessage(message));
}));

router.post('/direct/:id/audio', requirePermission('communications:write'), express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.directMessages;
  if (!cols.audioStoragePath || !cols.audioMimeType || !cols.audioDurationMs) {
    return res.status(503).json({ error: 'Envio de áudio não está disponível no momento.' });
  }
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const audio = validatedAudioBody(req, res);
  if (!audio) return;
  const extension = audio.mimeType === 'audio/ogg' ? 'ogg' : audio.mimeType === 'audio/mp4' ? 'm4a' : audio.mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
  const objectPath = `communications/direct/${id}/${randomUUID()}.${extension}`;
  const storedPath = await savePrivateFile(objectPath, audio.buffer, audio.mimeType);
  try {
    const message = await insertMessageRow(
      db,
      'communication_direct_messages',
      'conversation_id',
      'conversation_id AS "conversationId"',
      id,
      cols,
      {
        body: 'Mensagem de áudio',
        authorUid: req.user!.uid,
        authorName: req.user!.name,
        audioStoragePath: storedPath,
        audioMimeType: audio.mimeType,
        audioDurationMs: audio.durationMs,
      },
    );
    return res.status(201).json(publicMessage(message));
  } catch (error) { await deletePrivateFile(storedPath).catch(() => undefined); throw error; }
}));

router.post('/direct/:id/image', requirePermission('communications:write'), express.raw({ type: IMAGE_RAW_TYPES, limit: MAX_IMAGE_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.directMessages;
  if (!cols.imageStoragePath || !cols.imageMimeType) {
    return res.status(503).json({ error: 'Envio de imagens não está disponível no momento.' });
  }
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: 'Envie uma imagem PNG, JPEG ou WebP de até 5 MB.' });
  let validated;
  try {
    validated = validateImageUpload(req.body, req.get('content-type'));
  } catch (err) {
    return res.status(400).json({ error: err instanceof MediaValidationError ? err.message : 'Imagem inválida.' });
  }
  const caption = typeof req.query.caption === 'string' && req.query.caption.trim()
    ? req.query.caption.trim().slice(0, 500)
    : 'Imagem anexada';
  const objectPath = `communications/direct/${id}/${randomUUID()}.${validated.extension}`;
  const storedPath = await savePrivateFile(objectPath, req.body, validated.mimeType);
  try {
    const message = await insertMessageRow(
      db,
      'communication_direct_messages',
      'conversation_id',
      'conversation_id AS "conversationId"',
      id,
      cols,
      {
        body: caption,
        authorUid: req.user!.uid,
        authorName: req.user!.name,
        ...(cols.attachmentType ? { attachmentType: 'IMAGE' } : {}),
        imageStoragePath: storedPath,
        imageMimeType: validated.mimeType,
        ...(cols.imageSizeBytes ? { imageSizeBytes: req.body.length } : {}),
      },
    );
    await AuditService.record({
      userId: req.user!.uid,
      userEmail: req.user!.loginName,
      action: 'CREATE',
      entity: 'SYSTEM',
      entityId: String(message.id),
      details: { type: 'COMMUNICATION_DIRECT_IMAGE', conversationId: id, sizeBytes: req.body.length },
    }, req);
    return res.status(201).json(publicMessage(message));
  } catch (error) {
    await deletePrivateFile(storedPath).catch(() => undefined);
    throw error;
  }
}));

router.get('/groups', asyncHandler(async (req, res) => {
  const support = await getCommunicationSchemaSupport();
  const payload = await withDbRetry(async () => {
    const groups = await db.select({
      id: communicationGroups.id,
      name: communicationGroups.name,
      sector: communicationGroups.sector,
      createdAt: communicationGroups.createdAt,
      createdByUid: communicationGroups.createdByUid,
      ...(support.groupMembersLastReadAt ? { lastReadAt: communicationGroupMembers.lastReadAt } : {}),
      ...(support.groupMembersHistoryClearedAt ? { historyClearedAt: communicationGroupMembers.historyClearedAt } : {}),
    })
      .from(communicationGroups).innerJoin(communicationGroupMembers, eq(communicationGroupMembers.groupId, communicationGroups.id))
      .where(eq(communicationGroupMembers.userId, req.user!.userId))
      .orderBy(asc(communicationGroups.sector), asc(communicationGroups.name));
    if (!groups.length) return [];
    const groupIds = groups.map((group) => group.id);
    const [latestMessages, unreadRows] = await Promise.all([
      db.selectDistinctOn([communicationMessages.groupId], {
        groupId: communicationMessages.groupId,
        body: communicationMessages.body,
        authorUid: communicationMessages.authorUid,
        authorName: communicationMessages.authorName,
        createdAt: communicationMessages.createdAt,
      }).from(communicationMessages).innerJoin(communicationGroupMembers, and(
        eq(communicationGroupMembers.groupId, communicationMessages.groupId),
        eq(communicationGroupMembers.userId, req.user!.userId),
      )).where(and(
        inArray(communicationMessages.groupId, groupIds),
        ...(support.groupMembersHistoryClearedAt ? [or(
          isNull(communicationGroupMembers.historyClearedAt),
          gt(communicationMessages.createdAt, communicationGroupMembers.historyClearedAt),
        )!] : []),
      ))
        .orderBy(communicationMessages.groupId, desc(communicationMessages.createdAt)),
      support.groupMembersLastReadAt
        ? db.select({ groupId: communicationGroupMembers.groupId, unreadCount: count() })
          .from(communicationMessages)
          .innerJoin(communicationGroupMembers, and(
            eq(communicationGroupMembers.groupId, communicationMessages.groupId),
            eq(communicationGroupMembers.userId, req.user!.userId),
          ))
          .where(and(
            inArray(communicationMessages.groupId, groupIds),
            gt(communicationMessages.createdAt, communicationGroupMembers.lastReadAt),
            ne(communicationMessages.authorUid, req.user!.uid),
          ))
          .groupBy(communicationGroupMembers.groupId)
        : Promise.resolve([] as Array<{ groupId: number; unreadCount: number }>),
    ]);
    const latestByGroup = new Map(latestMessages.map((message) => [message.groupId, message]));
    const unreadByGroup = new Map(unreadRows.map((row) => [row.groupId, row.unreadCount]));
    return groups.map(({ createdByUid, ...group }) => ({
      id: group.id,
      name: group.name,
      sector: group.sector,
      createdAt: group.createdAt,
      canDelete: createdByUid === req.user!.uid,
      lastMessage: latestByGroup.get(group.id) || null,
      unreadCount: unreadByGroup.get(group.id) || 0,
    }));
  });
  return res.json(payload);
}));

router.patch('/groups/:id/clear', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (!support.groupMembersHistoryClearedAt) {
    return res.status(503).json({ error: 'Limpar histórico não está disponível antes da atualização do banco de dados.' });
  }
  const clearedAt = new Date();
  const [membership] = await db.update(communicationGroupMembers).set({
    historyClearedAt: clearedAt,
    ...(support.groupMembersLastReadAt ? { lastReadAt: clearedAt } : {}),
  }).where(and(
    eq(communicationGroupMembers.groupId, id), eq(communicationGroupMembers.userId, req.user!.userId),
  )).returning({ id: communicationGroupMembers.id });
  if (!membership) return res.status(404).json({ error: 'Grupo não encontrado.' });
  return res.json({ success: true, clearedAt });
}));

router.delete('/groups/:id', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  const [group] = await db.select({ name: communicationGroups.name, sector: communicationGroups.sector, createdByUid: communicationGroups.createdByUid })
    .from(communicationGroups).where(eq(communicationGroups.id, id)).limit(1);
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (group.createdByUid !== req.user!.uid) return res.status(403).json({ error: 'Somente quem criou o grupo pode apagá-lo.' });
  const mediaRows = (cols.audioStoragePath || cols.imageStoragePath)
    ? await db.select({
      ...(cols.audioStoragePath ? { audioPath: communicationMessages.audioStoragePath } : {}),
      ...(cols.imageStoragePath ? { imagePath: communicationMessages.imageStoragePath } : {}),
    }).from(communicationMessages).where(eq(communicationMessages.groupId, id))
    : [];
  await AuditService.record({ userId: req.user!.uid, userEmail: req.user!.loginName, action: 'DELETE', entity: 'SYSTEM', entityId: String(id), details: { type: 'COMMUNICATION_GROUP', groupName: group.name, sector: group.sector } }, req);
  await db.delete(communicationGroups).where(eq(communicationGroups.id, id));
  const audioPaths = mediaRows.flatMap((row) => ('audioPath' in row && row.audioPath) ? [row.audioPath] : []);
  const imagePaths = mediaRows.flatMap((row) => ('imagePath' in row && row.imagePath) ? [row.imagePath] : []);
  if (audioPaths.length) {
    const results = await Promise.allSettled(audioPaths.map(path => deletePrivateFile(path)));
    results.filter(result => result.status === 'rejected').forEach(() => console.error('Failed to remove audio files from deleted communication group:', id));
  }
  if (imagePaths.length) {
    await Promise.allSettled(imagePaths.map(path => deletePrivateFile(path)));
  }
  return res.json({ success: true });
}));

router.get('/groups/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const page = messagePageOptions(req);
  if (page.beforeId && page.afterId) return res.status(400).json({ error: 'Use um único cursor de mensagens.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  const result = await withDbRetry(async () => {
    const [membership] = await db.select({
      id: communicationGroupMembers.id,
      ...(support.groupMembersHistoryClearedAt ? { historyClearedAt: communicationGroupMembers.historyClearedAt } : {}),
    }).from(communicationGroupMembers).where(and(
      eq(communicationGroupMembers.groupId, id), eq(communicationGroupMembers.userId, req.user!.userId),
    )).limit(1);
    if (!membership) return null;
    const basePredicates = [eq(communicationMessages.groupId, id)];
    const historyClearedAt = 'historyClearedAt' in membership ? membership.historyClearedAt : null;
    if (historyClearedAt) basePredicates.push(gt(communicationMessages.createdAt, historyClearedAt));
    if (page.search) basePredicates.push(messageSearchPredicate(communicationMessages.body, communicationMessages.authorName, page.search));
    const predicates = [...basePredicates];
    const changeFilters = (afterDate: Date) => [
      ...(cols.updatedAt ? [gt(communicationMessages.updatedAt, afterDate)] : []),
      ...(cols.deletedAt ? [gt(communicationMessages.deletedAt, afterDate)] : []),
    ];
    if (page.beforeId) predicates.push(lt(communicationMessages.id, page.beforeId));
    else if (page.afterId && page.changedAfter) predicates.push(or(gt(communicationMessages.id, page.afterId), ...changeFilters(page.changedAfter))!);
    else if (page.afterId) predicates.push(gt(communicationMessages.id, page.afterId));
    else if (page.changedAfter) predicates.push(or(gt(communicationMessages.createdAt, page.changedAfter), ...changeFilters(page.changedAfter))!);
    const [rows, totalRows] = await Promise.all([
      db.select(groupMessageSelectCols(cols)).from(communicationMessages).where(and(...predicates))
        .orderBy(page.afterId ? asc(communicationMessages.id) : desc(communicationMessages.id)).limit(page.limit),
      page.search ? db.select({ total: count() }).from(communicationMessages).where(and(...basePredicates)) : Promise.resolve(null),
    ]);
    const items = await messagePagePayload(page.afterId ? rows : rows.reverse(), 'group', id, req.user!.userId, req.user!.uid, support);
    return page.search ? { items, total: totalRows?.[0]?.total || 0 } : items;
  });
  if (!result) return res.status(404).json({ error: 'Grupo não encontrado.' });
  return res.json(result);
}));

router.put('/groups/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.hasReactionsTable) return res.status(503).json({ error: 'Reações não estão disponíveis no momento.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({
    id: communicationMessages.id,
    ...(support.groupMessages.deletedAt ? { deletedAt: communicationMessages.deletedAt } : {}),
  }).from(communicationMessages)
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message || ('deletedAt' in message && message.deletedAt)) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.insert(communicationMessageReactions).values({ groupMessageId: messageId, userId: req.user!.userId, emoji }).onConflictDoNothing();
  if (support.groupMessages.updatedAt) {
    await db.update(communicationMessages).set({ updatedAt: new Date() }).where(eq(communicationMessages.id, messageId));
  }
  return res.json({ success: true });
}));

router.delete('/groups/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.hasReactionsTable) return res.status(503).json({ error: 'Reações não estão disponíveis no momento.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ id: communicationMessages.id }).from(communicationMessages)
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.delete(communicationMessageReactions).where(and(eq(communicationMessageReactions.groupMessageId, messageId), eq(communicationMessageReactions.userId, req.user!.userId), eq(communicationMessageReactions.emoji, emoji)));
  if (support.groupMessages.updatedAt) {
    await db.update(communicationMessages).set({ updatedAt: new Date() }).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId)));
  }
  return res.json({ success: true });
}));

router.delete('/groups/:id/messages/:messageId', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({
    id: communicationMessages.id,
    authorUid: communicationMessages.authorUid,
    ...(cols.audioStoragePath ? { audioStoragePath: communicationMessages.audioStoragePath } : {}),
    ...(cols.imageStoragePath ? { imageStoragePath: communicationMessages.imageStoragePath } : {}),
    ...(cols.deletedAt ? { deletedAt: communicationMessages.deletedAt } : {}),
  }).from(communicationMessages).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message || message.authorUid !== req.user!.uid || ('deletedAt' in message && message.deletedAt)) {
    return res.status(404).json({ error: 'Mensagem não encontrada ou sem permissão para apagá-la.' });
  }
  const deletedAt = new Date();
  let deleted: { id: number } | undefined;
  if (cols.deletedAt) {
    [deleted] = await db.update(communicationMessages).set({
      body: 'Mensagem apagada',
      deletedAt,
      ...(cols.deletedByUid ? { deletedByUid: req.user!.uid } : {}),
      ...(cols.audioStoragePath ? { audioStoragePath: null } : {}),
      ...(cols.audioMimeType ? { audioMimeType: null } : {}),
      ...(cols.audioDurationMs ? { audioDurationMs: null } : {}),
      ...(cols.attachmentType ? { attachmentType: null } : {}),
      ...(cols.imageStoragePath ? { imageStoragePath: null } : {}),
      ...(cols.imageMimeType ? { imageMimeType: null } : {}),
      ...(cols.imageSizeBytes ? { imageSizeBytes: null } : {}),
      ...(cols.drawingData ? { drawingData: null } : {}),
      ...(cols.updatedAt ? { updatedAt: deletedAt } : {}),
    })
      .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId), eq(communicationMessages.authorUid, req.user!.uid), isNull(communicationMessages.deletedAt)))
      .returning({ id: communicationMessages.id });
  } else {
    [deleted] = await db.delete(communicationMessages)
      .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId), eq(communicationMessages.authorUid, req.user!.uid)))
      .returning({ id: communicationMessages.id });
  }
  if (!deleted) return res.status(404).json({ error: 'Mensagem não encontrada ou já apagada.' });
  const audioPath = 'audioStoragePath' in message ? message.audioStoragePath : null;
  const imagePath = 'imageStoragePath' in message ? message.imageStoragePath : null;
  if (audioPath) await deletePrivateFile(audioPath).catch((error) => console.error('Failed to remove deleted group-message audio:', error));
  if (imagePath) await deletePrivateFile(imagePath).catch((error) => console.error('Failed to remove deleted group-message image:', error));
  await AuditService.record({ userId: req.user!.uid, userEmail: req.user!.loginName, action: 'DELETE', entity: 'SYSTEM', entityId: String(messageId), details: { type: 'COMMUNICATION_GROUP_MESSAGE', groupId } }, req);
  return res.json({ success: true });
}));

router.get('/groups/:id/messages/:messageId/audio', asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(groupId) || groupId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.groupMessages.audioStoragePath || !support.groupMessages.audioMimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ path: communicationMessages.audioStoragePath, mimeType: communicationMessages.audioMimeType })
    .from(communicationMessages).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message?.path || !message.mimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  return streamAudio(message.path, message.mimeType, res, () => { if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar o áudio.' }); else res.destroy(); });
}));

router.get('/groups/:id/messages/:messageId/image', asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(groupId) || groupId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  const support = await getCommunicationSchemaSupport();
  if (!support.groupMessages.imageStoragePath || !support.groupMessages.imageMimeType) return res.status(404).json({ error: 'Imagem não encontrada.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({
    path: communicationMessages.imageStoragePath,
    mimeType: communicationMessages.imageMimeType,
    ...(support.groupMessages.deletedAt ? { deletedAt: communicationMessages.deletedAt } : {}),
  }).from(communicationMessages).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message?.path || !message.mimeType || ('deletedAt' in message && message.deletedAt)) return res.status(404).json({ error: 'Imagem não encontrada.' });
  return streamPrivateFile(message.path, message.mimeType, `chat-group-${messageId}`, res, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar a imagem.' });
    else res.destroy();
  });
}));

router.put('/groups/:id/messages/:messageId/drawing', requirePermission('communications:write'), allowBodyFields('drawingData'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) {
    return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  }
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  if (!cols.drawingData || !cols.imageStoragePath) {
    return res.status(503).json({ error: 'Anotações em imagens não estão disponíveis no momento.' });
  }
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select(groupMessageSelectCols(cols)).from(communicationMessages)
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message || ('deletedAt' in message && message.deletedAt) || !('imageStoragePath' in message && message.imageStoragePath)) {
    return res.status(404).json({ error: 'Imagem não encontrada neste grupo.' });
  }
  let sanitized;
  try {
    sanitized = validateDrawingData(req.body?.drawingData);
  } catch (err) {
    return res.status(400).json({ error: err instanceof MediaValidationError ? err.message : 'Anotação inválida.' });
  }
  const [updated] = await db.update(communicationMessages).set({
    ...(cols.attachmentType ? { attachmentType: sanitized.strokes.length > 0 ? 'DRAWING' : 'IMAGE' } : {}),
    drawingData: sanitized as unknown as Record<string, unknown>,
    ...(cols.updatedAt ? { updatedAt: new Date() } : {}),
  }).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId)))
    .returning(groupMessageSelectCols(cols));
  await AuditService.record({
    userId: req.user!.uid,
    userEmail: req.user!.loginName,
    action: 'UPDATE',
    entity: 'SYSTEM',
    entityId: String(messageId),
    details: { type: 'COMMUNICATION_GROUP_DRAWING', groupId, strokes: sanitized.strokes.length },
  }, req);
  return res.json(publicMessage(updated));
}));
router.get('/groups/:id/members', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  const members = await withDbRetry(async () => {
    if (!await isGroupMember(id, req.user!.userId)) return null;
    const rows = await db.select({
      id: users.id,
      name: users.name,
      department: users.department,
      role: users.role,
      ...(support.userAvatarUrl ? { avatarUrl: users.avatarUrl } : {}),
    })
      .from(communicationGroupMembers).innerJoin(users, eq(users.id, communicationGroupMembers.userId))
      .where(eq(communicationGroupMembers.groupId, id)).orderBy(asc(users.name));
    return rows.map((entry) => ({ ...entry, avatarUrl: 'avatarUrl' in entry ? (entry.avatarUrl ?? null) : null }));
  });
  if (!members) return res.status(404).json({ error: 'Grupo não encontrado.' });
  return res.json(members);
}));
router.patch('/groups/:id/read', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (!support.groupMembersLastReadAt) return res.json({ success: true });
  const [member] = await db.select({ lastReadAt: communicationGroupMembers.lastReadAt }).from(communicationGroupMembers).where(and(
    eq(communicationGroupMembers.groupId, id),
    eq(communicationGroupMembers.userId, req.user!.userId),
  )).limit(1);
  const readAt = new Date();
  await db.update(communicationGroupMembers).set({ lastReadAt: readAt }).where(and(
    eq(communicationGroupMembers.groupId, id),
    eq(communicationGroupMembers.userId, req.user!.userId),
  ));
  if (member && support.groupMessages.updatedAt) {
    await db.update(communicationMessages).set({ updatedAt: readAt }).where(and(
      eq(communicationMessages.groupId, id),
      ne(communicationMessages.authorUid, req.user!.uid),
      gt(communicationMessages.createdAt, member.lastReadAt),
    ));
  }
  return res.json({ success: true });
}));
router.post('/groups', requirePermission('communications:manage'), allowBodyFields('name', 'sector', 'memberIds'), asyncHandler(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const sector = typeof req.body.sector === 'string' ? req.body.sector.trim().slice(0, 80) : '';
  const requestedIds: unknown[] = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const memberIds = [...new Set(requestedIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
  if (name.length < 2 || sector.length < 2 || memberIds.length > 49 || memberIds.length !== requestedIds.length) return res.status(400).json({ error: 'Informe nome, setor e até 49 participantes válidos.' });
  const validUsers = memberIds.length ? await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, memberIds), eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'SUPERVISOR', 'OPERATOR']))) : [];
  if (validUsers.length !== memberIds.length) return res.status(400).json({ error: 'Um ou mais participantes não estão ativos.' });
  const group = await db.transaction(async (tx) => {
    const [created] = await tx.insert(communicationGroups).values({ name, sector, createdByUid: req.user!.uid }).returning();
    await insertGroupMembers(tx, created.id, [req.user!.userId, ...memberIds], req.user!.uid);
    return created;
  });
  return res.status(201).json(group);
}));
router.post('/groups/:id/messages', requirePermission('communications:write'), allowBodyFields('body', 'replyToMessageId'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const replyToMessageId = req.body.replyToMessageId == null ? null : Number(req.body.replyToMessageId);
  if (replyToMessageId !== null) {
    const [source] = await db.select({ id: communicationMessages.id }).from(communicationMessages)
      .where(and(eq(communicationMessages.id, replyToMessageId), eq(communicationMessages.groupId, id))).limit(1);
    if (!Number.isInteger(replyToMessageId) || !source) return res.status(400).json({ error: 'A mensagem respondida não pertence a este grupo.' });
  }
  const message = await insertMessageRow(
    db,
    'communication_messages',
    'group_id',
    'group_id AS "groupId"',
    id,
    support.groupMessages,
    {
      body,
      ...(support.groupMessages.replyToMessageId ? { replyToMessageId } : {}),
      authorUid: req.user!.uid,
      authorName: req.user!.name,
    },
  );
  return res.status(201).json(publicMessage(message));
}));
router.post('/groups/:id/audio', requirePermission('communications:write'), express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  if (!cols.audioStoragePath || !cols.audioMimeType || !cols.audioDurationMs) {
    return res.status(503).json({ error: 'Envio de áudio não está disponível no momento.' });
  }
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const audio = validatedAudioBody(req, res);
  if (!audio) return;
  const extension = audio.mimeType === 'audio/ogg' ? 'ogg' : audio.mimeType === 'audio/mp4' ? 'm4a' : audio.mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
  const objectPath = `communications/groups/${id}/${randomUUID()}.${extension}`;
  const storedPath = await savePrivateFile(objectPath, audio.buffer, audio.mimeType);
  try {
    const message = await insertMessageRow(
      db,
      'communication_messages',
      'group_id',
      'group_id AS "groupId"',
      id,
      cols,
      {
        body: 'Mensagem de áudio',
        authorUid: req.user!.uid,
        authorName: req.user!.name,
        audioStoragePath: storedPath,
        audioMimeType: audio.mimeType,
        audioDurationMs: audio.durationMs,
      },
    );
    return res.status(201).json(publicMessage(message));
  } catch (error) { await deletePrivateFile(storedPath).catch(() => undefined); throw error; }
}));

router.post('/groups/:id/image', requirePermission('communications:write'), express.raw({ type: IMAGE_RAW_TYPES, limit: MAX_IMAGE_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  const support = await getCommunicationSchemaSupport();
  const cols = support.groupMessages;
  if (!cols.imageStoragePath || !cols.imageMimeType) {
    return res.status(503).json({ error: 'Envio de imagens não está disponível no momento.' });
  }
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: 'Envie uma imagem PNG, JPEG ou WebP de até 5 MB.' });
  let validated;
  try {
    validated = validateImageUpload(req.body, req.get('content-type'));
  } catch (err) {
    return res.status(400).json({ error: err instanceof MediaValidationError ? err.message : 'Imagem inválida.' });
  }
  const caption = typeof req.query.caption === 'string' && req.query.caption.trim()
    ? req.query.caption.trim().slice(0, 500)
    : 'Imagem anexada';
  const objectPath = `communications/groups/${id}/${randomUUID()}.${validated.extension}`;
  const storedPath = await savePrivateFile(objectPath, req.body, validated.mimeType);
  try {
    const message = await insertMessageRow(
      db,
      'communication_messages',
      'group_id',
      'group_id AS "groupId"',
      id,
      cols,
      {
        body: caption,
        authorUid: req.user!.uid,
        authorName: req.user!.name,
        ...(cols.attachmentType ? { attachmentType: 'IMAGE' } : {}),
        imageStoragePath: storedPath,
        imageMimeType: validated.mimeType,
        ...(cols.imageSizeBytes ? { imageSizeBytes: req.body.length } : {}),
      },
    );
    await AuditService.record({
      userId: req.user!.uid,
      userEmail: req.user!.loginName,
      action: 'CREATE',
      entity: 'SYSTEM',
      entityId: String(message.id),
      details: { type: 'COMMUNICATION_GROUP_IMAGE', groupId: id, sizeBytes: req.body.length },
    }, req);
    return res.status(201).json(publicMessage(message));
  } catch (error) {
    await deletePrivateFile(storedPath).catch(() => undefined);
    throw error;
  }
}));

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Communications request failed:', error);
  const status = typeof error === 'object' && error !== null && 'status' in error && Number((error as { status?: unknown }).status) === 413 ? 413 : 503;
  if (status === 413) {
    return res.status(413).json({ error: 'O arquivo excede o limite de 5 MB.' });
  }
  const errObj = typeof error === 'object' && error !== null ? (error as { code?: unknown; cause?: { code?: unknown } }) : null;
  const rawCode = errObj?.code ?? errObj?.cause?.code;
  const safeCode = typeof rawCode === 'string' && /^[A-Za-z0-9_]{2,24}$/.test(rawCode) ? rawCode : null;
  if (safeCode === '42703' || safeCode === '42P01') {
    schemaSupportCache = null;
  }
  return res.status(503).json({
    error: safeCode
      ? `A central de comunicação está indisponível no momento. (${safeCode})`
      : 'A central de comunicação está indisponível no momento.',
  });
});
export default router;
