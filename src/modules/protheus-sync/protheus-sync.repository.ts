import { db } from '../../db/index.ts';
import {
  protheusImportBatches,
  protheusProducts,
  protheusProductStructures,
  protheusRoutings,
  protheusSalesOrders,
  protheusProductionOrders,
  protheusProductionAppointments,
  protheusResources,
  protheusCommitments,
} from '../../db/schema.ts';
import { sql, eq, desc, and, ilike, or } from 'drizzle-orm';
import {
  NormalizedProduct,
  NormalizedStructure,
  NormalizedRouting,
  NormalizedSalesOrder,
  NormalizedProductionOrder,
  NormalizedAppointment,
  NormalizedResource,
  NormalizedCommitment,
  ProtheusSourceType,
  ProtheusEntityType,
} from './protheus-sync.types.ts';

export class ProtheusSyncRepository {
  public static async upsertResources(resources: NormalizedResource[], batchId: number, executor: any = db) {
    let count = 0;
    for (const resource of resources) {
      await executor.insert(protheusResources).values({
        ...resource, batchId, updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [protheusResources.branch, protheusResources.resourceCode],
        set: { ...resource, batchId, updatedAt: new Date() },
      });
      count++;
    }
    return count;
  }

  public static async upsertCommitments(commitments: NormalizedCommitment[], batchId: number, executor: any = db) {
    let count = 0;
    for (const commitment of commitments) {
      await executor.insert(protheusCommitments).values({
        ...commitment, batchId, updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: protheusCommitments.sourceKey,
        set: { ...commitment, batchId, updatedAt: new Date() },
      });
      count++;
    }
    return count;
  }

  public static async createBatch(
    batchCode: string,
    sourceType: ProtheusSourceType,
    entityType: ProtheusEntityType,
    importedBy?: string
  ) {
    const [batch] = await db
      .insert(protheusImportBatches)
      .values({
        batchCode,
        sourceType,
        entityType,
        recordsCount: 0,
        status: 'PROCESSED',
        importedBy: importedBy || 'SYSTEM',
      })
      .returning();
    return batch;
  }

  public static async updateBatchSummary(
    batchId: number,
    recordsCount: number,
    status: 'PROCESSED' | 'FAILED',
    summary: string,
    executor: any = db
  ) {
    await executor
      .update(protheusImportBatches)
      .set({
        recordsCount,
        status,
        summary,
      })
      .where(eq(protheusImportBatches.id, batchId));
  }

  public static async upsertProducts(products: NormalizedProduct[], batchId: number, executor: any = db) {
    if (products.length === 0) return 0;

    let affected = 0;
    for (const p of products) {
      if (!p.codigoProduto) continue;
      await executor
        .insert(protheusProducts)
        .values({
          codigoProduto: p.codigoProduto,
          descricao: p.descricao,
          tipo: p.tipo,
          unidadeMedida: p.unidadeMedida,
          revisao: p.revisao,
          armazemPadrao: p.armazemPadrao,
          batchId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: protheusProducts.codigoProduto,
          set: {
            descricao: p.descricao,
            tipo: p.tipo,
            unidadeMedida: p.unidadeMedida,
            revisao: p.revisao,
            armazemPadrao: p.armazemPadrao,
            batchId,
            updatedAt: new Date(),
          },
        });
      affected++;
    }
    return affected;
  }

  public static async upsertStructures(structures: NormalizedStructure[], batchId: number, executor: any = db) {
    if (structures.length === 0) return 0;

    let affected = 0;
    for (const s of structures) {
      if (!s.codigoProdutoPai || !s.codigoComponente) continue;
      await executor
        .insert(protheusProductStructures)
        .values({
          codigoProdutoPai: s.codigoProdutoPai,
          codigoComponente: s.codigoComponente,
          descricaoComponente: s.descricaoComponente,
          quantidadeNecessaria: String(s.quantidadeNecessaria),
          unidadeComponente: s.unidadeComponente,
          perdaPercentual: s.perdaPercentual !== undefined ? String(s.perdaPercentual) : null,
          revisao: s.revisao,
          batchId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            protheusProductStructures.codigoProdutoPai,
            protheusProductStructures.codigoComponente,
          ],
          set: {
            descricaoComponente: s.descricaoComponente,
            quantidadeNecessaria: String(s.quantidadeNecessaria),
            unidadeComponente: s.unidadeComponente,
            perdaPercentual: s.perdaPercentual !== undefined ? String(s.perdaPercentual) : null,
            revisao: s.revisao,
            batchId,
            updatedAt: new Date(),
          },
        });
      affected++;
    }
    return affected;
  }

  public static async upsertRoutings(routings: NormalizedRouting[], batchId: number, executor: any = db) {
    if (routings.length === 0) return 0;

    let affected = 0;
    for (const r of routings) {
      if (!r.codigoProduto || !r.codigoRoteiro || !r.sequenciaOperacao) continue;
      await executor
        .insert(protheusRoutings)
        .values({
          codigoProduto: r.codigoProduto,
          codigoRoteiro: r.codigoRoteiro,
          sequenciaOperacao: r.sequenciaOperacao,
          codigoOperacao: r.codigoOperacao,
          descricaoOperacao: r.descricaoOperacao,
          postoTrabalho: r.postoTrabalho,
          tempoPadraoMinutos: r.tempoPadraoMinutos !== undefined ? String(r.tempoPadraoMinutos) : null,
          batchId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            protheusRoutings.codigoProduto,
            protheusRoutings.codigoRoteiro,
            protheusRoutings.sequenciaOperacao,
          ],
          set: {
            codigoOperacao: r.codigoOperacao,
            descricaoOperacao: r.descricaoOperacao,
            postoTrabalho: r.postoTrabalho,
            tempoPadraoMinutos: r.tempoPadraoMinutos !== undefined ? String(r.tempoPadraoMinutos) : null,
            batchId,
            updatedAt: new Date(),
          },
        });
      affected++;
    }
    return affected;
  }

  public static async upsertSalesOrders(orders: NormalizedSalesOrder[], batchId: number, executor: any = db) {
    if (orders.length === 0) return 0;

    let affected = 0;
    for (const o of orders) {
      if (!o.numeroPv || !o.itemPv) continue;
      await executor
        .insert(protheusSalesOrders)
        .values({
          numeroPv: o.numeroPv,
          itemPv: o.itemPv,
          clienteCodigo: o.clienteCodigo,
          clienteNome: o.clienteNome,
          clienteCnpj: o.clienteCnpj,
          codigoProduto: o.codigoProduto,
          descricaoProduto: o.descricaoProduto,
          quantidadePedida: String(o.quantidadePedida),
          quantidadeEntregue: String(o.quantidadeEntregue || 0),
          unidadeMedida: o.unidadeMedida,
          dataEmissao: o.dataEmissao,
          dataEntrega: o.dataEntrega,
          statusProtheus: o.statusProtheus,
          batchId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [protheusSalesOrders.numeroPv, protheusSalesOrders.itemPv],
          set: {
            clienteCodigo: o.clienteCodigo,
            clienteNome: o.clienteNome,
            clienteCnpj: o.clienteCnpj,
            codigoProduto: o.codigoProduto,
            descricaoProduto: o.descricaoProduto,
            quantidadePedida: String(o.quantidadePedida),
            quantidadeEntregue: String(o.quantidadeEntregue || 0),
            unidadeMedida: o.unidadeMedida,
            dataEmissao: o.dataEmissao,
            dataEntrega: o.dataEntrega,
            statusProtheus: o.statusProtheus,
            batchId,
            updatedAt: new Date(),
          },
        });
      affected++;
    }
    return affected;
  }

  public static async upsertProductionOrders(orders: NormalizedProductionOrder[], batchId: number, executor: any = db) {
    if (orders.length === 0) return 0;

    let affected = 0;
    for (const o of orders) {
      if (!o.numeroOp) continue;
      await executor
        .insert(protheusProductionOrders)
        .values({
          numeroOp: o.numeroOp,
          codigoProduto: o.codigoProduto,
          descricaoProduto: o.descricaoProduto,
          numeroPv: o.numeroPv,
          itemPv: o.itemPv,
          codigoRoteiro: o.codigoRoteiro,
          quantidadePlanejada: String(o.quantidadePlanejada),
          quantidadeProduzida: String(o.quantidadeProduzida || 0),
          quantidadeRefugo: String(o.quantidadeRefugo || 0),
          saldoAProduzir: String(o.saldoAProduzir || 0),
          statusProtheus: o.statusProtheus,
          etapaAtual: o.etapaAtual,
          dataEmissao: o.dataEmissao,
          dataInicioReal: o.dataInicioReal,
          dataPrevisaoFim: o.dataPrevisaoFim,
          dataConclusaoReal: o.dataConclusaoReal,
          batchId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: protheusProductionOrders.numeroOp,
          set: {
            codigoProduto: o.codigoProduto,
            descricaoProduto: o.descricaoProduto,
            numeroPv: o.numeroPv,
            itemPv: o.itemPv,
            codigoRoteiro: o.codigoRoteiro,
            quantidadePlanejada: String(o.quantidadePlanejada),
            quantidadeProduzida: String(o.quantidadeProduzida || 0),
            quantidadeRefugo: String(o.quantidadeRefugo || 0),
            saldoAProduzir: String(o.saldoAProduzir || 0),
            statusProtheus: o.statusProtheus,
            etapaAtual: o.etapaAtual,
            dataEmissao: o.dataEmissao,
            dataInicioReal: o.dataInicioReal,
            dataPrevisaoFim: o.dataPrevisaoFim,
            dataConclusaoReal: o.dataConclusaoReal,
            batchId,
            updatedAt: new Date(),
          },
        });
      affected++;
    }
    return affected;
  }

  public static async insertAppointments(appointments: NormalizedAppointment[], batchId: number, executor: any = db) {
    if (appointments.length === 0) return 0;

    let count = 0;
    for (const a of appointments) {
      if (!a.numeroOp || !a.sequenciaOperacao) continue;
      await executor.insert(protheusProductionAppointments).values({
        numeroOp: a.numeroOp,
        sequenciaOperacao: a.sequenciaOperacao,
        codigoOperacao: a.codigoOperacao,
        descricaoOperacao: a.descricaoOperacao,
        postoTrabalho: a.postoTrabalho,
        operador: a.operador,
        quantidadeProduzida: String(a.quantidadeProduzida),
        quantidadeRefugo: String(a.quantidadeRefugo || 0),
        dataApontamento: a.dataApontamento,
        horaInicio: a.horaInicio,
        horaFim: a.horaFim,
        tipoApontamento: a.tipoApontamento,
        motivoRefugo: a.motivoRefugo,
        batchId,
      });
      count++;
    }

    return count;
  }

  // ==================== QUERY METHODS ====================

  public static async listSalesOrders(params?: { search?: string; status?: string; limit?: number }) {
    const limit = params?.limit || 100;
    let query = db.select().from(protheusSalesOrders);

    if (params?.status) {
      query = query.where(eq(protheusSalesOrders.statusProtheus, params.status)) as any;
    }

    const rows = await query.orderBy(desc(protheusSalesOrders.id)).limit(limit);

    // Group items by numeroPv to provide consolidated view
    const pvsMap: Record<
      string,
      {
        numeroPv: string;
        clienteNome: string;
        clienteCnpj?: string | null;
        clienteCodigo?: string | null;
        dataEmissao: string;
        dataEntrega: string;
        statusProtheus: string;
        itemsCount: number;
        items: typeof rows;
      }
    > = {};

    for (const r of rows) {
      if (!pvsMap[r.numeroPv]) {
        pvsMap[r.numeroPv] = {
          numeroPv: r.numeroPv,
          clienteNome: r.clienteNome,
          clienteCnpj: r.clienteCnpj,
          clienteCodigo: r.clienteCodigo,
          dataEmissao: r.dataEmissao,
          dataEntrega: r.dataEntrega,
          statusProtheus: r.statusProtheus,
          itemsCount: 0,
          items: [],
        };
      }
      pvsMap[r.numeroPv].itemsCount++;
      pvsMap[r.numeroPv].items.push(r);
    }

    return Object.values(pvsMap);
  }

  public static async getSalesOrderDetail(numeroPv: string) {
    const items = await db
      .select()
      .from(protheusSalesOrders)
      .where(eq(protheusSalesOrders.numeroPv, numeroPv))
      .orderBy(protheusSalesOrders.itemPv);

    if (items.length === 0) return null;

    // Find linked production orders for this PV
    const linkedOps = await db
      .select()
      .from(protheusProductionOrders)
      .where(eq(protheusProductionOrders.numeroPv, numeroPv))
      .orderBy(protheusProductionOrders.numeroOp);

    return {
      pvHeader: {
        numeroPv: items[0].numeroPv,
        clienteNome: items[0].clienteNome,
        clienteCnpj: items[0].clienteCnpj,
        clienteCodigo: items[0].clienteCodigo,
        dataEmissao: items[0].dataEmissao,
        dataEntrega: items[0].dataEntrega,
        statusProtheus: items[0].statusProtheus,
      },
      items,
      linkedProductionOrders: linkedOps,
    };
  }

  public static async listProductionOrders(params?: {
    search?: string;
    status?: string;
    product?: string;
    pv?: string;
    limit?: number;
  }) {
    const limit = params?.limit || 100;
    let query = db.select().from(protheusProductionOrders);

    if (params?.status) {
      query = query.where(eq(protheusProductionOrders.statusProtheus, params.status)) as any;
    }
    if (params?.pv) {
      query = query.where(eq(protheusProductionOrders.numeroPv, params.pv)) as any;
    }
    if (params?.product) {
      query = query.where(eq(protheusProductionOrders.codigoProduto, params.product)) as any;
    }

    const rows = await query.orderBy(desc(protheusProductionOrders.id)).limit(limit);
    return rows;
  }

  public static async getProductionOrderDetail(numeroOp: string) {
    const opRows = await db
      .select()
      .from(protheusProductionOrders)
      .where(eq(protheusProductionOrders.numeroOp, numeroOp))
      .limit(1);

    if (opRows.length === 0) return null;
    const op = opRows[0];

    // Product master data
    const productRows = await db
      .select()
      .from(protheusProducts)
      .where(eq(protheusProducts.codigoProduto, op.codigoProduto))
      .limit(1);

    // Bill of Materials (Estrutura do Produto)
    const structureRows = await db
      .select()
      .from(protheusProductStructures)
      .where(eq(protheusProductStructures.codigoProdutoPai, op.codigoProduto))
      .orderBy(protheusProductStructures.codigoComponente);

    // Routings & Operations
    const routingRows = await db
      .select()
      .from(protheusRoutings)
      .where(eq(protheusRoutings.codigoProduto, op.codigoProduto))
      .orderBy(protheusRoutings.sequenciaOperacao);

    // Appointments (Apontamentos de Chão de Fábrica)
    const appointmentRows = await db
      .select()
      .from(protheusProductionAppointments)
      .where(eq(protheusProductionAppointments.numeroOp, numeroOp))
      .orderBy(desc(protheusProductionAppointments.id));

    // Linked Sales Order item if present
    let linkedPv = null;
    if (op.numeroPv) {
      const pvItems = await db
        .select()
        .from(protheusSalesOrders)
        .where(
          and(
            eq(protheusSalesOrders.numeroPv, op.numeroPv),
            op.itemPv ? eq(protheusSalesOrders.itemPv, op.itemPv) : undefined
          )
        );
      if (pvItems.length > 0) {
        linkedPv = pvItems[0];
      }
    }

    return {
      order: op,
      product: productRows[0] || null,
      structure: structureRows,
      routings: routingRows,
      appointments: appointmentRows,
      linkedPv,
    };
  }

  public static async listProducts(limit = 100) {
    return db.select().from(protheusProducts).orderBy(protheusProducts.codigoProduto).limit(limit);
  }

  public static async listBatches(limit = 50) {
    return db
      .select()
      .from(protheusImportBatches)
      .orderBy(desc(protheusImportBatches.id))
      .limit(limit);
  }

  public static async listNormalizedTableData(params: { entity: string; search: string; page: number; pageSize: number }) {
    const sourceMap: Record<string, { table: any; searchColumns: any[] }> = {
      salesOrders: {
        table: protheusSalesOrders,
        searchColumns: [protheusSalesOrders.numeroPv, protheusSalesOrders.itemPv, protheusSalesOrders.clienteNome, protheusSalesOrders.codigoProduto, protheusSalesOrders.descricaoProduto],
      },
      productionOrders: {
        table: protheusProductionOrders,
        searchColumns: [protheusProductionOrders.numeroOp, protheusProductionOrders.codigoProduto, protheusProductionOrders.descricaoProduto, protheusProductionOrders.numeroPv],
      },
      products: {
        table: protheusProducts,
        searchColumns: [protheusProducts.codigoProduto, protheusProducts.descricao, protheusProducts.tipo],
      },
      structures: {
        table: protheusProductStructures,
        searchColumns: [protheusProductStructures.codigoProdutoPai, protheusProductStructures.codigoComponente, protheusProductStructures.descricaoComponente],
      },
      routings: {
        table: protheusRoutings,
        searchColumns: [protheusRoutings.codigoProduto, protheusRoutings.codigoRoteiro, protheusRoutings.sequenciaOperacao, protheusRoutings.codigoOperacao, protheusRoutings.descricaoOperacao, protheusRoutings.postoTrabalho],
      },
      appointments: {
        table: protheusProductionAppointments,
        searchColumns: [protheusProductionAppointments.numeroOp, protheusProductionAppointments.sequenciaOperacao, protheusProductionAppointments.codigoOperacao, protheusProductionAppointments.descricaoOperacao, protheusProductionAppointments.postoTrabalho, protheusProductionAppointments.operador],
      },
      resources: {
        table: protheusResources,
        searchColumns: [protheusResources.branch, protheusResources.resourceCode, protheusResources.resourceName, protheusResources.costCenter, protheusResources.workCenterRaw],
      },
      commitments: {
        table: protheusCommitments,
        searchColumns: [protheusCommitments.productionOrder, protheusCommitments.productCode, protheusCommitments.description, protheusCommitments.parentProductCode, protheusCommitments.warehouse, protheusCommitments.sourceSituation],
      },
    };
    const source = sourceMap[params.entity];
    if (!source) throw new Error('UNKNOWN_PROTHEUS_ENTITY');

    const page = Math.max(1, Math.floor(params.page));
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize)));
    const offset = (page - 1) * pageSize;
    const search = params.search.trim().slice(0, 100);
    const condition = search
      ? or(...source.searchColumns.map((column) => ilike(column, `%${search}%`)))
      : undefined;

    const [rows, countRows] = await Promise.all([
      db.select().from(source.table).where(condition).orderBy(desc(source.table.id)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(source.table).where(condition),
    ]);
    return { rows, page, pageSize, total: Number(countRows[0]?.count || 0) };
  }
}
