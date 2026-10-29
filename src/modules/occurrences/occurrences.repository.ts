import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  productionOccurrenceEvents,
  productionOccurrences,
  protheusProductionOrders,
  protheusSalesOrders,
} from '../../db/schema.ts';

export interface OccurrenceFilters {
  search?: string;
  numeroOp?: string;
  numeroPv?: string;
  status?: string;
  occurrenceType?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

const normalizedPv = sql<string>`NULLIF(BTRIM(${protheusProductionOrders.numeroPv}), '')`;
const groupKey = sql<string>`CASE WHEN ${normalizedPv} IS NULL THEN 'OP:' || ${protheusProductionOrders.numeroOp} ELSE 'PV:' || ${normalizedPv} END`;

function buildConditions(filters: OccurrenceFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(
      ilike(productionOccurrences.numeroOp, pattern),
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
  if (filters.numeroPv) conditions.push(ilike(protheusProductionOrders.numeroPv, `%${filters.numeroPv}%`));
  if (filters.status) conditions.push(eq(productionOccurrences.status, filters.status));
  if (filters.occurrenceType) conditions.push(ilike(productionOccurrences.occurrenceType, `%${filters.occurrenceType}%`));
  if (filters.from) conditions.push(gte(productionOccurrences.createdAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to) conditions.push(lte(productionOccurrences.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
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
  .innerJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
  .leftJoin(protheusSalesOrders, and(
    eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
    eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
  ));

export class OccurrencesRepository {
  static async list(filters: OccurrenceFilters) {
    const conditions = buildConditions(filters);
    const where = conditions.length ? and(...conditions) : undefined;
    const [summaryRows, groups, weeklyRows, typeRows] = await Promise.all([
      db.select({
        totalOccurrences: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
        open: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} = 'OPEN')`,
        inProgress: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} = 'IN_PROGRESS')`,
        closed: sql<number>`count(DISTINCT ${productionOccurrences.id}) FILTER (WHERE ${productionOccurrences.status} = 'CLOSED')`,
        impactedOps: sql<number>`count(DISTINCT ${productionOccurrences.numeroOp})`,
        impactedPvs: sql<number>`count(DISTINCT ${normalizedPv})`,
        totalGroups: sql<number>`count(DISTINCT ${groupKey})`,
      }).from(productionOccurrences)
        .innerJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where),
      db.selectDistinct({ key: groupKey }).from(productionOccurrences)
        .innerJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where).orderBy(groupKey).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
      db.select({
        week: sql<string>`TO_CHAR(date_trunc('week', ${productionOccurrences.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
      }).from(productionOccurrences)
        .innerJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
        .leftJoin(protheusSalesOrders, and(
          eq(protheusSalesOrders.numeroPv, protheusProductionOrders.numeroPv),
          eq(protheusSalesOrders.itemPv, protheusProductionOrders.itemPv),
        )).where(where)
        .groupBy(sql`date_trunc('week', ${productionOccurrences.createdAt})`)
        .orderBy(sql`date_trunc('week', ${productionOccurrences.createdAt})`),
      db.select({
        type: productionOccurrences.occurrenceType,
        total: sql<number>`count(DISTINCT ${productionOccurrences.id})`,
      }).from(productionOccurrences)
        .innerJoin(protheusProductionOrders, eq(productionOccurrences.numeroOp, protheusProductionOrders.numeroOp))
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
    const selectedGroupCondition = or(
      pvNumbers.length ? inArray(normalizedPv, pvNumbers) : undefined,
      opNumbersWithoutPv.length ? inArray(protheusProductionOrders.numeroOp, opNumbersWithoutPv) : undefined,
    );
    const pageConditions = [...conditions, ...(selectedGroupCondition ? [selectedGroupCondition] : [])];
    const pageWhere = pageConditions.length ? and(...pageConditions) : undefined;
    const rows = selectedKeys.length ? await joins().where(pageWhere).orderBy(desc(productionOccurrences.createdAt)) : [];

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const op = row.op;
      const key = op.numeroPv?.trim() ? `PV:${op.numeroPv}` : `OP:${op.numeroOp}`;
      if (!grouped.has(key)) grouped.set(key, {
        numeroPv: op.numeroPv?.trim() || null,
        clientesEncontrados: new Set<string>(),
        ops: new Map<string, any>(),
      });
      const pvGroup = grouped.get(key);
      if (row.clienteNome?.trim()) pvGroup.clientesEncontrados.add(row.clienteNome.trim());
      if (!pvGroup.ops.has(op.numeroOp)) pvGroup.ops.set(op.numeroOp, {
        numeroOp: op.numeroOp,
        codigoProduto: op.codigoProduto,
        descricaoProduto: op.descricaoProduto,
        itemPv: op.itemPv,
        occurrences: [],
      });
      const occurrencesForOp = pvGroup.ops.get(op.numeroOp).occurrences as Array<{ id: number }>;
      if (!occurrencesForOp.some((item) => item.id === row.occurrence.id)) occurrencesForOp.push(row.occurrence);
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
    const events = await db.select().from(productionOccurrenceEvents)
      .where(eq(productionOccurrenceEvents.occurrenceId, id)).orderBy(asc(productionOccurrenceEvents.createdAt), asc(productionOccurrenceEvents.id));
    const [op] = await db.select({
      numeroPv: protheusProductionOrders.numeroPv,
      codigoProduto: protheusProductionOrders.codigoProduto,
      descricaoProduto: protheusProductionOrders.descricaoProduto,
    }).from(protheusProductionOrders).where(eq(protheusProductionOrders.numeroOp, occurrence.numeroOp)).limit(1);
    return { ...occurrence, op: op || null, events };
  }

  static async create(input: {
    numeroOp: string; occurrenceType: string; description: string; operation: string | null;
    workstation: string | null; immediateAction: string | null; authorUid: string; authorName: string;
  }) {
    return db.transaction(async (tx) => {
      const [created] = await tx.insert(productionOccurrences).values({
        numeroOp: input.numeroOp,
        occurrenceType: input.occurrenceType,
        description: input.description,
        operation: input.operation,
        workstation: input.workstation,
        immediateAction: input.immediateAction,
        status: 'OPEN',
        createdByUid: input.authorUid,
        createdByName: input.authorName,
      }).returning();
      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: created.id,
        eventType: 'CREATED',
        message: 'Registro inicial da ocorrência.',
        newStatus: 'OPEN',
        authorUid: input.authorUid,
        authorName: input.authorName,
      });
      return created;
    });
  }

  static async addEvent(id: number, input: { message: string; authorUid: string; authorName: string }) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (current.status === 'CLOSED') return { closed: true as const };
      const [event] = await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id, eventType: 'NOTE', message: input.message,
        authorUid: input.authorUid, authorName: input.authorName,
      }).returning();
      await tx.update(productionOccurrences).set({ updatedAt: new Date() }).where(eq(productionOccurrences.id, id));
      return { closed: false as const, event };
    });
  }

  static async changeStatus(id: number, status: string, message: string, authorUid: string, authorName: string) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productionOccurrences).where(eq(productionOccurrences.id, id)).limit(1);
      if (!current) return null;
      if (current.status === status) {
        await tx.insert(productionOccurrenceEvents).values({
          occurrenceId: id, eventType: 'NOTE', message,
          authorUid, authorName,
        });
        await tx.update(productionOccurrences).set({ updatedAt: new Date() }).where(eq(productionOccurrences.id, id));
        return current;
      }
      const [updated] = await tx.update(productionOccurrences).set({ status, updatedAt: new Date() })
        .where(eq(productionOccurrences.id, id)).returning();
      await tx.insert(productionOccurrenceEvents).values({
        occurrenceId: id,
        eventType: 'STATUS_CHANGED',
        message,
        previousStatus: current.status,
        newStatus: status,
        authorUid,
        authorName,
      });
      return updated;
    });
  }
}

