import express, { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { communicationDirectConversations, communicationDirectMembers, communicationDirectMessages, communicationGroupMembers, communicationGroups, communicationMessages, communicationMessageReactions, users } from '../../db/schema.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';
import { communicationStorageBucket } from '../../lib/communication-storage.ts';
import { AuditService } from '../../services/audit.service.ts';

const router = Router();
router.use(requirePermission('communications:read'));
const MESSAGE_PAGE_SIZE = 30;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_DURATION_MS = 120_000;
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);
const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);
const asyncHandler = (handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req as AuthenticatedRequest, res).catch(next); };

function messagePageOptions(req: Request) {
  const rawBefore = req.query.beforeId, rawAfter = req.query.afterId, rawChangedAfter = req.query.changedAfter;
  const beforeId = typeof rawBefore === 'string' ? Number(rawBefore) : null;
  const afterId = typeof rawAfter === 'string' ? Number(rawAfter) : null;
  const changedAfterDate = typeof rawChangedAfter === 'string' ? new Date(rawChangedAfter) : null;
  const requestedLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : MESSAGE_PAGE_SIZE;
  return {
    beforeId: Number.isSafeInteger(beforeId) && beforeId! > 0 ? beforeId : null,
    afterId: Number.isSafeInteger(afterId) && afterId! > 0 ? afterId : null,
    changedAfter: changedAfterDate && Number.isFinite(changedAfterDate.getTime()) ? changedAfterDate : null,
    limit: Number.isSafeInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : MESSAGE_PAGE_SIZE,
  };
}

function publicMessage<T extends { audioStoragePath?: string | null; audioMimeType?: string | null; audioDurationMs?: number | null }>(message: T) {
  const { audioStoragePath, ...visibleMessage } = message;
  return { ...visibleMessage, hasAudio: Boolean(audioStoragePath) };
}

async function messagePagePayload<T extends { id: number; authorUid: string; createdAt: Date; audioStoragePath?: string | null; audioMimeType?: string | null; audioDurationMs?: number | null }>(
  rows: T[], kind: 'group' | 'direct', conversationId: number, currentUserId: number, currentUid: string,
) {
  if (!rows.length) return [];
  const messageIds = rows.map((message) => message.id);
  const [reactionRows, members] = await Promise.all([
    kind === 'group'
      ? db.select({ messageId: communicationMessageReactions.groupMessageId, userId: communicationMessageReactions.userId, emoji: communicationMessageReactions.emoji })
        .from(communicationMessageReactions).where(inArray(communicationMessageReactions.groupMessageId, messageIds))
      : db.select({ messageId: communicationMessageReactions.directMessageId, userId: communicationMessageReactions.userId, emoji: communicationMessageReactions.emoji })
        .from(communicationMessageReactions).where(inArray(communicationMessageReactions.directMessageId, messageIds)),
    kind === 'group'
      ? db.select({ userId: communicationGroupMembers.userId, lastReadAt: communicationGroupMembers.lastReadAt, name: users.name, department: users.department, avatarUrl: users.avatarUrl })
        .from(communicationGroupMembers).innerJoin(users, eq(users.id, communicationGroupMembers.userId)).where(eq(communicationGroupMembers.groupId, conversationId))
      : db.select({ userId: communicationDirectMembers.userId, lastReadAt: communicationDirectMembers.lastReadAt, name: users.name, department: users.department, avatarUrl: users.avatarUrl })
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
        readBy: readBy.map((member) => ({ userId: member.userId, name: member.name, department: member.department, avatarUrl: member.avatarUrl, readAt: member.lastReadAt.toISOString() })),
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
  try {
    const file = communicationStorageBucket().file(objectPath);
    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(metadata.size || 0));
    res.setHeader('Content-Disposition', 'inline; filename="voice-message"');
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = file.createReadStream();
    stream.on('error', onError);
    stream.pipe(res);
  } catch (error) { onError(error); }
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
  const directory = await db.select({ id: users.id, name: users.name, department: users.department, role: users.role, avatarUrl: users.avatarUrl })
    .from(users).where(and(eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'SUPERVISOR', 'OPERATOR']), ne(users.id, req.user!.userId))).orderBy(asc(users.name)).limit(200);
  return res.json(directory);
}));

router.get('/direct', asyncHandler(async (req, res) => {
  const mine = await db.select({ id: communicationDirectConversations.id, createdAt: communicationDirectConversations.createdAt, lastReadAt: communicationDirectMembers.lastReadAt })
    .from(communicationDirectConversations).innerJoin(communicationDirectMembers, eq(communicationDirectMembers.conversationId, communicationDirectConversations.id))
    .where(eq(communicationDirectMembers.userId, req.user!.userId)).orderBy(desc(communicationDirectConversations.createdAt)).limit(100);
  if (!mine.length) return res.json([]);
  const ids = mine.map((conversation) => conversation.id);
  const [others, latestMessages, unreadRows] = await Promise.all([
    db.select({ conversationId: communicationDirectMembers.conversationId, userId: users.id, name: users.name, department: users.department, role: users.role, avatarUrl: users.avatarUrl })
      .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId))
      .where(and(inArray(communicationDirectMembers.conversationId, ids), ne(communicationDirectMembers.userId, req.user!.userId))),
    db.selectDistinctOn([communicationDirectMessages.conversationId], {
      conversationId: communicationDirectMessages.conversationId,
      body: communicationDirectMessages.body,
      authorUid: communicationDirectMessages.authorUid,
      authorName: communicationDirectMessages.authorName,
      createdAt: communicationDirectMessages.createdAt,
    }).from(communicationDirectMessages).where(inArray(communicationDirectMessages.conversationId, ids))
      .orderBy(communicationDirectMessages.conversationId, desc(communicationDirectMessages.createdAt)),
    db.select({ conversationId: communicationDirectMembers.conversationId, unreadCount: count() })
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
      .groupBy(communicationDirectMembers.conversationId),
  ]);
  const otherByConversation = new Map(others.map((user) => [user.conversationId, user]));
  const latestByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row.unreadCount]));
  return res.json(mine.flatMap((conversation) => {
    const other = otherByConversation.get(conversation.id);
    return other ? [{
      conversationId: conversation.id,
      id: conversation.id,
      createdAt: conversation.createdAt,
      userId: other.userId,
      name: other.name,
      department: other.department,
      role: other.role,
      avatarUrl: other.avatarUrl,
      lastMessage: latestByConversation.get(conversation.id) || null,
      unreadCount: unreadByConversation.get(conversation.id) || 0,
    }] : [];
  }));

}));

router.get('/direct/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const page = messagePageOptions(req);
  if (page.beforeId && page.afterId) return res.status(400).json({ error: 'Use um único cursor de mensagens.' });
  const predicates = [eq(communicationDirectMessages.conversationId, id)];
  if (page.beforeId) predicates.push(lt(communicationDirectMessages.id, page.beforeId));
  else if (page.afterId && page.changedAfter) predicates.push(or(gt(communicationDirectMessages.id, page.afterId), gt(communicationDirectMessages.updatedAt, page.changedAfter), gt(communicationDirectMessages.deletedAt, page.changedAfter))!);
  else if (page.afterId) predicates.push(gt(communicationDirectMessages.id, page.afterId));
  else if (page.changedAfter) predicates.push(or(gt(communicationDirectMessages.createdAt, page.changedAfter), gt(communicationDirectMessages.updatedAt, page.changedAfter), gt(communicationDirectMessages.deletedAt, page.changedAfter))!);
  const rows = await db.select().from(communicationDirectMessages).where(and(...predicates))
    .orderBy(page.afterId ? asc(communicationDirectMessages.id) : desc(communicationDirectMessages.id)).limit(page.limit);
  return res.json(await messagePagePayload(page.afterId ? rows : rows.reverse(), 'direct', id, req.user!.userId, req.user!.uid));
}));

router.put('/direct/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ id: communicationDirectMessages.id, deletedAt: communicationDirectMessages.deletedAt }).from(communicationDirectMessages)
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.insert(communicationMessageReactions).values({ directMessageId: messageId, userId: req.user!.userId, emoji }).onConflictDoNothing();
  await db.update(communicationDirectMessages).set({ updatedAt: new Date() }).where(eq(communicationDirectMessages.id, messageId));
  return res.json({ success: true });
}));

router.delete('/direct/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ id: communicationDirectMessages.id }).from(communicationDirectMessages)
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.delete(communicationMessageReactions).where(and(eq(communicationMessageReactions.directMessageId, messageId), eq(communicationMessageReactions.userId, req.user!.userId), eq(communicationMessageReactions.emoji, emoji)));
  await db.update(communicationDirectMessages).set({ updatedAt: new Date() }).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId)));
  return res.json({ success: true });
}));

router.delete('/direct/:id/messages/:messageId', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ id: communicationDirectMessages.id, authorUid: communicationDirectMessages.authorUid, audioStoragePath: communicationDirectMessages.audioStoragePath, deletedAt: communicationDirectMessages.deletedAt })
    .from(communicationDirectMessages).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message || message.authorUid !== req.user!.uid || message.deletedAt) return res.status(404).json({ error: 'Mensagem não encontrada ou sem permissão para apagá-la.' });
  const deletedAt = new Date();
  const [deleted] = await db.update(communicationDirectMessages).set({ body: 'Mensagem apagada', deletedAt, deletedByUid: req.user!.uid, audioStoragePath: null, audioMimeType: null, audioDurationMs: null, updatedAt: deletedAt })
    .where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId), eq(communicationDirectMessages.authorUid, req.user!.uid), isNull(communicationDirectMessages.deletedAt))).returning({ id: communicationDirectMessages.id });
  if (!deleted) return res.status(404).json({ error: 'Mensagem não encontrada ou já apagada.' });
  if (message.audioStoragePath) await communicationStorageBucket().file(message.audioStoragePath).delete().catch((error) => console.error('Failed to remove deleted direct-message audio:', error));
  await AuditService.record({ userId: req.user!.uid, userEmail: req.user!.loginName, action: 'DELETE', entity: 'SYSTEM', entityId: String(messageId), details: { type: 'COMMUNICATION_DIRECT_MESSAGE', conversationId } }, req);
  return res.json({ success: true });
}));

router.get('/direct/:id/messages/:messageId/audio', asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(conversationId) || conversationId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  if (!await isDirectMember(conversationId, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.select({ path: communicationDirectMessages.audioStoragePath, mimeType: communicationDirectMessages.audioMimeType })
    .from(communicationDirectMessages).where(and(eq(communicationDirectMessages.id, messageId), eq(communicationDirectMessages.conversationId, conversationId))).limit(1);
  if (!message?.path || !message.mimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  return streamAudio(message.path, message.mimeType, res, () => { if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar o áudio.' }); else res.destroy(); });
}));

router.get('/direct/:id/profile', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [participant] = await db.select({ id: users.id, name: users.name, department: users.department, role: users.role, status: users.status, avatarUrl: users.avatarUrl })
    .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId))
    .where(and(eq(communicationDirectMembers.conversationId, id), ne(users.id, req.user!.userId))).limit(1);
  return participant ? res.json(participant) : res.status(404).json({ error: 'Participante não encontrado.' });
}));

router.patch('/direct/:id/read', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [member] = await db.select({ lastReadAt: communicationDirectMembers.lastReadAt }).from(communicationDirectMembers).where(and(
    eq(communicationDirectMembers.conversationId, id),
    eq(communicationDirectMembers.userId, req.user!.userId),
  )).limit(1);
  const readAt = new Date();
  await db.update(communicationDirectMembers).set({ lastReadAt: readAt }).where(and(
    eq(communicationDirectMembers.conversationId, id),
    eq(communicationDirectMembers.userId, req.user!.userId),
  ));
  if (member) await db.update(communicationDirectMessages).set({ updatedAt: readAt }).where(and(
    eq(communicationDirectMessages.conversationId, id),
    ne(communicationDirectMessages.authorUid, req.user!.uid),
    gt(communicationDirectMessages.createdAt, member.lastReadAt),
  ));
  return res.json({ success: true });
}));

router.post('/direct/messages', requirePermission('communications:write'), allowBodyFields('recipientId', 'body'), asyncHandler(async (req, res) => {
  const recipientId = Number(req.body.recipientId);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(recipientId) || recipientId < 1 || recipientId === req.user!.userId || !body || body.length > 4000) {
    return res.status(400).json({ error: 'Destinatário ou mensagem inválidos.' });
  }
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
    await tx.insert(communicationDirectMembers).values([
      { conversationId: conversation.id, userId: req.user!.userId },
      { conversationId: conversation.id, userId: recipientId },
    ]).onConflictDoNothing();
    const [message] = await tx.insert(communicationDirectMessages).values({
      conversationId: conversation.id, body, authorUid: req.user!.uid, authorName: req.user!.name,
    }).returning();
    return { conversationId: conversation.id, message };
  });
  return res.status(201).json(result);
}));

router.post('/direct/:id/messages', requirePermission('communications:write'), allowBodyFields('body', 'replyToMessageId'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const replyToMessageId = req.body.replyToMessageId == null ? null : Number(req.body.replyToMessageId);
  if (replyToMessageId !== null) {
    const [source] = await db.select({ id: communicationDirectMessages.id }).from(communicationDirectMessages)
      .where(and(eq(communicationDirectMessages.id, replyToMessageId), eq(communicationDirectMessages.conversationId, id))).limit(1);
    if (!Number.isInteger(replyToMessageId) || !source) return res.status(400).json({ error: 'A mensagem respondida não pertence a esta conversa.' });
  }
  const [message] = await db.insert(communicationDirectMessages).values({ conversationId: id, body, replyToMessageId, authorUid: req.user!.uid, authorName: req.user!.name }).returning();
  return res.status(201).json(message);
}));

router.post('/direct/:id/audio', requirePermission('communications:write'), express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const audio = validatedAudioBody(req, res);
  if (!audio) return;
  const extension = audio.mimeType === 'audio/ogg' ? 'ogg' : audio.mimeType === 'audio/mp4' ? 'm4a' : audio.mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
  const objectPath = `communications/direct/${id}/${randomUUID()}.${extension}`;
  const file = communicationStorageBucket().file(objectPath);
  await file.save(audio.buffer, { resumable: false, metadata: { contentType: audio.mimeType, cacheControl: 'private, no-store' } });
  try {
    const [message] = await db.insert(communicationDirectMessages).values({
      conversationId: id, body: 'Mensagem de áudio', authorUid: req.user!.uid, authorName: req.user!.name,
      audioStoragePath: objectPath, audioMimeType: audio.mimeType, audioDurationMs: audio.durationMs,
    }).returning();
    return res.status(201).json(publicMessage(message));
  } catch (error) { await file.delete().catch(() => undefined); throw error; }
}));

router.get('/groups', asyncHandler(async (req, res) => {
  const groups = await db.select({ id: communicationGroups.id, name: communicationGroups.name, sector: communicationGroups.sector, createdAt: communicationGroups.createdAt, lastReadAt: communicationGroupMembers.lastReadAt })
    .from(communicationGroups).innerJoin(communicationGroupMembers, eq(communicationGroupMembers.groupId, communicationGroups.id))
    .where(eq(communicationGroupMembers.userId, req.user!.userId))
    .orderBy(asc(communicationGroups.sector), asc(communicationGroups.name));
  if (!groups.length) return res.json([]);
  const groupIds = groups.map((group) => group.id);
  const [latestMessages, unreadRows] = await Promise.all([
    db.selectDistinctOn([communicationMessages.groupId], {
      groupId: communicationMessages.groupId,
      body: communicationMessages.body,
      authorUid: communicationMessages.authorUid,
      authorName: communicationMessages.authorName,
      createdAt: communicationMessages.createdAt,
    }).from(communicationMessages).where(inArray(communicationMessages.groupId, groupIds))
      .orderBy(communicationMessages.groupId, desc(communicationMessages.createdAt)),
    db.select({ groupId: communicationGroupMembers.groupId, unreadCount: count() })
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
      .groupBy(communicationGroupMembers.groupId),
  ]);
  const latestByGroup = new Map(latestMessages.map((message) => [message.groupId, message]));
  const unreadByGroup = new Map(unreadRows.map((row) => [row.groupId, row.unreadCount]));
  return res.json(groups.map(({ lastReadAt: _lastReadAt, ...group }) => ({
    ...group,
    lastMessage: latestByGroup.get(group.id) || null,
    unreadCount: unreadByGroup.get(group.id) || 0,
  })));
}));

router.get('/groups/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const page = messagePageOptions(req);
  if (page.beforeId && page.afterId) return res.status(400).json({ error: 'Use um único cursor de mensagens.' });
  const predicates = [eq(communicationMessages.groupId, id)];
  if (page.beforeId) predicates.push(lt(communicationMessages.id, page.beforeId));
  else if (page.afterId && page.changedAfter) predicates.push(or(gt(communicationMessages.id, page.afterId), gt(communicationMessages.updatedAt, page.changedAfter), gt(communicationMessages.deletedAt, page.changedAfter))!);
  else if (page.afterId) predicates.push(gt(communicationMessages.id, page.afterId));
  else if (page.changedAfter) predicates.push(or(gt(communicationMessages.createdAt, page.changedAfter), gt(communicationMessages.updatedAt, page.changedAfter), gt(communicationMessages.deletedAt, page.changedAfter))!);
  const rows = await db.select().from(communicationMessages).where(and(...predicates))
    .orderBy(page.afterId ? asc(communicationMessages.id) : desc(communicationMessages.id)).limit(page.limit);
  return res.json(await messagePagePayload(page.afterId ? rows : rows.reverse(), 'group', id, req.user!.userId, req.user!.uid));
}));

router.put('/groups/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ id: communicationMessages.id, deletedAt: communicationMessages.deletedAt }).from(communicationMessages)
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.insert(communicationMessageReactions).values({ groupMessageId: messageId, userId: req.user!.userId, emoji }).onConflictDoNothing();
  await db.update(communicationMessages).set({ updatedAt: new Date() }).where(eq(communicationMessages.id, messageId));
  return res.json({ success: true });
}));

router.delete('/groups/:id/messages/:messageId/reactions', requirePermission('communications:write'), allowBodyFields('emoji'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1 || !REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ id: communicationMessages.id }).from(communicationMessages)
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  await db.delete(communicationMessageReactions).where(and(eq(communicationMessageReactions.groupMessageId, messageId), eq(communicationMessageReactions.userId, req.user!.userId), eq(communicationMessageReactions.emoji, emoji)));
  await db.update(communicationMessages).set({ updatedAt: new Date() }).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId)));
  return res.json({ success: true });
}));

router.delete('/groups/:id/messages/:messageId', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(groupId) || groupId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ id: communicationMessages.id, authorUid: communicationMessages.authorUid, audioStoragePath: communicationMessages.audioStoragePath, deletedAt: communicationMessages.deletedAt })
    .from(communicationMessages).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message || message.authorUid !== req.user!.uid || message.deletedAt) return res.status(404).json({ error: 'Mensagem não encontrada ou sem permissão para apagá-la.' });
  const deletedAt = new Date();
  const [deleted] = await db.update(communicationMessages).set({ body: 'Mensagem apagada', deletedAt, deletedByUid: req.user!.uid, audioStoragePath: null, audioMimeType: null, audioDurationMs: null, updatedAt: deletedAt })
    .where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId), eq(communicationMessages.authorUid, req.user!.uid), isNull(communicationMessages.deletedAt))).returning({ id: communicationMessages.id });
  if (!deleted) return res.status(404).json({ error: 'Mensagem não encontrada ou já apagada.' });
  if (message.audioStoragePath) await communicationStorageBucket().file(message.audioStoragePath).delete().catch((error) => console.error('Failed to remove deleted group-message audio:', error));
  await AuditService.record({ userId: req.user!.uid, userEmail: req.user!.loginName, action: 'DELETE', entity: 'SYSTEM', entityId: String(messageId), details: { type: 'COMMUNICATION_GROUP_MESSAGE', groupId } }, req);
  return res.json({ success: true });
}));

router.get('/groups/:id/messages/:messageId/audio', asyncHandler(async (req, res) => {
  const groupId = Number(req.params.id), messageId = Number(req.params.messageId);
  if (!Number.isInteger(groupId) || groupId < 1 || !Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Mensagem inválida.' });
  if (!await isGroupMember(groupId, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.select({ path: communicationMessages.audioStoragePath, mimeType: communicationMessages.audioMimeType })
    .from(communicationMessages).where(and(eq(communicationMessages.id, messageId), eq(communicationMessages.groupId, groupId))).limit(1);
  if (!message?.path || !message.mimeType) return res.status(404).json({ error: 'Áudio não encontrado.' });
  return streamAudio(message.path, message.mimeType, res, () => { if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar o áudio.' }); else res.destroy(); });
}));
router.get('/groups/:id/members', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const members = await db.select({ id: users.id, name: users.name, department: users.department, role: users.role, avatarUrl: users.avatarUrl })
    .from(communicationGroupMembers).innerJoin(users, eq(users.id, communicationGroupMembers.userId))
    .where(eq(communicationGroupMembers.groupId, id)).orderBy(asc(users.name));
  return res.json(members);
}));
router.patch('/groups/:id/read', requirePermission('communications:write'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [member] = await db.select({ lastReadAt: communicationGroupMembers.lastReadAt }).from(communicationGroupMembers).where(and(
    eq(communicationGroupMembers.groupId, id),
    eq(communicationGroupMembers.userId, req.user!.userId),
  )).limit(1);
  const readAt = new Date();
  await db.update(communicationGroupMembers).set({ lastReadAt: readAt }).where(and(
    eq(communicationGroupMembers.groupId, id),
    eq(communicationGroupMembers.userId, req.user!.userId),
  ));
  if (member) await db.update(communicationMessages).set({ updatedAt: readAt }).where(and(
    eq(communicationMessages.groupId, id),
    ne(communicationMessages.authorUid, req.user!.uid),
    gt(communicationMessages.createdAt, member.lastReadAt),
  ));
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
    await tx.insert(communicationGroupMembers).values([req.user!.userId, ...memberIds].map((userId) => ({ groupId: created.id, userId, addedByUid: req.user!.uid })));
    return created;
  });
  return res.status(201).json(group);
}));
router.post('/groups/:id/messages', requirePermission('communications:write'), allowBodyFields('body', 'replyToMessageId'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const replyToMessageId = req.body.replyToMessageId == null ? null : Number(req.body.replyToMessageId);
  if (replyToMessageId !== null) {
    const [source] = await db.select({ id: communicationMessages.id }).from(communicationMessages)
      .where(and(eq(communicationMessages.id, replyToMessageId), eq(communicationMessages.groupId, id))).limit(1);
    if (!Number.isInteger(replyToMessageId) || !source) return res.status(400).json({ error: 'A mensagem respondida não pertence a este grupo.' });
  }
  const [message] = await db.insert(communicationMessages).values({ groupId: id, body, replyToMessageId, authorUid: req.user!.uid, authorName: req.user!.name }).returning();
  return res.status(201).json(message);
}));
router.post('/groups/:id/audio', requirePermission('communications:write'), express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const audio = validatedAudioBody(req, res);
  if (!audio) return;
  const extension = audio.mimeType === 'audio/ogg' ? 'ogg' : audio.mimeType === 'audio/mp4' ? 'm4a' : audio.mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
  const objectPath = `communications/groups/${id}/${randomUUID()}.${extension}`;
  const file = communicationStorageBucket().file(objectPath);
  await file.save(audio.buffer, { resumable: false, metadata: { contentType: audio.mimeType, cacheControl: 'private, no-store' } });
  try {
    const [message] = await db.insert(communicationMessages).values({
      groupId: id, body: 'Mensagem de áudio', authorUid: req.user!.uid, authorName: req.user!.name,
      audioStoragePath: objectPath, audioMimeType: audio.mimeType, audioDurationMs: audio.durationMs,
    }).returning();
    return res.status(201).json(publicMessage(message));
  } catch (error) { await file.delete().catch(() => undefined); throw error; }
}));
router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Communications request failed:', error);
  const status = typeof error === 'object' && error !== null && 'status' in error && Number((error as { status?: unknown }).status) === 413 ? 413 : 503;
  return res.status(status).json({ error: status === 413 ? 'O áudio excede o limite de 5 MB.' : 'A central de comunicação está indisponível no momento.' });
});
export default router;
