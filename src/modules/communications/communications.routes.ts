import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { communicationDirectConversations, communicationDirectMembers, communicationDirectMessages, communicationGroupMembers, communicationGroups, communicationMessages, users } from '../../db/schema.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();
router.use(requirePermission('communications:read'));
const asyncHandler = (handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req as AuthenticatedRequest, res).catch(next); };
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
  const directory = await db.select({ id: users.id, name: users.name, department: users.department })
    .from(users).where(and(eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'SUPERVISOR', 'OPERATOR']), ne(users.id, req.user!.userId))).orderBy(asc(users.name)).limit(200);
  return res.json(directory);
}));

router.get('/direct', asyncHandler(async (req, res) => {
  const mine = await db.select({ id: communicationDirectConversations.id, createdAt: communicationDirectConversations.createdAt })
    .from(communicationDirectConversations).innerJoin(communicationDirectMembers, eq(communicationDirectMembers.conversationId, communicationDirectConversations.id))
    .where(eq(communicationDirectMembers.userId, req.user!.userId)).orderBy(desc(communicationDirectConversations.createdAt)).limit(100);
  if (!mine.length) return res.json([]);
  const ids = mine.map((conversation) => conversation.id);
  const [others, latestMessages] = await Promise.all([
    db.select({ conversationId: communicationDirectMembers.conversationId, userId: users.id, name: users.name, department: users.department })
      .from(communicationDirectMembers).innerJoin(users, eq(users.id, communicationDirectMembers.userId))
      .where(and(inArray(communicationDirectMembers.conversationId, ids), ne(communicationDirectMembers.userId, req.user!.userId))),
    db.selectDistinctOn([communicationDirectMessages.conversationId], {
      conversationId: communicationDirectMessages.conversationId,
      body: communicationDirectMessages.body,
      authorUid: communicationDirectMessages.authorUid,
      createdAt: communicationDirectMessages.createdAt,
    }).from(communicationDirectMessages).where(inArray(communicationDirectMessages.conversationId, ids))
      .orderBy(communicationDirectMessages.conversationId, desc(communicationDirectMessages.createdAt)),
  ]);
  const otherByConversation = new Map(others.map((user) => [user.conversationId, user]));
  const latestByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
  return res.json(mine.flatMap((conversation) => {
    const other = otherByConversation.get(conversation.id);
    return other ? [{
      conversationId: conversation.id,
      id: conversation.id,
      createdAt: conversation.createdAt,
      userId: other.userId,
      name: other.name,
      department: other.department,
      lastMessage: latestByConversation.get(conversation.id) || null,
    }] : [];
  }));

}));

router.get('/direct/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  return res.json(await db.select().from(communicationDirectMessages).where(eq(communicationDirectMessages.conversationId, id))
    .orderBy(desc(communicationDirectMessages.createdAt)).limit(100).then(rows => rows.reverse()));
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

router.post('/direct/:id/messages', requirePermission('communications:write'), allowBodyFields('body'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou conversa inválida.' });
  if (!await isDirectMember(id, req.user!.userId)) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const [message] = await db.insert(communicationDirectMessages).values({ conversationId: id, body, authorUid: req.user!.uid, authorName: req.user!.name }).returning();
  return res.status(201).json(message);
}));

router.get('/groups', asyncHandler(async (req, res) => {
  const groups = await db.select({ id: communicationGroups.id, name: communicationGroups.name, sector: communicationGroups.sector, createdAt: communicationGroups.createdAt })
    .from(communicationGroups).innerJoin(communicationGroupMembers, eq(communicationGroupMembers.groupId, communicationGroups.id))
    .where(eq(communicationGroupMembers.userId, req.user!.userId))
    .orderBy(asc(communicationGroups.sector), asc(communicationGroups.name));
  return res.json(groups);
}));

router.get('/groups/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  return res.json(await db.select().from(communicationMessages).where(eq(communicationMessages.groupId, id)).orderBy(desc(communicationMessages.createdAt)).limit(100).then(rows => rows.reverse()));
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
router.post('/groups/:id/messages', requirePermission('communications:write'), allowBodyFields('body'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  if (!await isGroupMember(id, req.user!.userId)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const [message] = await db.insert(communicationMessages).values({ groupId: id, body, authorUid: req.user!.uid, authorName: req.user!.name }).returning();
  return res.status(201).json(message);
}));
router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Communications request failed:', error);
  return res.status(503).json({ error: 'A central de comunicação está indisponível no momento.' });
});
export default router;
