import { Router } from 'express';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { communicationGroups, communicationMessages } from '../../db/schema.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();
router.use(requirePermission('communications:read'));
router.get('/groups', async (_req, res) => res.json(await db.select().from(communicationGroups).orderBy(asc(communicationGroups.sector), asc(communicationGroups.name))));
router.get('/groups/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Grupo inválido.' });
  return res.json(await db.select().from(communicationMessages).where(eq(communicationMessages.groupId, id)).orderBy(desc(communicationMessages.createdAt)).limit(100).then(rows => rows.reverse()));
});
router.post('/groups', requirePermission('communications:manage'), allowBodyFields('name', 'sector'), async (req: AuthenticatedRequest, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const sector = typeof req.body.sector === 'string' ? req.body.sector.trim().slice(0, 80) : '';
  if (name.length < 2 || sector.length < 2) return res.status(400).json({ error: 'Informe o nome do grupo e o setor.' });
  const [group] = await db.insert(communicationGroups).values({ name, sector, createdByUid: req.user!.uid }).returning();
  return res.status(201).json(group);
});
router.post('/groups/:id/messages', requirePermission('communications:write'), allowBodyFields('body'), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id), body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(id) || id < 1 || !body || body.length > 4000) return res.status(400).json({ error: 'Mensagem ou grupo inválido.' });
  const [message] = await db.insert(communicationMessages).values({ groupId: id, body, authorUid: req.user!.uid, authorName: req.user!.name }).returning();
  return res.status(201).json(message);
});
export default router;
