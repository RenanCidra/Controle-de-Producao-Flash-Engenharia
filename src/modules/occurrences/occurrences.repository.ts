import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  communicationDirectMembers,
  communicationDirectMessages,
  communicationGroupMembers,
  communicationMessages,
  occurrenceAttachments,
  occurrenceMessages,
  productionOccurrenceEvents,
  productionOccurrences,
  protheusImportBatches,
  protheusProductionOrders,
  protheusSalesOrders,
  users,
} from '../../db/schema.ts';
import {
  computeSlaDueAt,
  isClosedOccurrenceStatus,
  normalizeOccurrenceStatus,
  type OccurrencePriority,
  type OccurrenceSector,
  type OccurrenceStatus,
  type OccurrenceType,
} from './occurrence-engine.ts';
import {
  evaluateMirrorFreshness,
  mergeWeeklyTrends,
  normalizePriorityBuckets,
  normalizeSectorBuckets,
  normalizeTypeBuckets,
  roundOneDecimal,
  type OccurrenceAnalyticsResponse,
} from './occurrence-stats.ts';
import type {
  ExistingOccurrenceSignatureRow,
  MirrorOrderLookupRow,
  NormalizedOccurrenceImportRow,
  OccurrenceCsvExportRow,
} from './occurrence-import.ts';

export interface OccurrenceFilters {
  search?: string;
  numeroOp?: string;
  numeroPv?: string;
  status?: string;
  occurrenceType?: string;
  type?: string;
  sector?: string;
  assigneeId?: number;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export class OccurrenceValidationError extends Error {}

const effectivePv = sql<string | null>`NULLIF(BTRIM(COALESCE(${productionOccurrences.pvNumber}, ${protheusProductionOrders.numeroPv})), '')`;
const effectiveOp = sql<string | null>`NULLIF(BTRIM(${productionOccurrences.numeroOp}), '')`;
const groupKey = sql<string>`CASE
  WHEN ${effectivePv} IS NOT NULL THEN 'PV:' || ${effectivePv}
  WHEN ${effectiveOp} IS NOT NULL THEN 'OP:' || ${effectiveOp}
  ELSE 'OC:' || ${productionOccurrences.id}::text
END`;

function buildStatusCondition(rawStatus: string): SQL<unknown> | null {
  const normalized = normalizeOccurrenceStatus(rawStatus);
  if (!normalized) return null;
  if (normalized === 'ABERTA') return inArray(productionOccurrences.status, ['ABERTA', 'OPEN']);
  if (normalized === 'EM_ATENDIMENTO') return inArray(productionOccurrences.status, ['EM_ATENDIMENTO', 'IN_PROGRESS']);
  if (normalized === 'CONCLUIDA') return inArray(productionOccurrences.status, ['CONCLUIDA', 'CLOSED']);
  return eq(productionOccurrences.status, normalized);
}

function buildConditions(filters: OccurrenceFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(
      ilike(productionOccurrences.code, pattern),
      ilike(productionOccurrences.numeroOp, pattern),
      ilike(productionOccurrences.pvNumber, pattern),
      ilike(productionOccurrences.componentCode, pattern),
      ilike(productionOccurrences.parentProduct, pattern),
      ilike(productionOccurrences.occurrenceType, pattern),
      ilike(productionOccurrences.description, pattern),
      ilike(productionOccurrences.operation, pattern),
      ilike(productionOccurrences.workstation, pattern),
      ilike(protheusProductionOrders.numeroPv, pattern),
      ilike(protheusProductionOrders.codigoProduto, pattern),
      ilike(protheusProductionOrders.descricaoProduto, pattern),
      ilike(protheusSalesOrders.clienteNome, pattern),
    )!);
  }
  if (filters.numeroOp) conditions.push(ilike(productionOccurrences.numeroOp, `%${filters.numeroOp}%`));
  if (filters.numeroPv) {
    const pattern = `%${filters.numeroPv}%`;
    conditions.push(or(
      ilike(productionOccurrences.pvNumber, pattern),
      ilike(protheusProductionOrders.numeroPv, pattern),
    )!);
  }
  if (filters.status) {
    const statusCondition = buildStatusCondition(filters.status);
    if (statusCondition) conditions.push(statusCondition);
  }
  if (filters.type) conditions.push(eq(productionOccurrences.type, filters.type));
  if (filters.sector) conditions.push(eq(productionOccurrences.sector, filters.sector));
  if (filters.assigneeId) conditions.push(eq(productionOccurrences.assigneeId, filters.assigneeId));
  if (filters.occurrenceType) conditions.push(ilike(productionOccurrences.occurrenceType, `%${filters.occurrenceType}%`));
  if (filters.from) conditions.push(gte(productionOccurrences.openedAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to) conditions.push(lte(productionOccurrences.openedAt, new Date(`${filters.to}T23:59:59.999Z`)));
  return conditions;
}

const joins = () => db.select({
  occurrence: productionOccurrences,
  op: {
    numeroOp: protheusProductionOrders.numeroOp,
    numeroPv: protheusProductionOrders.numeroPv,
    itemPv: protheusProductionOrders.itemPv,
    codigoProduto: protheusProductionOrders.codigoProduto,
    descricaoProduto: protheusProductionOrders.descricaoProduto,
  },
  clienteNome: protheusSalesOrders.clienteNome,
}).from(productionOccurrences)
  .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
  .leftJoin(protheusSalesOrders, and(
    eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
    eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
  ));

async function loadUsersMap(userIds: Array<number | null | undefined>) {
  const uniqueIds = [...new Set(userIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
  const map = new Map<number, { id: number; uid: string; name: string; role: string; department: string | null; avatarUrl: string | null }>();
  if (!uniqueIds.length) return map;
  const rows = await db.select({
    id: users.id,
    uid: users.uid,
    name: users.name,
    role: users.role,
    department: users.department,
    avatarUrl: users.avatarUrl,
  }).from(users).where(inArray(users.id, uniqueIds));
  for (const row of rows) map.set(row.id, row);
  return map;
}

export class OccurrencesRepository {
  static async list(filters: OccurrenceFilters) {
    const conditions = buildConditions(filters);
    const where = conditions.length ? and(...conditions) : undefined;
    const [summaryRows, groups, weeklyRows, typeRows] = await Promise.all([
      db.select({
        totalOccurrences: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
        open: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} IN ('OPEN', 'ABERTA'))`,
        inProgress: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} IN ('IN_PROGRESS', 'EM_ATENDIMENTO', 'AGUARDANDO'))`,
        closed: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} IN ('CLOSED', 'CONCLUIDA', 'CANCELADA'))`,
        impactedOps: sql<number>`count(DISTINCT ${effectiveOp})`,
        impactedPvs: sql<number>`count(DISTINCT ${effectivePv})`,
        totalGroups: sql<number>`count(DISTINCT ${groupKey})`,
      }).from(productionOccurrences)
        .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where),
      db.selectDistinct({ key: groupKey }).from(productionOccurrences)
        .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where).orderBy(groupKey).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
      db.select({
        week: sql<string>`TO_CHAR(date_trunc('week', ${productionOccurrences.openedAt}), 'YYYY-MM-DD')`,
        total: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
      }).from(productionOccurrences)
        .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where)
        .groupBy(sql`date_trunc('week', ${productionOccurrences.openedAt})`)
        .orderBy(sql`date_trunc('week', ${productionOccurrences.openedAt})`),
      db.select({
        type: productionOccurrences.occurrenceType,
        total: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
      }).from(productionOccurrences)
        .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where)
        .groupBy(productionOccurrences.occurrenceType)
        .orderBy(sql`count(DISTINCT ${productionOccurrences.id}) DESC`)
        .limit(6),
    ]);

    const selectedKeys = groups.map((group) => group.key);
    const pvNumbers = selectedKeys.filter((key) => key.startsWith('PV:')).map((key) => key.slice(3));
    const opNumbersWithoutPv = selectedKeys.filter((key) => key.startsWith('OP:')).map((key) => key.slice(3));
    const ocIdsWithoutOpOrPv = selectedKeys
      .filter((key) => key.startsWith('OC:'))
      .map((key) => Number(key.slice(3)))
      .filter((id) => Number.isSafeInteger(id) && id > 0);

    const selectedGroupCondition = or(
      pvNumbers.length ? inArray(effectivePv, pvNumbers) : undefined,
      opNumbersWithoutPv.length ? inArray(effectiveOp, opNumbersWithoutPv) : undefined,
      ocIdsWithoutOpOrPv.length ? inArray(productionOccurrences.id, ocIdsWithoutOpOrPv) : undefined,
    );
    const pageConditions = [...conditions, ...(selectedGroupCondition ? [selectedGroupCondition] : [])];
    const pageWhere = pageConditions.length ? and(...pageConditions) : undefined;
    const rows = selectedKeys.length ? await joins().where(pageWhere).orderBy(desc(productionOccurrences.openedAt), desc(productionOccurrences.id)) : [];

    const usersMap = await loadUsersMap(rows.flatMap((row) => [row.occurrence.requesterId, row.occurrence.assigneeId]));
    const grouped = new Map<string, any>();

    for (const row of rows) {
      const resolvedPv = row.occurrence.pvNumber?.trim() || row.op?.numeroPv?.trim() || null;
      const resolvedOp = row.occurrence.numeroOp?.trim() || row.op?.numeroOp?.trim() || null;
      const key = resolvedPv ? `PV:${resolvedPv}` : resolvedOp ? `OP:${resolvedOp}` : `OC:${row.occurrence.id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          numeroPv: resolvedPv,
          clientesEncontrados: new Set<string>(),
          ops: new Map<string, any>(),
        });
      }
      const pvGroup = grouped.get(key);
      if (row.clienteNome?.trim()) pvGroup.clientesEncontrados.add(row.clienteNome.trim());
      const opKey = resolvedOp || `OC:${row.occurrence.id}`;
      if (!pvGroup.ops.has(opKey)) {
        pvGroup.ops.set(opKey, {
          numeroOp: resolvedOp || row.occurrence.code,
          hasLinkedOp: Boolean(resolvedOp),
          codigoProduto: row.op?.codigoProduto || row.occurrence.parentProduct || row.occurrence.componentCode || null,
          descricaoProduto: row.op?.descricaoProduto || null,
          itemPv: row.op?.itemPv || null,
          occurrences: [],
        });
      }
      const occurrencesForOp = pvGroup.ops.get(opKey).occurrences as Array<Record<string, unknown> & { id: number }>;
      if (!occurrencesForOp.some((item) => item.id === row.occurrence.id)) {
        const assignee = row.occurrence.assigneeId ? usersMap.get(row.occurrence.assigneeId) || null : null;
        const requester = row.occurrence.requesterId ? usersMap.get(row.occurrence.requesterId) || null : null;
        occurrencesForOp.push({
          ...row.occurrence,
          assigneeName: assignee?.name || null,
          requesterName: requester?.name || row.occurrence.createdByName,
        });
      }
    }

    const aggregate = summaryRows[0];
    const totalGroups = Number(aggregate?.totalGroups || 0);
    return {
      items: [...grouped.values()].map((group) => ({
        numeroPv: group.numeroPv,
        clienteNome: group.clientesEncontrados.size === 1 ? [...group.clientesEncontrados][0] : null,
        clienteAmbiguo: group.clientesEncontrados.size > 1,
        ops: [...group.ops.values()],
      })),
      page: filters.page,
      pageSize: filters.pageSize,
      totalGroups,
      totalPages: Math.max(1, Math.ceil(totalGroups / filters.pageSize)),
      summary: {
        totalOccurrences: Number(aggregate?.totalOccurrences || 0),
        open: Number(aggregate?.open || 0),
        inProgress: Number(aggregate?.inProgress || 0),
        closed: Number(aggregate?.closed || 0),
        impactedOps: Number(aggregate?.impactedOps || 0),
        impactedPvs: Number(aggregate?.impactedPvs || 0),
        weekly: weeklyRows.map((row) => ({ week: row.week, total: Number(row.total) })),
        byType: typeRows.map((row) => ({ type: row.type, total: Number(row.total) })),
      },
    };
  }

  static async findOrders(search: string) {
    const pattern = `%${search}%`;
    return db.select({
      numeroOp: protheusProductionOrders.numeroOp,
      numeroPv: protheusProductionOrders.numeroPv,
      codigoProduto: protheusProductionOrders.codigoProduto,
      descricaoProduto: protheusProductionOrders.descricaoProduto,
      statusProtheus: protheusProductionOrders.statusProtheus,
    }).from(protheusProductionOrders).where(or(
      ilike(protheusProductionOrders.numeroOp, pattern),
      ilike(protheusProductionOrders.numeroPv, pattern),
      ilike(protheusProductionOrders.codigoProduto, pattern),
      ilike(protheusProductionOrders.descricaoProduto, pattern),
    )).orderBy(desc(protheusProductionOrders.id)).limit(20);
  }

  static async listAssignees() {
    return db.select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      role: users.role,
      department: users.department,
      avatarUrl: users.avatarUrl,
    }).from(users).where(eq(users.status, 'ACTIVE')).orderBy(asc(users.name));
  }

  static async findActiveUserById(userId: number) {
    const rows = await db.select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      role: users.role,
      department: users.department,
      avatarUrl: users.avatarUrl,
      status: users.status,
    }).from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    return user && user.status === 'ACTIVE' ? user : null;
  }

  static async listForOp(numeroOp: string) {
    const occurrences = await db.select().from(productionOccurrences)
      .where(eq(productionOccurrences.numeroOp, numeroOp)).orderBy(desc(productionOccurrences.createdAt));
    if (!occurrences.length) return [];
    const events = await db.select().from(productionOccurrenceEvents)
      .where(inArray(productionOccurrenceEvents.occurrenceId, occurrences.map((item) => item.id)))
      .orderBy(asc(productionOccurrenceEvents.createdAt), asc(productionOccurrenceEvents.id));
    const eventsByOccurrence = new Map<number, typeof events>();
    for (const event of events) {
      const existing = eventsByOccurrence.get(event.occurrenceId) || [];
      existing.push(event);
      eventsByOccurrence.set(event.occurrenceId, existing);
    }
    return occurrences.map((item) => ({ ...item, events: eventsByOccurrence.get(item.id) || [] }));
  }

  static async findOccurrence(id: number) {
    const rows = await db.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
    return rows[0] || null;
  }

  static async findDetail(id: number) {
    const occurrence = await this.findOccurrence(id);
    if (!occurrence) return null;
    const [events, messages, attachments, usersMap, opRow] = await Promise.all([
      db.select().from(productionOccurrenceEvents)
        .where(eq(productionOccurrenceEvents.occurrenceId, id))
        .orderBy(asc(productionOccurrenceEvents.createdAt), asc(productionOccurrenceEvents.id)),
      db.select().from(occurrenceMessages)
        .where(eq(occurrenceMessages.occurrenceId, id))
        .orderBy(asc(occurrenceMessages.createdAt), asc(occurrenceMessages.id)),
      db.select().from(occurrenceAttachments)
        .where(eq(occurrenceAttachments.occurrenceId, id))
        .orderBy(asc(occurrenceAttachments.createdAt), asc(occurrenceAttachments.id)),
      loadUsersMap([occurrence.requesterId, occurrence.assigneeId]),
      occurrence.numeroOp
        ? db.select({
            numeroOp: protheusProductionOrders.numeroOp,
            numeroPv: protheusProductionOrders.numeroPv,
            codigoProduto: protheusProductionOrders.codigoProduto,
            descricaoProduto: protheusProductionOrders.descricaoProduto,
          }).from(protheusProductionOrders).where(eq(protheusProductionOrders.numeroOp, occurrence.numeroOp)).limit(1)
        : Promise.resolve([]),
    ]);

    const requester = occurrence.requesterId ? usersMap.get(occurrence.requesterId) || null : null;
    const assignee = occurrence.assigneeId ? usersMap.get(occurrence.assigneeId) || null : null;
    return {
      ...occurrence,
      op: opRow[0] || null,
      requester,
      assignee,
      events,
      messages,
      attachments: attachments.map(({ storagePath, originalImagePath, ...rest }) => ({
        ...rest,
        hasFile: Boolean(storagePath),
        hasOriginalImage: Boolean(originalImagePath),
      })),
    };
  }

  static async listMessages(occurrenceId: number) {
    const occurrence = await this.findOccurrence(occurrenceId);
    if (!occurrence) return null;
    const [messages, attachments] = await Promise.all([
      db.select().from(occurrenceMessages)
        .where(eq(occurrenceMessages.occurrenceId, occurrenceId))
        .orderBy(asc(occurrenceMessages.createdAt), asc(occurrenceMessages.id)),
      db.select().from(occurrenceAttachments)
        .where(eq(occurrenceAttachments.occurrenceId, occurrenceId))
        .orderBy(asc(occurrenceAttachments.createdAt), asc(occurrenceAttachments.id)),
    ]);
    return {
      messages,
      attachments: attachments.map(({ storagePath, originalImagePath, ...rest }) => ({
        ...rest,
        hasFile: Boolean(storagePath),
        hasOriginalImage: Boolean(originalImagePath),
      })),
    };
  }

  static async findSourceMessage(kind: 'group' | 'direct', messageId: number, userId: number) {
    if (kind === 'group') {
      const [message] = await db.select().from(communicationMessages)
        .where(and(eq(communicationMessages.id, messageId), isNull(communicationMessages.deletedAt)))
        .limit(1);
      if (!message) return null;
      const [member] = await db.select().from(communicationGroupMembers)
        .where(and(eq(communicationGroupMembers.groupId, message.groupId), eq(communicationGroupMembers.userId, userId)))
        .limit(1);
      if (!member) return { forbidden: true as const };
      return {
        forbidden: false as const,
        kind: 'group' as const,
        messageId: message.id,
        conversationId: message.groupId,
        body: message.body,
        imageStoragePath: message.imageStoragePath,
        imageMimeType: message.imageMimeType,
        imageSizeBytes: message.imageSizeBytes,
        drawingData: message.drawingData,
        authorUid: message.authorUid,
        authorName: message.authorName,
        createdAt: message.createdAt,
      };
    }

    const [message] = await db.select().from(communicationDirectMessages)
      .where(and(eq(communicationDirectMessages.id, messageId), isNull(communicationDirectMessages.deletedAt)))
      .limit(1);
    if (!message) return null;
    const [member] = await db.select().from(communicationDirectMembers)
      .where(and(eq(communicationDirectMembers.conversationId, message.conversationId), eq(communicationDirectMembers.userId, userId)))
      .limit(1);
    if (!member) return { forbidden: true as const };
    return {
      forbidden: false as const,
      kind: 'direct' as const,
      messageId: message.id,
      conversationId: message.conversationId,
      body: message.body,
      imageStoragePath: message.imageStoragePath,
      imageMimeType: message.imageMimeType,
      imageSizeBytes: message.imageSizeBytes,
      drawingData: message.drawingData,
      authorUid: message.authorUid,
      authorName: message.authorName,
      createdAt: message.createdAt,
    };
  }

  static async create(input: {
    type: OccurrenceType;
    numeroOp: string | null;
    pvNumber: string | null;
    parentProduct: string | null;
    componentCode: string | null;
    warehouse: string | null;
    currentBalance: string | null;
    occurrenceType: string;
    description: string;
    operation: string | null;
    workstation: string | null;
    immediateAction: string | null;
    requesterId: number;
    assigneeId: number | null;
    sector: OccurrenceSector;
    priority: OccurrencePriority;
    slaMinutes: number;
    sourceMessageKind?: 'group' | 'direct' | null;
    sourceMessageId?: number | null;
    authorUid: string;
    authorName: string;
  }) {
    return db.transaction(async (tx) => {
      let resolvedPvNumber = input.pvNumber;
      let resolvedParentProduct = input.parentProduct;

      if (input.numeroOp && (!resolvedPvNumber || !resolvedParentProduct)) {
        const [opRow] = await tx.select({
          numeroPv: protheusProductionOrders.numeroPv,
          codigoProduto: protheusProductionOrders.codigoProduto,
        }).from(protheusProductionOrders).where(eq(protheusProductionOrders.numeroOp, input.numeroOp)).limit(1);
        if (opRow) {
          if (!resolvedPvNumber && opRow.numeroPv) resolvedPvNumber = opRow.numeroPv;
          if (!resolvedParentProduct && opRow.codigoProduto) resolvedParentProduct = opRow.codigoProduto;
        }
      }

      if (input.assigneeId !== null) {
        const [assignee] = await tx.select({ id: users.id, status: users.status })
          .from(users).where(eq(users.id, input.assigneeId)).limit(1);
        if (!assignee || assignee.status !== 'ACTIVE') {
          throw new OccurrenceValidationError('O responsável selecionado não está ativo.');
        }
      }

      let isRecurrence = false;
      let parentOccurrenceId: number | null = null;
      if (input.componentCode && input.numeroOp) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [prior] = await tx.select({ id: productionOccurrences.id })
          .from(productionOccurrences)
          .where(and(
            eq(productionOccurrences.componentCode, input.componentCode),
            eq(productionOccurrences.numeroOp, input.numeroOp),
            gte(productionOccurrences.openedAt, thirtyDaysAgo),
            ne(productionOccurrences.status, 'CANCELADA'),
          ))
          .orderBy(desc(productionOccurrences.openedAt), desc(productionOccurrences.id))
          .limit(1);
        if (prior) {
          isRecurrence = true;
          parentOccurrenceId = prior.id;
        }
      }

      const openedAt = new Date();
      const slaDueAt = computeSlaDueAt(openedAt, input.slaMinutes);

      const [inserted] = await tx.insert(productionOccurrences).values({
        code: `TMP-${randomUUID()}`,
        type: input.type,
        numeroOp: input.numeroOp,
        pvNumber: resolvedPvNumber,
        parentProduct: resolvedParentProduct,
        componentCode: input.componentCode,
        warehouse: input.warehouse,
        currentBalance: input.currentBalance,
        occurrenceType: input.occurrenceType,
        description: input.description,
        operation: input.operation,
        workstation: input.workstation,
        immediateAction: input.immediateAction,
        requesterId: input.requesterId,
        assigneeId: input.assigneeId,
        sector: input.sector,
        status: 'ABERTA',
        priority: input.priority,
        slaMinutes: input.slaMinutes,
        slaDueAt,
        openedAt,
        isRecurrence,
        parentOccurrenceId,
        sourceMessageKind: input.sourceMessageKind ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        createdByUid: input.authorUid,
        createdByName: input.authorName,
      }).returning();

      const year = (inserted.openedAt || openedAt).getFullYear();
      const finalCode = `OC-${year}-${String(inserted.id).padStart(3, '0')}`;
      const [created] = await tx.update(productionOccurrences)
        .set({ code: finalCode })
        .where(eq(productionOccurrences.id, inserted.id))
        .returning();

      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: created.id,
        eventType: 'CREATED',
        message: isRecurrence
          ? `Registro inicial da ocorrência (reincidência detectada nos últimos 30 dias).`
          : 'Registro inicial da ocorrência.',
        newStatus: 'ABERTA',
        authorUid: input.authorUid,
        authorName: input.authorName,
      });

      return created;
    });
  }

  static async assign(
    id: number,
    assigneeId: number,
    actor: { id: number; uid: string; name: string },
    note?: string | null,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) {
        throw new OccurrenceValidationError('A ocorrência já foi encerrada e não pode ser reatribuída.');
      }
      const [assignee] = await tx.select({ id: users.id, name: users.name, status: users.status })
        .from(users).where(eq(users.id, assigneeId)).limit(1);
      if (!assignee || assignee.status !== 'ACTIVE') {
        throw new OccurrenceValidationError('Usuário responsável inválido ou inativo.');
      }

      const now = new Date();
      const shouldStart = current.status === 'ABERTA' || current.status === 'OPEN';
      const nextStatus: OccurrenceStatus = shouldStart ? 'EM_ATENDIMENTO' : (normalizeOccurrenceStatus(current.status) || 'EM_ATENDIMENTO');

      const [updated] = await tx.update(productionOccurrences).set({
        assigneeId: assignee.id,
        status: nextStatus,
        firstResponseAt: current.firstResponseAt ?? now,
        updatedAt: now,
      }).where(eq(productionOccurrences.id, id)).returning();

      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id,
        eventType: shouldStart ? 'STATUS_CHANGED' : 'NOTE',
        message: note?.trim()
          ? `${note.trim()} (Responsável: ${assignee.name})`
          : `Responsável atribuído: ${assignee.name}.`,
        previousStatus: shouldStart ? current.status : null,
        newStatus: shouldStart ? nextStatus : null,
        authorUid: actor.uid,
        authorName: actor.name,
      });

      return updated;
    });
  }

  static async addMessage(
    id: number,
    actor: { id: number; uid: string; name: string },
    body: string,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) {
        throw new OccurrenceValidationError('A ocorrência está encerrada. Reabra antes de enviar novas mensagens.');
      }

      const now = new Date();
      const [message] = await tx.insert(occurrenceMessages).values({
        occurrenceId: id,
        authorId: actor.id,
        authorUid: actor.uid,
        authorName: actor.name,
        body,
      }).returning();

      const shouldStart = current.status === 'ABERTA' || current.status === 'OPEN';
      const updates: Partial<typeof productionOccurrences.$inferInsert> = {
        updatedAt: now,
      };
      if (shouldStart) {
        updates.status = 'EM_ATENDIMENTO';
        updates.firstResponseAt = current.firstResponseAt ?? now;
      } else if (!current.firstResponseAt && actor.id !== current.requesterId) {
        updates.firstResponseAt = now;
      }

      const [updated] = await tx.update(productionOccurrences)
        .set(updates)
        .where(eq(productionOccurrences.id, id))
        .returning();

      if (shouldStart) {
        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: id,
          eventType: 'STATUS_CHANGED',
          message: 'Atendimento iniciado pela primeira resposta no chat da ocorrência.',
          previousStatus: current.status,
          newStatus: 'EM_ATENDIMENTO',
          authorUid: actor.uid,
          authorName: actor.name,
        });
      }

      return { message, occurrence: updated };
    });
  }

  static async addEvent(id: number, input: { message: string; authorId: number; authorUid: string; authorName: string }) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) return { closed: true as const };

      const now = new Date();
      const shouldStart = current.status === 'ABERTA' || current.status === 'OPEN';
      const [event] = await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id,
        eventType: 'NOTE',
        message: input.message,
        authorUid: input.authorUid,
        authorName: input.authorName,
      }).returning();

      await tx.update(productionOccurrences).set({
        ...(shouldStart ? { status: 'EM_ATENDIMENTO', firstResponseAt: current.firstResponseAt ?? now } : {}),
        updatedAt: now,
      }).where(eq(productionOccurrences.id, id));

      if (shouldStart) {
        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: id,
          eventType: 'STATUS_CHANGED',
          message: 'Situação atualizada automaticamente para Em atendimento.',
          previousStatus: current.status,
          newStatus: 'EM_ATENDIMENTO',
          authorUid: input.authorUid,
          authorName: input.authorName,
        });
      }

      return { closed: false as const, event };
    });
  }

  static async complete(
    id: number,
    resolutionText: string,
    actor: { uid: string; name: string },
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) {
        throw new OccurrenceValidationError('A ocorrência já está concluída ou cancelada.');
      }
      if (!current.assigneeId) {
        throw new OccurrenceValidationError('Não é possível concluir uma ocorrência sem responsável atribuído.');
      }
      const now = new Date();
      const [updated] = await tx.update(productionOccurrences).set({
        status: 'CONCLUIDA',
        resolutionText,
        firstResponseAt: current.firstResponseAt ?? now,
        resolvedAt: now,
        closedAt: now,
        updatedAt: now,
      }).where(eq(productionOccurrences.id, id)).returning();

      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id,
        eventType: 'STATUS_CHANGED',
        message: resolutionText,
        previousStatus: current.status,
        newStatus: 'CONCLUIDA',
        authorUid: actor.uid,
        authorName: actor.name,
      });

      return updated;
    });
  }

  static async changeStatus(
    id: number,
    targetStatus: OccurrenceStatus,
    message: string,
    actor: { uid: string; name: string; canManage: boolean },
    resolutionText?: string | null,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;

      const currentNormalized = normalizeOccurrenceStatus(current.status) || 'ABERTA';
      if ((targetStatus === 'CANCELADA' || isClosedOccurrenceStatus(current.status)) && !actor.canManage) {
        throw new OccurrenceValidationError('PERMISSAO_NEGADA_STATUS');
      }

      if (currentNormalized === targetStatus && current.status === targetStatus) {
        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: id, eventType: 'NOTE', message,
          authorUid: actor.uid, authorName: actor.name,
        });
        await tx.update(productionOccurrences).set({ updatedAt: new Date() }).where(eq(productionOccurrences.id, id));
        return current;
      }

      const now = new Date();
      const updates: Partial<typeof productionOccurrences.$inferInsert> = {
        status: targetStatus,
        updatedAt: now,
      };

      if (targetStatus === 'CONCLUIDA') {
        if (!current.assigneeId) {
          throw new OccurrenceValidationError('Não é possível concluir uma ocorrência sem responsável atribuído.');
        }
        const effectiveResolution = (resolutionText || message || '').trim();
        if (effectiveResolution.length < 3) {
          throw new OccurrenceValidationError('Informe o texto de resolução para concluir a ocorrência.');
        }
        updates.resolutionText = effectiveResolution;
        updates.firstResponseAt = current.firstResponseAt ?? now;
        updates.resolvedAt = now;
        updates.closedAt = now;
      } else if (targetStatus === 'CANCELADA') {
        updates.closedAt = now;
      } else {
        if (currentNormalized === 'ABERTA' && (targetStatus === 'EM_ATENDIMENTO' || targetStatus === 'AGUARDANDO')) {
          updates.firstResponseAt = current.firstResponseAt ?? now;
        }
        if (isClosedOccurrenceStatus(current.status)) {
          updates.closedAt = null;
          updates.resolvedAt = null;
        }
      }

      const [updated] = await tx.update(productionOccurrences).set(updates)
        .where(eq(productionOccurrences.id, id)).returning();

      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id,
        eventType: 'STATUS_CHANGED',
        message: message || resolutionText || `Situação alterada para ${targetStatus}.`,
        previousStatus: current.status,
        newStatus: targetStatus,
        authorUid: actor.uid,
        authorName: actor.name,
      });

      return updated;
    });
  }

  static async attachImage(input: {
    occurrenceId: number;
    actor: { id: number; uid: string; name: string };
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    drawingData?: Record<string, unknown> | null;
    recordEvent?: boolean;
    caption?: string | null;
  }) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences)
        .where(eq(productionOccurrences.id, input.occurrenceId)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) {
        throw new OccurrenceValidationError('A ocorrência está encerrada. Reabra antes de anexar imagens.');
      }

      const hasStrokes = Array.isArray((input.drawingData as { strokes?: unknown[] } | null)?.strokes)
        && ((input.drawingData as { strokes: unknown[] }).strokes.length > 0);
      const [attachment] = await tx.insert(occurrenceAttachments).values({
        occurrenceId: input.occurrenceId,
        authorId: input.actor.id,
        authorUid: input.actor.uid,
        type: hasStrokes ? 'DRAWING' : 'IMAGE',
        storagePath: input.storagePath,
        originalImagePath: input.storagePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        drawingData: input.drawingData ?? null,
      }).returning();

      if (input.recordEvent !== false) {
        const now = new Date();
        const shouldStart = current.status === 'ABERTA' || current.status === 'OPEN';
        await tx.update(productionOccurrences).set({
          ...(shouldStart ? { status: 'EM_ATENDIMENTO', firstResponseAt: current.firstResponseAt ?? now } : {}),
          updatedAt: now,
        }).where(eq(productionOccurrences.id, input.occurrenceId));

        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: input.occurrenceId,
          eventType: 'NOTE',
          message: input.caption ? `Imagem anexada: ${input.caption}` : 'Imagem anexada à ocorrência.',
          authorUid: input.actor.uid,
          authorName: input.actor.name,
        });
      }

      const { storagePath: _sp, originalImagePath: _oip, ...safeAttachment } = attachment;
      return {
        ...safeAttachment,
        hasFile: true,
        hasOriginalImage: true,
      };
    });
  }

  static async saveAttachmentDrawing(
    occurrenceId: number,
    attachmentId: number,
    actor: { uid: string; name: string },
    drawingData: Record<string, unknown>,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences)
        .where(eq(productionOccurrences.id, occurrenceId)).limit(1);
      if (!current) return null;
      if (isClosedOccurrenceStatus(current.status)) {
        throw new OccurrenceValidationError('A ocorrência está encerrada e não aceita novas anotações.');
      }
      const [att] = await tx.select().from(occurrenceAttachments)
        .where(and(eq(occurrenceAttachments.id, attachmentId), eq(occurrenceAttachments.occurrenceId, occurrenceId)))
        .limit(1);
      if (!att || (!att.originalImagePath && !att.storagePath)) {
        return { attachmentNotFound: true as const };
      }

      const strokes = Array.isArray((drawingData as { strokes?: unknown[] }).strokes)
        ? (drawingData as { strokes: unknown[] }).strokes
        : [];
      const [updated] = await tx.update(occurrenceAttachments).set({
        type: strokes.length > 0 ? 'DRAWING' : 'IMAGE',
        drawingData,
      }).where(and(eq(occurrenceAttachments.id, attachmentId), eq(occurrenceAttachments.occurrenceId, occurrenceId)))
        .returning();

      await tx.update(productionOccurrences).set({ updatedAt: new Date() })
        .where(eq(productionOccurrences.id, occurrenceId));

      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId,
        eventType: 'NOTE',
        message: strokes.length > 0 ? 'Anotação de desenho salva na imagem.' : 'Anotação de desenho limpa na imagem.',
        authorUid: actor.uid,
        authorName: actor.name,
      });

      const { storagePath: _sp, originalImagePath: _oip, ...safeAttachment } = updated;
      return {
        attachmentNotFound: false as const,
        attachment: {
          ...safeAttachment,
          hasFile: Boolean(updated.storagePath),
          hasOriginalImage: Boolean(updated.originalImagePath),
        },
      };
    });
  }

  static async findAttachmentFile(occurrenceId: number, attachmentId: number) {
    const [att] = await db.select({
      id: occurrenceAttachments.id,
      storagePath: occurrenceAttachments.storagePath,
      originalImagePath: occurrenceAttachments.originalImagePath,
      mimeType: occurrenceAttachments.mimeType,
    }).from(occurrenceAttachments)
      .where(and(eq(occurrenceAttachments.id, attachmentId), eq(occurrenceAttachments.occurrenceId, occurrenceId)))
      .limit(1);
    return att || null;
  }

  static async getAnalyticsStats(filters: {
    from?: string;
    to?: string;
    sector?: OccurrenceSector;
    type?: OccurrenceType;
  }): Promise<OccurrenceAnalyticsResponse> {
    const conditions = buildConditions({
      from: filters.from,
      to: filters.to,
      sector: filters.sector,
      type: filters.type,
      page: 1,
      pageSize: 10,
    });
    const where = conditions.length ? and(...conditions) : undefined;

    const activeStatusSql = sql`('OPEN', 'ABERTA', 'IN_PROGRESS', 'EM_ATENDIMENTO', 'AGUARDANDO')`;
    const openStatusSql = sql`('OPEN', 'ABERTA')`;
    const inProgressStatusSql = sql`('IN_PROGRESS', 'EM_ATENDIMENTO', 'AGUARDANDO')`;
    const resolvedStatusSql = sql`('CLOSED', 'CONCLUIDA')`;
    const firstRespMinSql = sql`EXTRACT(EPOCH FROM (${productionOccurrences.firstResponseAt} - ${productionOccurrences.openedAt})) / 60.0`;
    const mttrMinSql = sql`EXTRACT(EPOCH FROM (${productionOccurrences.resolvedAt} - ${productionOccurrences.openedAt})) / 60.0`;
    const activeAgeMinSql = sql`EXTRACT(EPOCH FROM (now() - ${productionOccurrences.openedAt})) / 60.0`;
    const trimmedComponentSql = sql<string>`BTRIM(${productionOccurrences.componentCode})`;

    const [
      summaryRows,
      sectorRows,
      priorityRows,
      typeRows,
      topComponentRows,
      topPvRows,
      weeklyOpenedRows,
      weeklyResolvedRows,
      latestImportRows,
    ] = await Promise.all([
      db.select({
        total: sql<number>`count(*)`,
        open: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${openStatusSql})`,
        inProgress: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${inProgressStatusSql})`,
        resolved: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql})`,
        cancelled: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} = 'CANCELADA')`,
        recurrenceCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.isRecurrence} = true)`,
        slaBreachedActive: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql} AND ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.slaDueAt} < now())`,
        slaEvaluatedCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} IS NOT NULL)`,
        slaMetCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} <= ${productionOccurrences.slaDueAt})`,
        firstResponseSampleCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.firstResponseAt} IS NOT NULL AND ${productionOccurrences.firstResponseAt} >= ${productionOccurrences.openedAt})`,
        avgFirstResponseMinutes: sql<string | null>`(AVG(${firstRespMinSql}) FILTER (WHERE ${productionOccurrences.firstResponseAt} IS NOT NULL AND ${productionOccurrences.firstResponseAt} >= ${productionOccurrences.openedAt}))::double precision`,
        medianFirstResponseMinutes: sql<string | null>`(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${firstRespMinSql}) FILTER (WHERE ${productionOccurrences.firstResponseAt} IS NOT NULL AND ${productionOccurrences.firstResponseAt} >= ${productionOccurrences.openedAt}))::double precision`,
        mttrSampleCount: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.resolvedAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} >= ${productionOccurrences.openedAt})`,
        avgMttrMinutes: sql<string | null>`(AVG(${mttrMinSql}) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.resolvedAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} >= ${productionOccurrences.openedAt}))::double precision`,
        medianMttrMinutes: sql<string | null>`(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${mttrMinSql}) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.resolvedAt} IS NOT NULL AND ${productionOccurrences.resolvedAt} >= ${productionOccurrences.openedAt}))::double precision`,
      }).from(productionOccurrences).where(where),

      db.select({
        sector: productionOccurrences.sector,
        open: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${openStatusSql})`,
        inProgress: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${inProgressStatusSql})`,
        totalActive: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql})`,
        slaBreached: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql} AND ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.slaDueAt} < now())`,
        avgAgeMinutes: sql<string | null>`(AVG(${activeAgeMinSql}) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql} AND ${productionOccurrences.openedAt} <= now()))::double precision`,
      }).from(productionOccurrences).where(where).groupBy(productionOccurrences.sector),

      db.select({
        priority: productionOccurrences.priority,
        totalActive: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql})`,
        slaBreached: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql} AND ${productionOccurrences.slaDueAt} IS NOT NULL AND ${productionOccurrences.slaDueAt} < now())`,
      }).from(productionOccurrences).where(where).groupBy(productionOccurrences.priority),

      db.select({
        type: productionOccurrences.type,
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql})`,
        resolved: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${resolvedStatusSql})`,
      }).from(productionOccurrences).where(where).groupBy(productionOccurrences.type),

      db.select({
        componentCode: trimmedComponentSql,
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql})`,
        recurrences: sql<number>`count(*) FILTER (WHERE ${productionOccurrences.isRecurrence} = true)`,
        impactedOps: sql<number>`count(DISTINCT ${effectiveOp})`,
      }).from(productionOccurrences)
        .where(where ? and(where, sql`NULLIF(BTRIM(${productionOccurrences.componentCode}), '') IS NOT NULL`) : sql`NULLIF(BTRIM(${productionOccurrences.componentCode}), '') IS NOT NULL`)
        .groupBy(trimmedComponentSql)
        .orderBy(sql`count(*) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql}) DESC`, sql`count(*) DESC`, trimmedComponentSql)
        .limit(8),

      db.select({
        pvNumber: sql<string>`${effectivePv}`,
        clienteNome: sql<string | null>`CASE WHEN count(DISTINCT NULLIF(BTRIM(${protheusSalesOrders.clienteNome}), '')) = 1 THEN MAX(NULLIF(BTRIM(${protheusSalesOrders.clienteNome}), '')) ELSE NULL END`,
        total: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
        active: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql})`,
        impactedOps: sql<number>`count(DISTINCT ${effectiveOp})`,
      }).from(productionOccurrences)
        .leftJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        ))
        .where(where ? and(where, sql`${effectivePv} IS NOT NULL`) : sql`${effectivePv} IS NOT NULL`)
        .groupBy(effectivePv)
        .orderBy(sql`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} IN ${activeStatusSql}) DESC`, sql`count(DISTINCT ${productionOccurrences.id}) DESC`, effectivePv)
        .limit(8),

      db.select({
        week: sql<string>`TO_CHAR(date_trunc('week', ${productionOccurrences.openedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(productionOccurrences)
        .where(where)
        .groupBy(sql`date_trunc('week', ${productionOccurrences.openedAt})`)
        .orderBy(sql`date_trunc('week', ${productionOccurrences.openedAt}) DESC`)
        .limit(12),

      db.select({
        week: sql<string>`TO_CHAR(date_trunc('week', ${productionOccurrences.resolvedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(productionOccurrences)
        .where(where
          ? and(where, sql`${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.resolvedAt} IS NOT NULL`)
          : sql`${productionOccurrences.status} IN ${resolvedStatusSql} AND ${productionOccurrences.resolvedAt} IS NOT NULL`)
        .groupBy(sql`date_trunc('week', ${productionOccurrences.resolvedAt})`)
        .orderBy(sql`date_trunc('week', ${productionOccurrences.resolvedAt}) DESC`)
        .limit(12),

      db.select({
        batchCode: protheusImportBatches.batchCode,
        sourceType: protheusImportBatches.sourceType,
        entityType: protheusImportBatches.entityType,
        recordsCount: protheusImportBatches.recordsCount,
        status: protheusImportBatches.status,
        createdAt: protheusImportBatches.createdAt,
      }).from(protheusImportBatches).orderBy(desc(protheusImportBatches.createdAt)).limit(1),
    ]);

    const s = summaryRows[0];
    const total = Number(s?.total || 0);
    const open = Number(s?.open || 0);
    const inProgress = Number(s?.inProgress || 0);
    const resolved = Number(s?.resolved || 0);
    const cancelled = Number(s?.cancelled || 0);
    const recurrenceCount = Number(s?.recurrenceCount || 0);
    const slaEvaluatedCount = Number(s?.slaEvaluatedCount || 0);
    const slaMetCount = Number(s?.slaMetCount || 0);

    return {
      period: {
        from: filters.from || null,
        to: filters.to || null,
        sector: filters.sector || null,
        type: filters.type || null,
      },
      summary: {
        total,
        open,
        inProgress,
        resolved,
        cancelled,
        activeBacklog: open + inProgress,
        recurrenceCount,
        recurrenceRatePercent: total > 0 ? roundOneDecimal((recurrenceCount / total) * 100) : null,
        slaBreachedActive: Number(s?.slaBreachedActive || 0),
        slaCompliancePercent: slaEvaluatedCount > 0 ? roundOneDecimal((slaMetCount / slaEvaluatedCount) * 100) : null,
      },
      responseMetrics: {
        avgFirstResponseMinutes: s?.avgFirstResponseMinutes != null ? roundOneDecimal(Number(s.avgFirstResponseMinutes)) : null,
        medianFirstResponseMinutes: s?.medianFirstResponseMinutes != null ? roundOneDecimal(Number(s.medianFirstResponseMinutes)) : null,
        firstResponseSampleCount: Number(s?.firstResponseSampleCount || 0),
        avgMttrMinutes: s?.avgMttrMinutes != null ? roundOneDecimal(Number(s.avgMttrMinutes)) : null,
        medianMttrMinutes: s?.medianMttrMinutes != null ? roundOneDecimal(Number(s.medianMttrMinutes)) : null,
        mttrSampleCount: Number(s?.mttrSampleCount || 0),
      },
      backlogBySector: normalizeSectorBuckets(
        sectorRows.map((row) => ({
          sector: row.sector,
          open: Number(row.open || 0),
          inProgress: Number(row.inProgress || 0),
          totalActive: Number(row.totalActive || 0),
          slaBreached: Number(row.slaBreached || 0),
          avgAgeMinutes: row.avgAgeMinutes != null ? Number(row.avgAgeMinutes) : null,
        })),
      ),
      backlogByPriority: normalizePriorityBuckets(
        priorityRows.map((row) => ({
          priority: row.priority,
          totalActive: Number(row.totalActive || 0),
          slaBreached: Number(row.slaBreached || 0),
        })),
      ),
      byType: normalizeTypeBuckets(
        typeRows.map((row) => ({
          type: row.type,
          total: Number(row.total || 0),
          active: Number(row.active || 0),
          resolved: Number(row.resolved || 0),
        })),
      ),
      topComponents: topComponentRows.map((row) => ({
        componentCode: row.componentCode,
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        recurrences: Number(row.recurrences || 0),
        impactedOps: Number(row.impactedOps || 0),
      })),
      topPvs: topPvRows.map((row) => ({
        pvNumber: row.pvNumber,
        clienteNome: row.clienteNome || null,
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        impactedOps: Number(row.impactedOps || 0),
      })),
      weeklyTrend: mergeWeeklyTrends(
        weeklyOpenedRows.map((row) => ({ week: row.week, count: Number(row.count || 0) })),
        weeklyResolvedRows.map((row) => ({ week: row.week, count: Number(row.count || 0) })),
        10,
      ),
      mirrorFreshness: evaluateMirrorFreshness(latestImportRows[0] || null),
    };
  }

  static async exportRows(filters: Omit<OccurrenceFilters, 'page' | 'pageSize'>, limit = 5000): Promise<OccurrenceCsvExportRow[]> {
    const conditions = buildConditions({ ...filters, page: 1, pageSize: limit });
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await joins()
      .where(where)
      .orderBy(desc(productionOccurrences.openedAt), desc(productionOccurrences.id))
      .limit(limit);

    const seen = new Set<number>();
    const uniqueRows = rows.filter((row) => {
      if (seen.has(row.occurrence.id)) return false;
      seen.add(row.occurrence.id);
      return true;
    });

    const usersMap = await loadUsersMap(uniqueRows.flatMap((row) => [row.occurrence.requesterId, row.occurrence.assigneeId]));
    return uniqueRows.map((row) => {
      const occ = row.occurrence;
      const assignee = occ.assigneeId ? usersMap.get(occ.assigneeId) || null : null;
      const requester = occ.requesterId ? usersMap.get(occ.requesterId) || null : null;
      return {
        id: occ.id,
        code: occ.code,
        openedAt: occ.openedAt,
        type: occ.type,
        occurrenceType: occ.occurrenceType,
        sector: occ.sector,
        priority: occ.priority,
        status: occ.status,
        slaDueAt: occ.slaDueAt,
        resolvedAt: occ.resolvedAt,
        numeroOp: occ.numeroOp || row.op?.numeroOp || null,
        pvNumber: occ.pvNumber || row.op?.numeroPv || null,
        parentProduct: occ.parentProduct || row.op?.codigoProduto || null,
        componentCode: occ.componentCode,
        warehouse: occ.warehouse,
        currentBalance: occ.currentBalance,
        isRecurrence: occ.isRecurrence,
        requesterName: requester?.name || occ.createdByName || null,
        assigneeName: assignee?.name || null,
        workstation: occ.workstation,
        operation: occ.operation,
        description: occ.description,
        resolutionText: occ.resolutionText,
      };
    });
  }

  static async loadImportValidationContext(opNumbers: string[], codes: string[]): Promise<{
    mirrorOrdersMap: Map<string, MirrorOrderLookupRow>;
    existingRows: ExistingOccurrenceSignatureRow[];
  }> {
    const uniqueOps = [...new Set(opNumbers.map((op) => op.trim()).filter(Boolean))];
    const uniqueCodes = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];

    const [mirrorOrders, existingRecent] = await Promise.all([
      uniqueOps.length
        ? db.select({
            numeroOp: protheusProductionOrders.numeroOp,
            numeroPv: protheusProductionOrders.numeroPv,
            codigoProduto: protheusProductionOrders.codigoProduto,
          }).from(protheusProductionOrders).where(inArray(protheusProductionOrders.numeroOp, uniqueOps))
        : Promise.resolve([]),
      db.select({
        id: productionOccurrences.id,
        code: productionOccurrences.code,
        numeroOp: productionOccurrences.numeroOp,
        componentCode: productionOccurrences.componentCode,
        type: productionOccurrences.type,
        description: productionOccurrences.description,
      }).from(productionOccurrences)
        .where(
          uniqueOps.length && uniqueCodes.length
            ? or(inArray(productionOccurrences.numeroOp, uniqueOps), inArray(productionOccurrences.code, uniqueCodes))
            : uniqueOps.length
              ? inArray(productionOccurrences.numeroOp, uniqueOps)
              : uniqueCodes.length
                ? inArray(productionOccurrences.code, uniqueCodes)
                : undefined,
        )
        .orderBy(desc(productionOccurrences.openedAt), desc(productionOccurrences.id))
        .limit(2000),
    ]);

    const mirrorOrdersMap = new Map<string, MirrorOrderLookupRow>();
    for (const order of mirrorOrders) {
      mirrorOrdersMap.set(order.numeroOp.trim().toUpperCase(), order);
    }
    return { mirrorOrdersMap, existingRows: existingRecent };
  }

  static async importHistoricalBatch(
    rows: NormalizedOccurrenceImportRow[],
    actor: { id: number; uid: string; name: string },
  ): Promise<Array<{ id: number; code: string; numeroOp: string | null }>> {
    if (rows.length === 0) return [];
    return db.transaction(async (tx) => {
      const createdList: Array<{ id: number; code: string; numeroOp: string | null }> = [];
      for (const item of rows) {
        const openedAtDate = new Date(item.openedAt);
        const resolvedAtDate = item.resolvedAt ? new Date(item.resolvedAt) : null;
        const slaDueAtDate = new Date(item.slaDueAt);
        const isClosed = isClosedOccurrenceStatus(item.status);
        const firstResponseAtDate =
          item.status === 'EM_ATENDIMENTO' || item.status === 'AGUARDANDO' || isClosed
            ? resolvedAtDate || openedAtDate
            : null;

        let isRecurrence = false;
        let parentOccurrenceId: number | null = null;
        if (item.componentCode && item.numeroOp) {
          const thirtyDaysBefore = new Date(openedAtDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          const [prior] = await tx.select({ id: productionOccurrences.id })
            .from(productionOccurrences)
            .where(and(
              eq(productionOccurrences.componentCode, item.componentCode),
              eq(productionOccurrences.numeroOp, item.numeroOp),
              gte(productionOccurrences.openedAt, thirtyDaysBefore),
              lte(productionOccurrences.openedAt, openedAtDate),
              ne(productionOccurrences.status, 'CANCELADA'),
            ))
            .orderBy(desc(productionOccurrences.openedAt), desc(productionOccurrences.id))
            .limit(1);
          if (prior) {
            isRecurrence = true;
            parentOccurrenceId = prior.id;
          }
        }

        const [inserted] = await tx.insert(productionOccurrences).values({
          code: `TMP-${randomUUID()}`,
          type: item.type,
          numeroOp: item.numeroOp,
          pvNumber: item.pvNumber,
          parentProduct: item.parentProduct,
          componentCode: item.componentCode,
          warehouse: item.warehouse,
          currentBalance: item.currentBalance,
          occurrenceType: item.occurrenceType,
          description: item.description,
          operation: item.operation,
          workstation: item.workstation,
          immediateAction: item.immediateAction,
          requesterId: actor.id,
          assigneeId: isClosed ? actor.id : null,
          sector: item.sector,
          status: item.status,
          priority: item.priority,
          slaMinutes: item.slaMinutes,
          slaDueAt: slaDueAtDate,
          openedAt: openedAtDate,
          firstResponseAt: firstResponseAtDate,
          resolvedAt: isClosed ? resolvedAtDate || openedAtDate : null,
          closedAt: isClosed ? resolvedAtDate || openedAtDate : null,
          resolutionText: item.resolutionText,
          isRecurrence,
          parentOccurrenceId,
          createdByUid: actor.uid,
          createdByName: actor.name,
        }).returning();

        const year = (inserted.openedAt || openedAtDate).getFullYear();
        const finalCode = `OC-${year}-${String(inserted.id).padStart(3, '0')}`;
        const [created] = await tx.update(productionOccurrences)
          .set({ code: finalCode })
          .where(eq(productionOccurrences.id, inserted.id))
          .returning();

        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: created.id,
          eventType: 'CREATED',
          message: item.legacyCode
            ? `Importação histórica validada (referência origem: ${item.legacyCode}).`
            : 'Importação histórica validada.',
          newStatus: item.status,
          authorUid: actor.uid,
          authorName: actor.name,
        });

        createdList.push({ id: created.id, code: created.code, numeroOp: created.numeroOp });
      }
      return createdList;
    });
  }
}
