import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  protheusProductionAppointments,
  protheusProductionOrders,
  protheusProducts,
  protheusProductStructures,
  protheusRoutings,
  protheusSalesOrders,
} from '../../db/schema.ts';
import {
  OperationProgress,
  PrazoStatus,
  TraceabilityDetail,
  TraceabilityFilterParams,
  TraceabilityMatrixItem,
  TraceabilitySummaryMetrics,
  TraceabilityMatrixSummary,
} from './traceability.types.ts';

// Helper to normalize and compare dates in YYYYMMDD or YYYY-MM-DD
function parseProtheusDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.replace(/[^0-9]/g, '');
  if (clean.length === 8) {
    // Check if it's DDMMYYYY or YYYYMMDD
    // If year starts with 20, usually YYYYMMDD: 20261027
    if (clean.startsWith('20')) {
      const year = parseInt(clean.substring(0, 4), 10);
      const month = parseInt(clean.substring(4, 6), 10) - 1;
      const day = parseInt(clean.substring(6, 8), 10);
      return new Date(year, month, day);
    } else {
      // DDMMYYYY
      const day = parseInt(clean.substring(0, 2), 10);
      const month = parseInt(clean.substring(2, 4), 10) - 1;
      const year = parseInt(clean.substring(4, 8), 10);
      return new Date(year, month, day);
    }
  }
  // Try standard Date parse
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function calculatePrazoStatus(
  statusProtheusOp: string,
  previsaoFimStr?: string | null,
  entregaPvStr?: string | null,
  conclusaoRealStr?: string | null
): { statusPrazo: PrazoStatus; diasAtrasoOuFolga: number | null } {
  // If order is completed
  const statusUpper = (statusProtheusOp || '').toUpperCase();
  if (statusUpper.includes('ENCERRAD') || statusUpper.includes('CONCLU') || statusUpper === 'E' || statusUpper === 'F') {
    return { statusPrazo: 'CONCLUIDO', diasAtrasoOuFolga: 0 };
  }

  const targetDate = parseProtheusDate(entregaPvStr || previsaoFimStr);
  if (!targetDate) {
    return { statusPrazo: 'SEM_PREVISAO', diasAtrasoOuFolga: null };
  }

  const now = new Date();
  // Reset hours to compare purely calendar days
  now.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { statusPrazo: 'ATRASADO', diasAtrasoOuFolga: diffDays };
  } else if (diffDays <= 2) {
    return { statusPrazo: 'RISCO_ATRASO', diasAtrasoOuFolga: diffDays };
  } else {
    return { statusPrazo: 'NO_PRAZO', diasAtrasoOuFolga: diffDays };
  }
}

export class TraceabilityRepository {
  /**
   * Retrieves paginated and filtered traceability matrix items combining SC2 (OP), SC5/6 (PV),
   * progress from SH6 appointments and routing SG2.
   */
  public static async listMatrix(params: TraceabilityFilterParams): Promise<{
    items: TraceabilityMatrixItem[];
    total: number;
    page: number;
    limit: number;
    summary: TraceabilityMatrixSummary;
  }> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
    const offset = (page - 1) * limit;

    // Fetch all relevant OPs with left joined PV data
    // Drizzle allows querying OPs
    const conditions = [];

    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(
        or(
          ilike(protheusProductionOrders.numeroOp, term),
          ilike(protheusProductionOrders.codigoProduto, term),
          ilike(protheusProductionOrders.descricaoProduto, term),
          ilike(protheusProductionOrders.numeroPv, term)
        )
      );
    }

    if (params.numeroOp) {
      conditions.push(ilike(protheusProductionOrders.numeroOp, `%${params.numeroOp}%`));
    }

    if (params.numeroPv) {
      conditions.push(ilike(protheusProductionOrders.numeroPv, `%${params.numeroPv}%`));
    }

    if (params.codigoProduto) {
      conditions.push(ilike(protheusProductionOrders.codigoProduto, `%${params.codigoProduto}%`));
    }

    if (params.statusOp) {
      conditions.push(eq(protheusProductionOrders.statusProtheus, params.statusOp));
    }

    if (params.semVinculoPv) {
      conditions.push(
        or(
          sql`${protheusProductionOrders.numeroPv} IS NULL`,
          eq(protheusProductionOrders.numeroPv, '')
        )
      );
    }

    if (params.apenasComRefugo) {
      conditions.push(sql`CAST(${protheusProductionOrders.quantidadeRefugo} AS NUMERIC) > 0`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get matching OPs
    const rawOps = await db
      .select()
      .from(protheusProductionOrders)
      .where(whereClause)
      .orderBy(desc(protheusProductionOrders.id));

    // To perform multi-table correlation (PV details, appointments, routings)
    // we query corresponding details for these OPs
    const opNumbers = rawOps.map((op) => op.numeroOp);
    const pvNumbers = rawOps.map((op) => op.numeroPv).filter((pv): pv is string => !!pv && pv.trim() !== '');
    const productCodes = Array.from(new Set(rawOps.map((op) => op.codigoProduto)));

    // Fetch matching PV items in bulk
    const pvMap = new Map<string, any>();
    if (pvNumbers.length > 0) {
      const pvRows = await db
        .select()
        .from(protheusSalesOrders)
        .where(
          and(
            sql`${protheusSalesOrders.numeroPv} = ANY(${sql`ARRAY[${sql.join(
              pvNumbers.map((p) => sql`${p}`),
              sql`,`
            )}]`})`
          )
        );

      for (const pv of pvRows) {
        // Index by numeroPv and itemPv, plus by numeroPv alone
        const key = `${pv.numeroPv}_${pv.itemPv}`;
        pvMap.set(key, pv);
        if (!pvMap.has(pv.numeroPv)) {
          pvMap.set(pv.numeroPv, pv);
        }
      }
    }

    // Fetch routing operation counts per product
    const routingCountMap = new Map<string, number>();
    if (productCodes.length > 0) {
      const routingRows = await db
        .select({
          codigoProduto: protheusRoutings.codigoProduto,
          count: sql<number>`count(distinct ${protheusRoutings.sequenciaOperacao})`,
        })
        .from(protheusRoutings)
        .where(
          sql`${protheusRoutings.codigoProduto} = ANY(${sql`ARRAY[${sql.join(
            productCodes.map((c) => sql`${c}`),
            sql`,`
          )}]`})`
        )
        .groupBy(protheusRoutings.codigoProduto);

      for (const r of routingRows) {
        routingCountMap.set(r.codigoProduto, Number(r.count));
      }
    }

    // Fetch appointments metrics per OP
    const apptMap = new Map<string, { count: number; lastPosto: string | null }>();
    if (opNumbers.length > 0) {
      const apptRows = await db
        .select({
          numeroOp: protheusProductionAppointments.numeroOp,
          count: sql<number>`count(*)`,
          lastPosto: sql<string>`MAX(${protheusProductionAppointments.postoTrabalho})`,
        })
        .from(protheusProductionAppointments)
        .where(
          sql`${protheusProductionAppointments.numeroOp} = ANY(${sql`ARRAY[${sql.join(
            opNumbers.map((o) => sql`${o}`),
            sql`,`
          )}]`})`
        )
        .groupBy(protheusProductionAppointments.numeroOp);

      for (const a of apptRows) {
        apptMap.set(a.numeroOp, {
          count: Number(a.count),
          lastPosto: a.lastPosto,
        });
      }
    }

    // Transform and apply post-join filters (Client name, Status PV, Atrasadas)
    let matrixItems: TraceabilityMatrixItem[] = rawOps.map((op) => {
      const pvKey = op.numeroPv ? (op.itemPv ? `${op.numeroPv}_${op.itemPv}` : op.numeroPv) : '';
      const matchedPv = pvKey ? pvMap.get(pvKey) || pvMap.get(op.numeroPv || '') : null;

      const qtdPlan = Number(op.quantidadePlanejada) || 0;
      const qtdProd = Number(op.quantidadeProduzida) || 0;
      const qtdRefugo = Number(op.quantidadeRefugo) || 0;
      const saldo = Number(op.saldoAProduzir);
      const percentual = qtdPlan > 0 ? Math.min(100, Math.round((qtdProd / qtdPlan) * 100)) : null;

      const apptInfo = apptMap.get(op.numeroOp);
      const totalRoteiro = routingCountMap.get(op.codigoProduto) || 0;

      const prazoCalc = calculatePrazoStatus(
        op.statusProtheus,
        op.dataPrevisaoFim,
        matchedPv?.dataEntrega,
        op.dataConclusaoReal
      );

      return {
        idOp: op.id,
        numeroOp: op.numeroOp,
        codigoProduto: op.codigoProduto,
        descricaoProduto: op.descricaoProduto || 'Descrição não informada',
        codigoRoteiro: op.codigoRoteiro,
        quantidadePlanejada: qtdPlan,
        quantidadeProduzida: qtdProd,
        quantidadeRefugo: qtdRefugo,
        saldoAProduzir: saldo,
        percentualConclusao: percentual,
        statusProtheusOp: op.statusProtheus,
        etapaAtual: op.etapaAtual || 'Etapa não informada',
        postoTrabalhoAtual: apptInfo?.lastPosto || null,
        dataEmissaoOp: op.dataEmissao,
        dataInicioRealOp: op.dataInicioReal,
        dataPrevisaoFimOp: op.dataPrevisaoFim,
        dataConclusaoRealOp: op.dataConclusaoReal,
        temVinculoPv: !!matchedPv,
        idPv: matchedPv?.id || null,
        numeroPv: matchedPv?.numeroPv || op.numeroPv || null,
        itemPv: matchedPv?.itemPv || op.itemPv || null,
        clienteCodigo: matchedPv?.clienteCodigo || null,
        clienteNome: matchedPv?.clienteNome || null,
        clienteCnpj: matchedPv?.clienteCnpj || null,
        quantidadePedidaPv: matchedPv ? Number(matchedPv.quantidadePedida) : null,
        quantidadeEntreguePv: matchedPv ? Number(matchedPv.quantidadeEntregue) : null,
        dataEmissaoPv: matchedPv?.dataEmissao || null,
        dataEntregaPv: matchedPv?.dataEntrega || null,
        statusProtheusPv: matchedPv?.statusProtheus || null,
        statusPrazo: prazoCalc.statusPrazo,
        diasAtrasoOuFolga: prazoCalc.diasAtrasoOuFolga,
        totalOperacoesRoteiro: totalRoteiro,
        operacoesConcluidasCount: 0,
        totalApontamentosCount: apptInfo?.count || 0,
        possuiDivergencia: qtdRefugo > 0 || prazoCalc.statusPrazo === 'ATRASADO',
        motivoDivergencia:
          qtdRefugo > 0
            ? `Refugo de ${qtdRefugo} pçs registrado`
            : prazoCalc.statusPrazo === 'ATRASADO'
            ? `Atrasado em ${Math.abs(prazoCalc.diasAtrasoOuFolga || 0)} dias`
            : null,
      };
    });

    // Apply client filter
    if (params.cliente) {
      const term = params.cliente.toLowerCase();
      matrixItems = matrixItems.filter(
        (m) =>
          m.clienteNome?.toLowerCase().includes(term) ||
          m.clienteCodigo?.toLowerCase().includes(term) ||
          m.clienteCnpj?.includes(term)
      );
    }

    // Apply PV status filter
    if (params.statusPv) {
      matrixItems = matrixItems.filter((m) => m.statusProtheusPv === params.statusPv);
    }

    // Apply Workstation filter
    if (params.postoTrabalho) {
      const posto = params.postoTrabalho.toLowerCase();
      matrixItems = matrixItems.filter((m) =>
        m.postoTrabalhoAtual?.toLowerCase().includes(posto)
      );
    }

    // Apply Delayed filter
    if (params.apenasAtrasadas) {
      matrixItems = matrixItems.filter((m) => m.statusPrazo === 'ATRASADO');
    }

    if (params.situacaoPrazo) {
      matrixItems = matrixItems.filter((m) => m.statusPrazo === params.situacaoPrazo);
    }

    const parseFilterDate = (value?: string) => {
      if (!value) return null;
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 8) return null;
      const yearFirst = digits.startsWith('20');
      const year = Number(yearFirst ? digits.slice(0, 4) : digits.slice(4, 8));
      const month = Number(yearFirst ? digits.slice(4, 6) : digits.slice(2, 4));
      const day = Number(yearFirst ? digits.slice(6, 8) : digits.slice(0, 2));
      const date = new Date(Date.UTC(year, month - 1, day));
      if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return date.toISOString().slice(0, 10);
    };
    const dateFrom = parseFilterDate(params.dataInicio);
    const dateTo = parseFilterDate(params.dataFim);
    if (dateFrom || dateTo) {
      matrixItems = matrixItems.filter((item) => {
        const issueDate = parseFilterDate(item.dataEmissaoOp);
        if (!issueDate) return false;
        return (!dateFrom || issueDate >= dateFrom) && (!dateTo || issueDate <= dateTo);
      });
    }

    const porSituacao: TraceabilityMatrixSummary['porSituacao'] = {
      NO_PRAZO: 0,
      ATRASADO: 0,
      RISCO_ATRASO: 0,
      CONCLUIDO: 0,
      SEM_PREVISAO: 0,
    };
    const products = new Map<string, TraceabilityMatrixSummary['principaisProdutos'][number]>();
    let totalPlanejado = 0;
    let totalProduzido = 0;
    let totalRefugo = 0;
    for (const item of matrixItems) {
      porSituacao[item.statusPrazo]++;
      totalPlanejado += item.quantidadePlanejada;
      totalProduzido += item.quantidadeProduzida;
      totalRefugo += item.quantidadeRefugo;
      const product = products.get(item.codigoProduto) || {
        codigoProduto: item.codigoProduto,
        descricaoProduto: item.descricaoProduto,
        quantidadeProduzida: 0,
        totalOps: 0,
      };
      product.quantidadeProduzida += item.quantidadeProduzida;
      product.totalOps++;
      products.set(item.codigoProduto, product);
    }
    const summary: TraceabilityMatrixSummary = {
      totalOps: matrixItems.length,
      totalPlanejado,
      totalProduzido,
      totalRefugo,
      percentualProduzido: totalPlanejado > 0 ? Math.round((totalProduzido / totalPlanejado) * 100) : null,
      porSituacao,
      principaisProdutos: [...products.values()].sort((a, b) => b.quantidadeProduzida - a.quantidadeProduzida).slice(0, 5),
    };

    const total = matrixItems.length;
    const paginated = matrixItems.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      page,
      limit,
      summary,
    };
  }

  /**
   * Complete 360-degree traceability for a single OP.
   */
  public static async getOpDetail(numeroOp: string): Promise<TraceabilityDetail | null> {
    const opRows = await db
      .select()
      .from(protheusProductionOrders)
      .where(eq(protheusProductionOrders.numeroOp, numeroOp))
      .limit(1);

    if (opRows.length === 0) return null;
    const op = opRows[0];

    // Product master data (SB1)
    const productRows = await db
      .select()
      .from(protheusProducts)
      .where(eq(protheusProducts.codigoProduto, op.codigoProduto))
      .limit(1);
    const prod = productRows[0] || null;

    // Bill of Materials (SG1)
    const structureRows = await db
      .select()
      .from(protheusProductStructures)
      .where(eq(protheusProductStructures.codigoProdutoPai, op.codigoProduto))
      .orderBy(protheusProductStructures.codigoComponente);

    // Look up child OPs for structure components (subassemblies)
    const componentCodes = structureRows.map((s) => s.codigoComponente);
    const childOpsMap = new Map<string, any>();
    if (componentCodes.length > 0) {
      const childOps = await db
        .select()
        .from(protheusProductionOrders)
        .where(
          sql`${protheusProductionOrders.codigoProduto} = ANY(${sql`ARRAY[${sql.join(
            componentCodes.map((c) => sql`${c}`),
            sql`,`
          )}]`})`
        );
      for (const cop of childOps) {
        if (!childOpsMap.has(cop.codigoProduto)) {
          childOpsMap.set(cop.codigoProduto, cop);
        }
      }
    }

    const estrutura = structureRows.map((s) => {
      const cop = childOpsMap.get(s.codigoComponente);
      return {
        codigoComponente: s.codigoComponente,
        descricaoComponente: s.descricaoComponente,
        quantidadeNecessaria: Number(s.quantidadeNecessaria),
        unidadeComponente: s.unidadeComponente,
        perdaPercentual: s.perdaPercentual ? Number(s.perdaPercentual) : null,
        opFilhaRelacionada: cop
          ? {
              numeroOp: cop.numeroOp,
              quantidadePlanejada: Number(cop.quantidadePlanejada),
              quantidadeProduzida: Number(cop.quantidadeProduzida),
              etapaAtual: cop.etapaAtual || 'Etapa não informada',
              statusProtheus: cop.statusProtheus,
            }
          : null,
      };
    });

    // Routing operations (SG2)
    const routingRows = await db
      .select()
      .from(protheusRoutings)
      .where(eq(protheusRoutings.codigoProduto, op.codigoProduto))
      .orderBy(protheusRoutings.sequenciaOperacao);

    // Appointments (SH6)
    const appointmentRows = await db
      .select()
      .from(protheusProductionAppointments)
      .where(eq(protheusProductionAppointments.numeroOp, numeroOp))
      .orderBy(desc(protheusProductionAppointments.id));

    // Aggregate physical appointments per routing sequence
    const apptsBySeq = new Map<
      string,
      { totalProd: number; totalRefugo: number; operators: Set<string>; lastDate?: string }
    >();

    for (const a of appointmentRows) {
      const seq = a.sequenciaOperacao;
      const current = apptsBySeq.get(seq) || {
        totalProd: 0,
        totalRefugo: 0,
        operators: new Set<string>(),
      };
      current.totalProd += Number(a.quantidadeProduzida) || 0;
      current.totalRefugo += Number(a.quantidadeRefugo) || 0;
      if (a.operador) current.operators.add(a.operador);
      if (!current.lastDate) current.lastDate = a.dataApontamento;
      apptsBySeq.set(seq, current);
    }

    const qtdPlanejadaOp = Number(op.quantidadePlanejada) || 0;

    const roteiroComProgresso: OperationProgress[] = routingRows.map((r) => {
      const appt = apptsBySeq.get(r.sequenciaOperacao);
      const qtdApontada = appt?.totalProd || 0;
      const qtdRefugo = appt?.totalRefugo || 0;
      const concluida = qtdPlanejadaOp > 0 && qtdApontada >= qtdPlanejadaOp;
      const emAndamento = qtdApontada > 0 && !concluida;

      return {
        sequenciaOperacao: r.sequenciaOperacao,
        codigoOperacao: r.codigoOperacao,
        descricaoOperacao: r.descricaoOperacao,
        postoTrabalho: r.postoTrabalho,
        tempoPadraoMinutos: r.tempoPadraoMinutos ? Number(r.tempoPadraoMinutos) : null,
        quantidadeApontada: qtdApontada,
        quantidadeRefugo: qtdRefugo,
        concluida,
        emAndamento,
        ultimoApontamentoEm: appt?.lastDate || null,
        operadores: appt ? Array.from(appt.operators) : [],
      };
    });

    // Linked PV info
    let pedidoVendaCompleto = null;
    let matchedPvItem = null;

    if (op.numeroPv) {
      const pvRows = await db
        .select()
        .from(protheusSalesOrders)
        .where(eq(protheusSalesOrders.numeroPv, op.numeroPv))
        .orderBy(protheusSalesOrders.itemPv);

      if (pvRows.length > 0) {
        matchedPvItem =
          pvRows.find((i) => op.itemPv && i.itemPv === op.itemPv) || pvRows[0];

        // Find OPs linked to sibling items
        pedidoVendaCompleto = {
          numeroPv: pvRows[0].numeroPv,
          clienteNome: pvRows[0].clienteNome,
          clienteCnpj: pvRows[0].clienteCnpj,
          dataEmissao: pvRows[0].dataEmissao,
          dataEntrega: pvRows[0].dataEntrega,
          statusProtheus: pvRows[0].statusProtheus,
          itens: pvRows.map((item) => ({
            itemPv: item.itemPv,
            codigoProduto: item.codigoProduto,
            descricaoProduto: item.descricaoProduto,
            quantidadePedida: Number(item.quantidadePedida),
            quantidadeEntregue: Number(item.quantidadeEntregue),
            dataEntrega: item.dataEntrega,
            opsRelacionadas: item.itemPv === op.itemPv ? [op.numeroOp] : [],
          })),
        };
      }
    }

    const prazoCalc = calculatePrazoStatus(
      op.statusProtheus,
      op.dataPrevisaoFim,
      matchedPvItem?.dataEntrega,
      op.dataConclusaoReal
    );

    const matrixItem: TraceabilityMatrixItem = {
      idOp: op.id,
      numeroOp: op.numeroOp,
      codigoProduto: op.codigoProduto,
      descricaoProduto: op.descricaoProduto || prod?.descricao || 'Descrição não informada',
      codigoRoteiro: op.codigoRoteiro,
      quantidadePlanejada: qtdPlanejadaOp,
      quantidadeProduzida: Number(op.quantidadeProduzida) || 0,
      quantidadeRefugo: Number(op.quantidadeRefugo) || 0,
      saldoAProduzir: Number(op.saldoAProduzir),
      percentualConclusao:
        qtdPlanejadaOp > 0
          ? Math.min(100, Math.round(((Number(op.quantidadeProduzida) || 0) / qtdPlanejadaOp) * 100))
          : 0,
      statusProtheusOp: op.statusProtheus,
      etapaAtual: op.etapaAtual || 'Etapa não informada',
      postoTrabalhoAtual: appointmentRows[0]?.postoTrabalho || null,
      dataEmissaoOp: op.dataEmissao,
      dataInicioRealOp: op.dataInicioReal,
      dataPrevisaoFimOp: op.dataPrevisaoFim,
      dataConclusaoRealOp: op.dataConclusaoReal,
      temVinculoPv: !!matchedPvItem,
      idPv: matchedPvItem?.id || null,
      numeroPv: matchedPvItem?.numeroPv || op.numeroPv || null,
      itemPv: matchedPvItem?.itemPv || op.itemPv || null,
      clienteCodigo: matchedPvItem?.clienteCodigo || null,
      clienteNome: matchedPvItem?.clienteNome || null,
      clienteCnpj: matchedPvItem?.clienteCnpj || null,
      quantidadePedidaPv: matchedPvItem ? Number(matchedPvItem.quantidadePedida) : null,
      quantidadeEntreguePv: matchedPvItem ? Number(matchedPvItem.quantidadeEntregue) : null,
      dataEmissaoPv: matchedPvItem?.dataEmissao || null,
      dataEntregaPv: matchedPvItem?.dataEntrega || null,
      statusProtheusPv: matchedPvItem?.statusProtheus || null,
      statusPrazo: prazoCalc.statusPrazo,
      diasAtrasoOuFolga: prazoCalc.diasAtrasoOuFolga,
      totalOperacoesRoteiro: routingRows.length,
      operacoesConcluidasCount: roteiroComProgresso.filter((r) => r.concluida).length,
      totalApontamentosCount: appointmentRows.length,
      possuiDivergencia:
        Number(op.quantidadeRefugo) > 0 || prazoCalc.statusPrazo === 'ATRASADO',
    };

    return {
      op: matrixItem,
      produto: prod
        ? {
            codigoProduto: prod.codigoProduto,
            descricao: prod.descricao,
            tipo: prod.tipo,
            unidadeMedida: prod.unidadeMedida,
            armazemPadrao: prod.armazemPadrao,
          }
        : null,
      estrutura,
      roteiroComProgresso,
      apontamentos: appointmentRows.map((a) => ({
        id: a.id,
        sequenciaOperacao: a.sequenciaOperacao,
        codigoOperacao: a.codigoOperacao,
        descricaoOperacao: a.descricaoOperacao,
        postoTrabalho: a.postoTrabalho,
        operador: a.operador,
        quantidadeProduzida: Number(a.quantidadeProduzida) || 0,
        quantidadeRefugo: Number(a.quantidadeRefugo) || 0,
        dataApontamento: a.dataApontamento,
        horaInicio: a.horaInicio,
        horaFim: a.horaFim,
        tipoApontamento: a.tipoApontamento,
        motivoRefugo: a.motivoRefugo,
      })),
      pedidoVendaCompleto,
    };
  }

  /**
   * Calculates factory summary metrics without fictitious data.
   */
  public static async getMetrics(): Promise<TraceabilitySummaryMetrics> {
    const [ops, pvs, scrapOps] = await Promise.all([
      db.select().from(protheusProductionOrders),
      db.select().from(protheusSalesOrders),
      db
        .select({ count: sql<number>`count(*)` })
        .from(protheusProductionOrders)
        .where(sql`CAST(${protheusProductionOrders.quantidadeRefugo} AS NUMERIC) > 0`),
    ]);

    const totalOps = ops.length;
    const uniquePvs = new Set(pvs.map((p) => p.numeroPv)).size;
    const pvsByItem = new Map(pvs.map((pv) => [`${pv.numeroPv}_${pv.itemPv}`, pv]));

    let opsConcluidas = 0;
    let opsEmAndamento = 0;
    let opsAtrasadas = 0;
    let conclusoesComPrazoConhecido = 0;
    let conclusoesNoPrazo = 0;

    for (const op of ops) {
      const pv = op.numeroPv ? pvsByItem.get(`${op.numeroPv}_${op.itemPv || ''}`) : undefined;
      const prazo = calculatePrazoStatus(op.statusProtheus, op.dataPrevisaoFim, pv?.dataEntrega, op.dataConclusaoReal);
      if (prazo.statusPrazo === 'CONCLUIDO') {
        opsConcluidas++;
        const dueDate = parseProtheusDate(pv?.dataEntrega || op.dataPrevisaoFim);
        const completedDate = parseProtheusDate(op.dataConclusaoReal);
        if (dueDate && completedDate) {
          conclusoesComPrazoConhecido++;
          if (completedDate.getTime() <= dueDate.getTime()) conclusoesNoPrazo++;
        }
      } else if (prazo.statusPrazo === 'ATRASADO') {
        opsAtrasadas++;
        opsEmAndamento++;
      } else {
        opsEmAndamento++;
      }
    }

    const opsComRefugo = Number(scrapOps[0]?.count || 0);
    const taxaEntregaPrazo = conclusoesComPrazoConhecido > 0
      ? Math.round((conclusoesNoPrazo / conclusoesComPrazoConhecido) * 100)
      : null;

    return {
      totalOps,
      totalPvs: uniquePvs,
      opsEmAndamento,
      opsConcluidas,
      opsAtrasadas,
      opsComRefugo,
      taxaEntregaPrazoPercentual: taxaEntregaPrazo,
    };
  }
}

