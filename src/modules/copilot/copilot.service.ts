import { GoogleGenAI } from '@google/genai';
import { desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  inventoryItems,
  productionLines,
  productionOccurrences,
  protheusImportBatches,
  protheusProductionOrders,
  protheusRoutings,
} from '../../db/schema.ts';
import type { UserRole } from '../../types/index.ts';
import { appAuthorship } from '../../client/appMetadata.ts';

export type CopilotPersonality = 'direct' | 'casual' | 'formal';

export interface CopilotChatOptions {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  language?: 'pt-BR' | 'en-US' | 'es-ES';
  personality?: CopilotPersonality;
  user: { uid: string; name: string; role: UserRole; department?: string | null };
}

export interface CopilotAction {
  type: 'NAVIGATE';
  target: string;
  label: string;
}

export interface CopilotChatResponse {
  reply: string;
  actions?: CopilotAction[];
  mode: 'gemini' | 'data_fallback';
}

type QueryResult<T> = { rows: T[]; available: boolean };
type SourceName = 'orders' | 'occurrences' | 'inventory' | 'lines' | 'sync';
type OperationalContext = {
  sources: Record<SourceName, boolean>;
  ordersTotal: number | null;
  recentOrders: any[];
  delayedOrdersInSample: any[];
  activeOccurrencesTotal: number | null;
  activeOccurrences: any[];
  criticalInventoryTotal: number | null;
  criticalInventory: any[];
  linesTotal: number | null;
  lines: any[];
  lastSync: any | null;
};

type SpecificOpResult =
  | { candidate: string; status: 'unavailable' }
  | { candidate: string; status: 'not_found' }
  | { candidate: string; status: 'found'; op: any; occurrences: any[]; occurrencesAvailable: boolean; routings: any[] };

const RECENT_ORDER_LIMIT = 50;
const ACTIVE_OCCURRENCE_STATUSES = ['OPEN', 'IN_PROGRESS'];

function asCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function isOverdue(order: any): boolean {
  const status = String(order.statusProtheus || '').toUpperCase();
  const completed = status.includes('ENCERRAD') || status.includes('CONCLU') || status === 'E' || status === 'F';
  if (completed || order.dataConclusaoReal || Number(order.saldoAProduzir) <= 0 || !order.dataPrevisaoFim) return false;
  const dateText = String(order.dataPrevisaoFim).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const due = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export class CopilotService {
  private ai: GoogleGenAI | null = null;
  private cachedContext: { data: OperationalContext; expiresAt: number } | null = null;
  private readonly CONTEXT_TTL_MS = 25_000;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const approvedForProduction = process.env.NODE_ENV !== 'production'
      || process.env.COPILOT_EXTERNAL_DATA_ENABLED === 'true';
    if (apiKey && approvedForProduction) this.ai = new GoogleGenAI({ apiKey });
  }

  private async safeSelect<T>(source: SourceName, query: PromiseLike<T[]>): Promise<QueryResult<T>> {
    try {
      return { rows: await query, available: true };
    } catch (error) {
      console.error(`Falha ao consultar fonte ${source} para o Assistente Flash:`, error);
      return { rows: [], available: false };
    }
  }

  /** Reads a bounded, current snapshot. Uses a short in-memory cache to guarantee sub-millisecond responses on rapid chat turns. */
  public async getOperationalContext(forceFresh = false): Promise<OperationalContext> {
    const now = Date.now();
    if (!forceFresh && this.cachedContext && now < this.cachedContext.expiresAt) {
      return this.cachedContext.data;
    }

    const [orders, orderCount, occurrences, occurrenceCount, stock, stockCount, lines, lineCount, sync] = await Promise.all([
      this.safeSelect('orders', db.select({
        numeroOp: protheusProductionOrders.numeroOp,
        codigoProduto: protheusProductionOrders.codigoProduto,
        descricaoProduto: protheusProductionOrders.descricaoProduto,
        numeroPv: protheusProductionOrders.numeroPv,
        quantidadePlanejada: protheusProductionOrders.quantidadePlanejada,
        quantidadeProduzida: protheusProductionOrders.quantidadeProduzida,
        saldoAProduzir: protheusProductionOrders.saldoAProduzir,
        statusProtheus: protheusProductionOrders.statusProtheus,
        etapaAtual: protheusProductionOrders.etapaAtual,
        dataPrevisaoFim: protheusProductionOrders.dataPrevisaoFim,
        dataConclusaoReal: protheusProductionOrders.dataConclusaoReal,
      }).from(protheusProductionOrders).orderBy(desc(protheusProductionOrders.createdAt)).limit(RECENT_ORDER_LIMIT)),
      this.safeSelect('orders', db.select({ value: sql<number>`count(*)` }).from(protheusProductionOrders)),
      this.safeSelect('occurrences', db.select({
        id: productionOccurrences.id,
        numeroOp: productionOccurrences.numeroOp,
        occurrenceType: productionOccurrences.occurrenceType,
        description: productionOccurrences.description,
        workstation: productionOccurrences.workstation,
        status: productionOccurrences.status,
        createdAt: productionOccurrences.createdAt,
      }).from(productionOccurrences)
        .where(inArray(productionOccurrences.status, ACTIVE_OCCURRENCE_STATUSES))
        .orderBy(desc(productionOccurrences.createdAt)).limit(10)),
      this.safeSelect('occurrences', db.select({ value: sql<number>`count(*)` }).from(productionOccurrences)
        .where(inArray(productionOccurrences.status, ACTIVE_OCCURRENCE_STATUSES))),
      this.safeSelect('inventory', db.select({
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        quantityOnHand: inventoryItems.quantityOnHand,
        minimumStock: inventoryItems.minimumStock,
        unit: inventoryItems.unit,
      }).from(inventoryItems)
        .where(lte(inventoryItems.quantityOnHand, inventoryItems.minimumStock))
        .orderBy(inventoryItems.quantityOnHand).limit(10)),
      this.safeSelect('inventory', db.select({ value: sql<number>`count(*)` }).from(inventoryItems)
        .where(lte(inventoryItems.quantityOnHand, inventoryItems.minimumStock))),
      this.safeSelect('lines', db.select({
        code: productionLines.code,
        name: productionLines.name,
        status: productionLines.status,
        capacityPerHour: productionLines.capacityPerHour,
        supervisorName: productionLines.supervisorName,
      }).from(productionLines).orderBy(productionLines.name).limit(10)),
      this.safeSelect('lines', db.select({ value: sql<number>`count(*)` }).from(productionLines)),
      this.safeSelect('sync', db.select({
        batchCode: protheusImportBatches.batchCode,
        entityType: protheusImportBatches.entityType,
        recordsCount: protheusImportBatches.recordsCount,
        status: protheusImportBatches.status,
        createdAt: protheusImportBatches.createdAt,
      }).from(protheusImportBatches).orderBy(desc(protheusImportBatches.createdAt)).limit(1)),
    ]);

    const result: OperationalContext = {
      sources: {
        orders: orders.available && orderCount.available,
        occurrences: occurrences.available && occurrenceCount.available,
        inventory: stock.available && stockCount.available,
        lines: lines.available && lineCount.available,
        sync: sync.available,
      },
      ordersTotal: orderCount.available ? asCount(orderCount.rows[0]?.value) : null,
      recentOrders: orders.rows,
      delayedOrdersInSample: orders.rows.filter(isOverdue),
      activeOccurrencesTotal: occurrenceCount.available ? asCount(occurrenceCount.rows[0]?.value) : null,
      activeOccurrences: occurrences.rows,
      criticalInventoryTotal: stockCount.available ? asCount(stockCount.rows[0]?.value) : null,
      criticalInventory: stock.rows,
      linesTotal: lineCount.available ? asCount(lineCount.rows[0]?.value) : null,
      lines: lines.rows,
      lastSync: sync.rows[0] || null,
    };

    this.cachedContext = { data: result, expiresAt: now + this.CONTEXT_TTL_MS };
    return result;
  }

  private extractOpNumber(message: string): string | null {
    const match = message.match(/\b(?:OP|ordem(?:\s+de)?\s+produção)\s*(?:n[º°.]?\s*)?[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,19})\b/i);
    return match?.[1]?.replace(/[.,;:]$/, '') || null;
  }

  private async searchSpecificOpData(numeroOp: string): Promise<SpecificOpResult> {
    let op: any;
    try {
      [op] = await db.select().from(protheusProductionOrders)
        .where(eq(protheusProductionOrders.numeroOp, numeroOp)).limit(1);
    } catch (error) {
      console.error('Falha ao consultar OP para o Assistente Flash:', error);
      return { candidate: numeroOp, status: 'unavailable' };
    }
    if (!op) return { candidate: numeroOp, status: 'not_found' };

    const [occurrences, routings] = await Promise.all([
      this.safeSelect('occurrences', db.select().from(productionOccurrences)
        .where(eq(productionOccurrences.numeroOp, op.numeroOp))
        .orderBy(desc(productionOccurrences.createdAt)).limit(10)),
      this.safeSelect('orders', db.select().from(protheusRoutings)
        .where(eq(protheusRoutings.codigoProduto, op.codigoProduto)).limit(10)),
    ]);

    return {
      candidate: numeroOp,
      status: 'found',
      op,
      occurrences: occurrences.rows,
      occurrencesAvailable: occurrences.available,
      routings: routings.rows,
    };
  }

  private isDirectOperationalQuery(message: string): boolean {
    const norm = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return (
      norm === 'resumo do turno' ||
      norm === 'quais ops estao atrasadas?' ||
      norm === 'quais ocorrencias estao abertas?' ||
      norm === 'quais itens de estoque estao abaixo do minimo?' ||
      norm === 'ops atrasadas' ||
      norm === 'ocorrencias abertas' ||
      norm === 'estoque critico' ||
      norm === 'turno' ||
      /^op\s*[0-9a-z._/-]+$/i.test(norm)
    );
  }

  private isAuthorshipQuestion(message: string): boolean {
    const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const asksWho = /\b(quem|who|quien)\b/.test(normalized);
    const mentionsRole = /\b(criador|criou|criado|criada|criacao|fez|feito|desenvolvedor|desenvolvimento|desenvolveu|desenvolvido|desenvolvida|idealizador|idealizacao|idealizou|autor|autoria|responsavel|creator|created|developer|developed|made|built|author|authorship|creador|creo|creado|creada|hizo|desarrollador|desarrollo)\b/.test(normalized);
    const mentionsRenan = normalized.includes(appAuthorship.name.toLowerCase());
    return (asksWho && (mentionsRole || mentionsRenan)) || (mentionsRenan && mentionsRole);
  }

  private authorshipReply(language: 'pt-BR' | 'en-US' | 'es-ES', personality: CopilotPersonality): string {
    if (language === 'en-US') {
      if (personality === 'direct') return `${appAuthorship.name} conceived and developed the system.`;
      if (personality === 'formal') return `The system was conceived and developed by ${appAuthorship.name}.`;
      return `${appAuthorship.name} is the person behind the idea and development of the system.`;
    }
    if (language === 'es-ES') {
      if (personality === 'direct') return `${appAuthorship.name} ideó y desarrolló el sistema.`;
      if (personality === 'formal') return `La concepción y el desarrollo del sistema estuvieron a cargo de ${appAuthorship.name}.`;
      return `${appAuthorship.name} fue quien ideó y desarrolló el sistema.`;
    }
    if (personality === 'direct') return `${appAuthorship.name} idealizou e desenvolveu o sistema.`;
    if (personality === 'formal') return `A idealização e o desenvolvimento do sistema são de responsabilidade de ${appAuthorship.name}.`;
    return `Foi ${appAuthorship.name} quem idealizou e desenvolveu o sistema.`;
  }

  public async chat(options: CopilotChatOptions): Promise<CopilotChatResponse> {
    const message = options.message.trim();
    const language = options.language || 'pt-BR';
    const personality = options.personality || 'casual';

    if (this.isAuthorshipQuestion(message)) {
      return { reply: this.authorshipReply(language, personality), actions: [], mode: 'data_fallback' };
    }

    const context = await this.getOperationalContext();
    const opNumber = this.extractOpNumber(message);
    const specificOp = opNumber ? await this.searchSpecificOpData(opNumber) : null;

    // Fast-path: Common operational prompts and specific OP lookups return immediately (< 30ms)
    // with exact, real-time factory data from the operational cache.
    if (this.isDirectOperationalQuery(message) || specificOp?.status === 'found') {
      return { ...this.generateDataFallback(message, context, specificOp, language, personality), mode: 'data_fallback' };
    }

    if (this.ai) {
      try {
        const personalityInstruction = {
          direct: `DIRETRIZ DE PERSONALIDADE - DIRETO E OBJETIVO (PRIORIDADE MÁXIMA):
- Seja extremamente conciso, pragmático e direto ao ponto. Vá direto aos números, dados e fatos.
- Elimine cumprimentos prolixos, introduções longas e despedidas vazias.
- Responda em no máximo 2 a 4 tópicos ou frases curtas. Se houver ação necessária, aponte-a de imediato.`,
          casual: `DIRETRIZ DE PERSONALIDADE - DESPOJADO E DESCONTRAÍDO (PRIORIDADE MÁXIMA):
- Fale como um colega de equipe de chão de fábrica amigável, prestativo, bem-humorado e acessível.
- Use um tom caloroso e natural do dia a dia industrial (ex: "E aí", "Tudo tranquilo", "Bora dar uma olhada", "Tô de olho aqui na fábrica").
- Mantenha a resposta acolhedora e animada, sem perder a precisão dos dados fabris.`,
          formal: `DIRETRIZ DE PERSONALIDADE - FORMAL E CORPORATIVO (PRIORIDADE MÁXIMA):
- Adote linguagem estritamente corporativa, técnica, executiva e polida.
- Utilize vocabulário formal de gestão industrial e engenharia de produção (ex: "Prezado(a)", "Constatamos", "Conforme os registros vigentes", "Recomenda-se a averiguação tempestiva").
- Estruture a resposta com rigor analítico, clareza metódica e respeito institucional.`,
        }[personality];

        const systemInstruction = `Você é o Assistente Flash, copiloto inteligente de chão de fábrica e PCP da Flash Engenharia no sistema NexusPCP.

${personalityInstruction}

DIRETRIZES DE ATUAÇÃO:
- Autoria confirmada: ${appAuthorship.name} foi responsável pela idealização e pelo desenvolvimento deste sistema. Ao perguntarem quem criou, idealizou ou desenvolveu o sistema, responda com esse crédito de forma breve e não invente outros autores.
- Compreensão aberta: Você é flexível e preparado para qualquer tipo de pergunta ou interação. Responda com simpatia e pertinência a saudações ("olá", "bom dia", "como vai?"), perguntas sobre o dia a dia da fábrica ("o que você sugere olhar agora?", "como está a produção?"), dúvidas de processos industriais (balanceamento, apontamentos SH6 no Protheus, controle de refugo, estruturas SG1, OEE) e navegação no NexusPCP.
- Seja ágil: Formatação limpa, sem enrolação.
- Atalhos de navegação: Sempre que for útil direcionar o usuário para uma tela ou para uma OP específica, inclua no final da mensagem uma tag de navegação:
  [[ACTION:NAVIGATE:dashboard]], [[ACTION:NAVIGATE:traceability]], [[ACTION:NAVIGATE:traceability?op=NUMERO]], [[ACTION:NAVIGATE:occurrences]], [[ACTION:NAVIGATE:occurrences?op=NUMERO]], [[ACTION:NAVIGATE:inventory]], [[ACTION:NAVIGATE:production-lines]], [[ACTION:NAVIGATE:production-orders]], ou [[ACTION:NAVIGATE:settings?sub=protheus-sync]].`;

        // Compact operational snapshot to ensure ultra-low token count and fast TTFT
        const compactSnapshot = {
          sources: context.sources,
          personality,
          orders: {
            total: context.ordersTotal,
            delayedTotal: context.delayedOrdersInSample.length,
            delayedSample: context.delayedOrdersInSample.slice(0, 4).map((o) => ({
              op: o.numeroOp,
              produto: `${o.codigoProduto} - ${o.descricaoProduto}`,
              saldo: o.saldoAProduzir,
              previsao: o.dataPrevisaoFim,
            })),
          },
          occurrences: {
            total: context.activeOccurrencesTotal,
            items: context.activeOccurrences.slice(0, 4).map((occ) => ({
              op: occ.numeroOp,
              tipo: occ.occurrenceType,
              posto: occ.workstation,
              status: occ.status,
            })),
          },
          inventory: {
            criticalTotal: context.criticalInventoryTotal,
            items: context.criticalInventory.slice(0, 4).map((i) => ({
              sku: i.sku,
              nome: i.name,
              qtd: i.quantityOnHand,
              min: i.minimumStock,
            })),
          },
          lines: context.lines.slice(0, 4).map((l) => ({ nome: l.name, status: l.status })),
          sync: context.lastSync ? { lote: context.lastSync.batchCode, status: context.lastSync.status } : null,
          specificOrder: specificOp,
        };

        const history = (options.history || []).slice(-6).map((turn) => ({
          role: turn.role,
          parts: [{ text: turn.text.slice(0, 1000) }],
        }));
        const currentTurn = `SNAPSHOT RESUMIDO:\n${JSON.stringify(compactSnapshot)}\n\nPERGUNTA:\n${message}`;

        const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
        const callGemini = async (): Promise<string | null> => {
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
          const generatePromise = (async () => {
            const res = await this.ai!.models.generateContent({
              model: modelName,
              contents: [...history, { role: 'user', parts: [{ text: currentTurn }] }],
              config: { systemInstruction, maxOutputTokens: 350 },
            });
            return res.text?.trim() || null;
          })();
          return Promise.race([generatePromise, timeoutPromise]);
        };

        const rawText = await callGemini();
        if (rawText) {
          return { ...this.parseActions(rawText, undefined, language), mode: 'gemini' };
        }
      } catch (error) {
        console.error('Falha na resposta Gemini do Assistente Flash; usando resposta baseada em dados:', error);
      }
    }

    return { ...this.generateDataFallback(message, context, specificOp, language, personality), mode: 'data_fallback' };
  }

  public async getBriefing(user: { name: string; role: UserRole }): Promise<CopilotChatResponse> {
    return this.chat({
      message: 'Gere um resumo do turno usando os dados disponíveis. Indique fontes indisponíveis e diferencie a amostra recente de totais.',
      user: { uid: 'system', name: user.name, role: user.role },
    });
  }

  private parseActions(rawText: string, defaultOp: string | undefined, language: 'pt-BR' | 'en-US' | 'es-ES'): Omit<CopilotChatResponse, 'mode'> {
    const actions: CopilotAction[] = [];
    const actionPattern = /\[\[ACTION:NAVIGATE:([^\]]+)\]\]/g;
    const cleanText = rawText.replace(actionPattern, (_tag, rawTarget: string) => {
      const target = rawTarget.trim();
      const allowed = target === 'dashboard' || target === 'traceability' || target === 'occurrences'
        || target === 'inventory' || target === 'production-lines' || target === 'production-orders'
        || target === 'settings?sub=protheus-sync'
        || /^(traceability|occurrences)\?op=[A-Za-z0-9._/-]{1,32}$/.test(target);
      if (!allowed || actions.some((action) => action.target === target)) return '';
      actions.push({ type: 'NAVIGATE', target, label: this.actionLabel(target, language) });
      return '';
    }).trim();

    if (defaultOp && !actions.some((action) => action.target.includes(encodeURIComponent(defaultOp)))) {
      actions.push({
        type: 'NAVIGATE',
        target: `traceability?op=${encodeURIComponent(defaultOp)}`,
        label: this.actionLabel(`traceability?op=${encodeURIComponent(defaultOp)}`, language),
      });
    }
    return { reply: cleanText || 'Não consegui formular uma resposta. Tente perguntar de outra forma.', actions };
  }

  private actionLabel(target: string, language: 'pt-BR' | 'en-US' | 'es-ES'): string {
    const opNumber = decodeURIComponent(target.split('=')[1] || '');
    if (target.startsWith('traceability?op=')) return language === 'en-US' ? `View WO ${opNumber}` : language === 'es-ES' ? `Ver OP ${opNumber}` : `Consultar OP ${opNumber}`;
    if (target.startsWith('occurrences?op=')) return language === 'en-US' ? `View occurrences for WO ${opNumber}` : language === 'es-ES' ? `Ver incidencias de la OP ${opNumber}` : `Ver ocorrências da OP ${opNumber}`;
    const labels: Record<string, Record<'pt-BR' | 'en-US' | 'es-ES', string>> = {
      dashboard: { 'pt-BR': 'Abrir painel geral', 'en-US': 'Open dashboard', 'es-ES': 'Abrir panel general' },
      traceability: { 'pt-BR': 'Abrir pedidos e OPs', 'en-US': 'Open orders and WOs', 'es-ES': 'Abrir pedidos y OP' },
      occurrences: { 'pt-BR': 'Abrir ocorrências', 'en-US': 'Open occurrences', 'es-ES': 'Abrir incidencias' },
      inventory: { 'pt-BR': 'Abrir estoque', 'en-US': 'Open inventory', 'es-ES': 'Abrir inventario' },
      'production-lines': { 'pt-BR': 'Abrir linhas e postos', 'en-US': 'Open lines and workstations', 'es-ES': 'Abrir líneas y puestos' },
      'production-orders': { 'pt-BR': 'Abrir ordens de produção', 'en-US': 'Open production orders', 'es-ES': 'Abrir órdenes de producción' },
      'settings?sub=protheus-sync': { 'pt-BR': 'Ver integração Protheus', 'en-US': 'View Protheus integration', 'es-ES': 'Ver integración de Protheus' },
    };
    return labels[target]?.[language] || (language === 'en-US' ? 'Open screen' : language === 'es-ES' ? 'Abrir pantalla' : 'Abrir tela');
  }

  private generateDataFallback(
    message: string,
    context: OperationalContext,
    specificOp: SpecificOpResult | null,
    language: 'pt-BR' | 'en-US' | 'es-ES',
    personality: CopilotPersonality = 'casual',
  ): Omit<CopilotChatResponse, 'mode'> {
    const copy = (pt: string, en: string, es: string) => language === 'en-US' ? en : language === 'es-ES' ? es : pt;
    const nav = (target: string, label?: string): CopilotAction => ({
      type: 'NAVIGATE', target, label: label || this.actionLabel(target, language),
    });
    const lower = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const actions: CopilotAction[] = [];
    const unavailable = (source: SourceName) => !context.sources[source];

    if (specificOp) {
      if (specificOp.status === 'unavailable') {
        return {
          reply: copy(
            personality === 'direct'
              ? `Fonte de OPs indisponível. Não foi possível checar a OP ${specificOp.candidate}.`
              : personality === 'formal'
                ? `Não foi possível estabelecer comunicação com o repositório de ordens de produção. Não é possível certificar a existência da OP ${specificOp.candidate}.`
                : `Não foi possível consultar a fonte de OPs agora. Não vou presumir se a OP ${specificOp.candidate} existe.`,
            `The production order source could not be queried. I cannot confirm whether WO ${specificOp.candidate} exists.`,
            `No se pudo consultar la fuente de OP. No puedo confirmar si la OP ${specificOp.candidate} existe.`
          ),
          actions: [nav(`traceability?op=${encodeURIComponent(specificOp.candidate)}`)],
        };
      }
      if (specificOp.status === 'not_found') {
        return {
          reply: copy(
            personality === 'direct'
              ? `OP ${specificOp.candidate} não encontrada no espelho Protheus. Verifique o número.`
              : personality === 'formal'
                ? `A Ordem de Produção ${specificOp.candidate} não consta nos registros consultados do espelho Protheus. Recomenda-se a conferência do identificador.`
                : `A OP ${specificOp.candidate} não foi localizada pelo número exato no espelho consultado. Confira o número e tente novamente.`,
            `WO ${specificOp.candidate} was not found by exact number in the available mirror. Check the number and try again.`,
            `La OP ${specificOp.candidate} no se encontró por número exacto en el espejo disponible. Verifique el número e inténtelo de nuevo.`
          ),
          actions: [nav(`traceability?op=${encodeURIComponent(specificOp.candidate)}`)],
        };
      }
      const op = specificOp.op;
      const value = (item: unknown) => item === null || item === undefined || item === '' ? 'não informado' : String(item);
      actions.push(nav(`traceability?op=${encodeURIComponent(op.numeroOp)}`));
      if (specificOp.occurrencesAvailable) actions.push(nav(`occurrences?op=${encodeURIComponent(op.numeroOp)}`));
      const occurrenceSummary = specificOp.occurrencesAvailable
        ? copy(`${specificOp.occurrences.length} registro(s) encontrados${specificOp.occurrences.length === 10 ? ' (até 10 exibidos)' : ''}.`, `${specificOp.occurrences.length} record(s) found${specificOp.occurrences.length === 10 ? ' (up to 10 shown)' : ''}.`, `${specificOp.occurrences.length} registro(s) encontrado(s)${specificOp.occurrences.length === 10 ? ' (se muestran hasta 10)' : ''}.`)
        : copy('A tabela de ocorrências não pôde ser consultada.', 'The occurrences table could not be queried.', 'No se pudo consultar la tabla de incidencias.');

      if (personality === 'direct') {
        return {
          reply: copy(
            `**OP ${op.numeroOp}** | ${value(op.codigoProduto)} (${value(op.descricaoProduto)})\n• PV: ${value(op.numeroPv)} | Status: ${value(op.statusProtheus)}\n• Saldo: ${value(op.saldoAProduzir)} un (produzido: ${value(op.quantidadeProduzida)} / planejado: ${value(op.quantidadePlanejada)})\n• Previsão: ${value(op.dataPrevisaoFim)}\n• Ocorrências: ${occurrenceSummary}`,
            `**WO ${op.numeroOp}** | ${value(op.codigoProduto)} (${value(op.descricaoProduto)})\n• SO: ${value(op.numeroPv)} | Status: ${value(op.statusProtheus)}\n• Balance: ${value(op.saldoAProduzir)} (produced: ${value(op.quantidadeProduzida)} / planned: ${value(op.quantidadePlanejada)})\n• Due: ${value(op.dataPrevisaoFim)}\n• Occurrences: ${occurrenceSummary}`,
            `**OP ${op.numeroOp}** | ${value(op.codigoProduto)} (${value(op.descricaoProduto)})\n• PV: ${value(op.numeroPv)} | Estado: ${value(op.statusProtheus)}\n• Pendiente: ${value(op.saldoAProduzir)} (producido: ${value(op.quantidadeProduzida)} / planificado: ${value(op.quantidadePlanejada)})\n• Previsión: ${value(op.dataPrevisaoFim)}\n• Incidencias: ${occurrenceSummary}`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `**Relatório de Consulta — Ordem de Produção ${op.numeroOp}**\n- Produto / Descrição: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- Pedido de Venda Vinculado: ${value(op.numeroPv)}\n- Situação Protheus: ${value(op.statusProtheus)}\n- Balanço Quantitativo: Planejado: ${value(op.quantidadePlanejada)} | Produzido: ${value(op.quantidadeProduzida)} | Saldo a Realizar: ${value(op.saldoAProduzir)}\n- Término Previsto: ${value(op.dataPrevisaoFim)}\n- Ocorrências Registradas: ${occurrenceSummary}`,
            `**Inquiry Report — Work Order ${op.numeroOp}**\n- Product / Description: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- Associated Sales Order: ${value(op.numeroPv)}\n- Protheus Status: ${value(op.statusProtheus)}\n- Quantitative Balance: Planned: ${value(op.quantidadePlanejada)} | Produced: ${value(op.quantidadeProduzida)} | Remaining: ${value(op.saldoAProduzir)}\n- Target Completion: ${value(op.dataPrevisaoFim)}\n- Logged Occurrences: ${occurrenceSummary}`,
            `**Informe de Consulta — Orden de Producción ${op.numeroOp}**\n- Producto / Descripción: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- Pedido de Venta Asociado: ${value(op.numeroPv)}\n- Estado Protheus: ${value(op.statusProtheus)}\n- Balance Cuantitativo: Planificado: ${value(op.quantidadePlanejada)} | Producido: ${value(op.quantidadeProduzida)} | Saldo Pendiente: ${value(op.saldoAProduzir)}\n- Finalización Prevista: ${value(op.dataPrevisaoFim)}\n- Incidencias Registradas: ${occurrenceSummary}`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `Aqui estão os dados da **OP ${op.numeroOp}**!\n- Produto: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- PV vinculado: ${value(op.numeroPv)}\n- Status Protheus: ${value(op.statusProtheus)}\n- Quantidades: planejada ${value(op.quantidadePlanejada)}, produzida ${value(op.quantidadeProduzida)}, saldo ${value(op.saldoAProduzir)}\n- Previsão: ${value(op.dataPrevisaoFim)}\n- Ocorrências: ${occurrenceSummary}\n\nSe quiser conferir os apontamentos ou abrir a ordem, use os botões abaixo!`,
          `**WO ${op.numeroOp}**\n- Product: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- Linked sales order: ${value(op.numeroPv)}\n- Protheus status: ${value(op.statusProtheus)}\n- Quantities: planned ${value(op.quantidadePlanejada)}, produced ${value(op.quantidadeProduzida)}, remaining ${value(op.saldoAProduzir)}\n- Due date: ${value(op.dataPrevisaoFim)}\n- Occurrences: ${occurrenceSummary}`,
          `**OP ${op.numeroOp}**\n- Producto: ${value(op.codigoProduto)} · ${value(op.descricaoProduto)}\n- PV vinculado: ${value(op.numeroPv)}\n- Estado Protheus: ${value(op.statusProtheus)}\n- Cantidades: planificada ${value(op.quantidadePlanejada)}, producida ${value(op.quantidadeProduzida)}, pendiente ${value(op.saldoAProduzir)}\n- Previsión: ${value(op.dataPrevisaoFim)}\n- Incidencias: ${occurrenceSummary}`
        ),
        actions,
      };
    }

    const saysHello = /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|como vai|opa|e ai|fala|hello|hi|hey)\b/i.test(lower);
    if (saysHello) {
      actions.push(nav('dashboard', copy('Abrir painel geral', 'Open dashboard', 'Abrir panel general')));
      actions.push(nav('traceability', copy('Ver pedidos e OPs', 'View orders and WOs', 'Ver pedidos y OP')));

      if (personality === 'direct') {
        return {
          reply: copy(
            `Pronto! Operação em andamento: **${context.ordersTotal ?? 'várias'} OPs** no espelho e **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** ativas. Qual dado você quer consultar?`,
            `Ready! Operation active: **${context.ordersTotal ?? 'several'} WOs** in mirror and **${context.activeOccurrencesTotal ?? 0} active occurrence(s)**. What data do you need?`,
            `¡Listo! Operación activa: **${context.ordersTotal ?? 'varias'} OP** en el espejo y **${context.activeOccurrencesTotal ?? 0} incidencia(s)** activas. ¿Qué dato deseas consultar?`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `Prezado(a), saudações. O monitoramento operacional registra atualmente **${context.ordersTotal ?? 'várias'} ordens de produção** e **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** sob acompanhamento no espelho Protheus. Permaneço à disposição para prestar os devidos esclarecimentos ou direcionamentos no sistema.`,
            `Greetings. Operational monitoring currently records **${context.ordersTotal ?? 'several'} production orders** and **${context.activeOccurrencesTotal ?? 0} active occurrence(s)** in the Protheus mirror. I remain at your service for any operational inquiries or system guidance.`,
            `Estimado(a), un cordial saludo. El monitoreo operativo registra actualmente **${context.ordersTotal ?? 'varias'} órdenes de producción** y **${context.activeOccurrencesTotal ?? 0} incidencia(s)** bajo seguimiento. Quedo a su disposición para cualquier consulta.`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `E aí! Tudo sob controle na fábrica. Tô acompanhando a operação de perto: temos **${context.ordersTotal ?? 'várias'} ordens de produção** rodando no espelho Protheus e **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** em aberto.\n\nPode mandar qualquer pergunta sobre OPs, insumos ou pedir o resumo do turno. O que vamos resolver agora?`,
          `Hello! Everything is running smoothly. I'm monitoring the shop floor and ready to assist you.\n\nWe currently have **${context.ordersTotal ?? 'several'} work orders** in the Protheus mirror and **${context.activeOccurrencesTotal ?? 0} active occurrence(s)**.\n\nFeel free to ask questions naturally, look up any work order, or request a shift summary. How can I help?`,
          `¡Hola! Todo marcha muy bien por aquí. Estoy siguiendo la producción y listo para ayudarte.\n\nActualmente tenemos **${context.ordersTotal ?? 'varias'} órdenes de producción** en el espejo de Protheus y **${context.activeOccurrencesTotal ?? 0} incidencia(s)** activas.\n\nPuedes hacer preguntas de forma natural, consultar cualquier OP o pedir el resumen del turno. ¿En qué te puedo ayudar?`
        ),
        actions,
      };
    }

    const saysHelp = /quem e voce|o que voce faz|ajuda|como funciona|o que pode fazer|capacidades|me ajude|help/i.test(lower);
    if (saysHelp) {
      actions.push(nav('dashboard', copy('Painel Geral', 'Dashboard', 'Panel General')));
      actions.push(nav('traceability', copy('Pedidos e OPs', 'Orders and WOs', 'Pedidos y OP')));
      actions.push(nav('occurrences', copy('Gestão de Ocorrências', 'Occurrences', 'Incidencias')));

      if (personality === 'direct') {
        return {
          reply: copy(
            `**Assistente Flash** — Comandos e consultas diretas:\n• **OPs:** Digite o número da ordem (ex: *OP 000101*) para quantidades e prazo.\n• **Turno:** Digite *"Resumo do turno"* para atrasos e prioridades.\n• **Ocorrências / Estoque:** Pergunte por paradas abertas ou insumos no mínimo.\n• **Navegação:** Digite o módulo desejado para receber o atalho.`,
            `**Flash Assistant** — Direct inquiry commands:\n• **WOs:** Type order number (e.g. *WO 000101*) for balances and due date.\n• **Shift:** Type *"Shift summary"* for overdue orders and priorities.\n• **Occurrences / Stock:** Query active issues or low stock.\n• **Navigation:** Ask for any module to receive direct shortcuts.`,
            `**Asistente Flash** — Consultas directas:\n• **OP:** Escriba el número de la OP para ver saldo y fecha.\n• **Turno:** Solicite *"Resumen del turno"* para ver prioridades.\n• **Incidencias / Inventario:** Consulte paradas o insumos críticos.\n• **Navegación:** Pida cualquier módulo para acceso directo.`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `O **Assistente Flash** constitui o copiloto de inteligência operacional e controle de produção (PCP) integrado ao NexusPCP.\n\nPrincipais capacidades disponíveis:\n- **Rastreabilidade Fabril:** Consulta tempestiva de especificações, saldos e prazos de ordens de produção.\n- **Briefing de Turno:** Consolidação analítica de metas, gargalos e pendências operacionais.\n- **Governança de Ocorrências:** Registro e monitoramento de paradas e não-conformidades de postos.\n- **Controle de Insumos:** Identificação de itens sob risco de ruptura de estoque mínimo.\n- **Navegação Guiada:** Fornecimento de atalhos diretos aos módulos requeridos.`,
            `**Flash Assistant** is the integrated operational intelligence copilot in NexusPCP.\n\nKey capabilities:\n- **Traceability:** Inquiries on work orders, balances, and completion dates.\n- **Shift Briefing:** Analytical synthesis of goals, bottlenecks, and priorities.\n- **Occurrence Governance:** Monitoring of stoppages and workstation non-conformities.\n- **Inventory Control:** Alerts for materials approaching critical safety stock levels.\n- **Guided Navigation:** Direct shortcuts to system modules.`,
            `El **Asistente Flash** es el copiloto de inteligencia operativa y control de producción en NexusPCP.`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `Sou o **Assistente Flash**, seu copiloto industrial aqui no NexusPCP!\n\nVocê não precisa usar comandos engessados, pode falar comigo com naturalidade sobre:\n- **Ordens de Produção:** Pergunte sobre qualquer OP pelo número (ex: *"Como está a OP 000101?"*) para ver saldo, quantidade e previsão.\n- **Visão do Turno:** Peça um *"Resumo do Turno"* para ter um panorama rápido de atrasos e prioridades.\n- **Ocorrências:** Veja quais problemas ou paradas de máquina estão em aberto no chão de fábrica.\n- **Estoque:** Consulte matérias-primas e insumos em nível crítico.\n- **Navegação:** Peça para ir até qualquer tela e eu coloco o atalho direto para você!\n\nO que gostaria de verificar agora?`,
          `I am **Flash Assistant**, your industrial copilot in NexusPCP!\n\nYou can chat with me naturally about:\n- **Work Orders:** Ask about any work order by number to see balances and due dates.\n- **Shift Overview:** Ask for a shift briefing to see active priorities and bottlenecks.\n- **Occurrences:** Check shop floor issues and stoppages.\n- **Inventory:** Check critical materials and low stock alerts.\n- **Navigation:** Ask to open any module and I'll provide direct shortcuts!\n\nWhat would you like to check?`,
          `¡Soy el **Asistente Flash**, tu copiloto industrial en NexusPCP!\n\nPuedes conversar conmigo con naturalidad sobre órdenes de producción, resumen de turno, incidencias de planta, inventario y navegación rápida. ¿Qué te gustaría consultar?`
        ),
        actions,
      };
    }

    const saysOee = /oee|eficiencia|produtividade/i.test(lower);
    if (saysOee) {
      actions.push(nav('production-lines', copy('Ver linhas e postos', 'View production lines', 'Ver líneas y puestos')));
      return {
        reply: copy(
          personality === 'direct'
            ? `**OEE (Eficiência Global do Equipamento):**\n• Disponibilidade: tempo produtivo sem paradas\n• Performance: peças reais vs velocidade nominal\n• Qualidade: peças boas vs refugo\n\nAbra **Linhas e Postos** para ver capacidade e **Ocorrências** para registrar paradas.`
            : personality === 'formal'
              ? `O indicador **OEE (Overall Equipment Effectiveness)** afere a eficiência global dos ativos industriais mediante a ponderação de três eixos fundamentais:\n1. **Disponibilidade:** relação entre tempo operacional real e tempo programado.\n2. **Desempenho:** velocidade efetiva de processamento confrontada com a cadência nominal.\n3. **Qualidade:** índice de conformidade das peças produzidas isentas de refugo.\n\nAs taxas de capacidade horária encontram-se parametrizadas no módulo **Linhas e Postos**, enquanto os desvios e interrupções são consignados na **Gestão de Ocorrências**.`
              : `O **OEE (Overall Equipment Effectiveness)** mede a eficiência real das linhas e postos combinando três fatores:\n- **Disponibilidade:** tempo que a máquina rodou sem paradas não planejadas.\n- **Performance:** velocidade de produção comparada à capacidade nominal instalada.\n- **Qualidade:** percentual de peças boas produzidas sem refugo.\n\nNo NexusPCP você pode checar a capacidade por hora na tela de **Linhas e Postos** e registrar paradas na **Gestão de Ocorrências**.`,
          `**OEE (Overall Equipment Effectiveness)** measures machine efficiency through Availability, Performance, and Quality.\n\nIn NexusPCP, you can inspect capacities in Lines & Workstations and log downtimes in Occurrence Management.`,
          `El **OEE** mide la eficiencia global a través de Disponibilidad, Rendimiento y Calidad.`
        ),
        actions,
      };
    }

    const saysBriefing = /resumo|briefing|turno|shift|como esta|panorama|geral/.test(lower);
    const saysOccurrences = /ocorr|inciden|parada|defeito|quebra|problema/.test(lower);
    const saysStock = /estoque|insumo|material|stock|inventory|falta de peca/.test(lower);
    const saysDelay = /atras|prazo|overdue|delayed|late|vencid/.test(lower);
    const saysSync = /protheus|sincron|sync|integracao|lote/.test(lower);
    const saysLines = /linha|posto|recurso|setor|workstation|maquina/.test(lower);

    if (saysBriefing) {
      const orderText = unavailable('orders')
        ? copy('OPs: consulta em atualização.', 'WOs: updating.', 'OP: actualizando.')
        : copy(`Temos **${context.ordersTotal ?? 'várias'} OPs** no espelho. Na amostra recente das ${context.recentOrders.length} ordens mais recentes, **${context.delayedOrdersInSample.length}** estão com data prevista vencida e saldo em aberto.`, `We have **${context.ordersTotal ?? 'several'} work orders** in the mirror. Among recent ones, **${context.delayedOrdersInSample.length}** are past due with remaining balance.`, `Tenemos **${context.ordersTotal ?? 'varias'} OP** en el espejo. En la muestra reciente, **${context.delayedOrdersInSample.length}** tienen fecha vencida.`);
      const occurrenceText = unavailable('occurrences')
        ? copy('Ocorrências: consulta em atualização.', 'Occurrences: updating.', 'Incidencias: actualizando.')
        : copy(`No chão de fábrica, há **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** ativas aguardando tratativa.`, `On the shop floor, there are **${context.activeOccurrencesTotal ?? 0} active occurrence(s)**.`, `En planta hay **${context.activeOccurrencesTotal ?? 0} incidencia(s)** activas.`);
      const stockText = unavailable('inventory')
        ? ''
        : copy(`No almoxarifado, **${context.criticalInventoryTotal ?? 0} insumo(s)** atingiram a margem de segurança do estoque mínimo.`, `In inventory, **${context.criticalInventoryTotal ?? 0} item(s)** reached minimum stock margin.`, `En almacén, **${context.criticalInventoryTotal ?? 0} insumo(s)** alcanzaron el nivel mínimo.`);
      const syncText = unavailable('sync')
        ? ''
        : context.lastSync
          ? copy(`Última sincronização Protheus: lote **${context.lastSync.batchCode}** com status \`${context.lastSync.status}\`.`, `Latest Protheus sync: batch **${context.lastSync.batchCode}** (\`${context.lastSync.status}\`).`, `Última sincronización Protheus: lote **${context.lastSync.batchCode}** (\`${context.lastSync.status}\`).`)
          : '';

      actions.push(nav('dashboard', copy('Painel Geral', 'Dashboard', 'Panel General')));
      actions.push(nav('occurrences', copy('Ver Ocorrências', 'View Occurrences', 'Ver Incidencias')));
      actions.push(nav('traceability', copy('Pedidos e OPs', 'Orders and WOs', 'Pedidos y OP')));

      if (personality === 'direct') {
        return {
          reply: copy(
            `**Status Operacional do Turno**:\n• 🏭 OPs: **${context.ordersTotal ?? 'várias'}** no total (${context.delayedOrdersInSample.length} atrasadas na amostra recente)\n• 📋 Ocorrências: **${context.activeOccurrencesTotal ?? 0}** ativas\n${context.criticalInventoryTotal ? `• 📦 Estoque crítico: **${context.criticalInventoryTotal}** insumo(s)\n` : ''}${context.lastSync ? `• 🔄 Protheus: lote **${context.lastSync.batchCode}** (${context.lastSync.status})\n` : ''}`,
            `**Shift Operational Status**:\n• 🏭 WOs: **${context.ordersTotal ?? 'several'}** total (${context.delayedOrdersInSample.length} overdue in recent sample)\n• 📋 Occurrences: **${context.activeOccurrencesTotal ?? 0}** active\n${context.criticalInventoryTotal ? `• 📦 Critical stock: **${context.criticalInventoryTotal}** item(s)\n` : ''}`,
            `**Estado Operativo del Turno**:\n• 🏭 OP: **${context.ordersTotal ?? 'varias'}** (${context.delayedOrdersInSample.length} atrasadas)\n• 📋 Incidencias: **${context.activeOccurrencesTotal ?? 0}** activas\n`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `**Relatório Consolidado de Operações — Turno Atual**:\n\n- **Ordens de Produção:** ${orderText}\n- **Ocorrências Fabris:** ${occurrenceText}\n${stockText ? `- **Níveis de Inventário:** ${stockText}\n` : ''}${syncText ? `- **Integração Protheus:** ${syncText}\n` : ''}\nRecomenda-se a atenção imediata aos apontamentos em aberto nos respectivos módulos de controle.`,
            `**Consolidated Operational Report — Current Shift**:\n\n- **Work Orders:** ${orderText}\n- **Occurrences:** ${occurrenceText}\n${stockText ? `- **Inventory Levels:** ${stockText}\n` : ''}${syncText ? `- **Protheus Integration:** ${syncText}\n` : ''}\nPrompt attention to open items across respective control modules is advised.`,
            `**Informe Consolidado de Operaciones — Turno Actual**:\n\n- **Órdenes de Producción:** ${orderText}\n- **Incidencias:** ${occurrenceText}\n`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `**Panorama Operacional do Turno**:\n\n* 🏭 ${orderText}\n* 📋 ${occurrenceText}\n${stockText ? `* 📦 ${stockText}\n` : ''}${syncText ? `* 🔄 ${syncText}\n` : ''}\nSe quiser detalhar alguma OP ou resolver uma ocorrência, é só me falar!`,
          `**Shift Operational Overview**:\n\n* 🏭 ${orderText}\n* 📋 ${occurrenceText}\n${stockText ? `* 📦 ${stockText}\n` : ''}${syncText ? `* 🔄 ${syncText}\n` : ''}\nLet me know if you want to inspect a work order or occurrence in detail!`,
          `**Resumen Operativo del Turno**:\n\n* 🏭 ${orderText}\n* 📋 ${occurrenceText}\n${stockText ? `* 📦 ${stockText}\n` : ''}${syncText ? `* 🔄 ${syncText}\n` : ''}\n¡Dime si deseas profundizar en alguna OP o incidencia!`
        ),
        actions,
      };
    }

    if (saysDelay) {
      actions.push(nav('traceability', copy('Ver pedidos e OPs atrasadas', 'View overdue orders', 'Ver OP atrasadas')));
      if (unavailable('orders')) return { reply: copy('A lista de ordens está sendo atualizada no momento.', 'The orders list is currently being refreshed.', 'La lista de órdenes se está actualizando.'), actions };
      const orders = context.delayedOrdersInSample;
      const details = orders.slice(0, 6).map((op) => `* **OP ${op.numeroOp}** (${op.codigoProduto}): saldo de ${op.saldoAProduzir} un. com previsão para ${op.dataPrevisaoFim}`).join('\n');

      if (personality === 'direct') {
        return {
          reply: copy(
            `**${orders.length} OPs atrasadas** na amostra recente:\n\n${details || 'Nenhum atraso crítico identificado.'}`,
            `**${orders.length} overdue work orders** in recent sample:\n\n${details || 'No critical delays.'}`,
            `**${orders.length} OP atrasadas** en la muestra reciente:\n\n${details || 'Sin retrasos críticos.'}`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `Constatou-se a existência de **${orders.length} ordens de produção** com prazo vencido e saldo pendente na amostragem recente:\n\n${details || 'Nenhum desvio temporal apurado na amostra vigente.'}\n\nSugere-se a reprogramação prioritária no módulo de Rastreabilidade.`,
            `A total of **${orders.length} production orders** past due date with open balance were identified in the recent sample:\n\n${details || 'No schedule deviations found in current sample.'}\n\nPriority rescheduling in the Traceability module is suggested.`,
            `Se han identificado **${orders.length} órdenes de producción** con fecha vencida:\n\n${details || 'Sin desviaciones en la muestra.'}`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `Identifiquei **${orders.length} ordens de produção** com prazo vencido e saldo pendente nas OPs mais recentes:\n\n${details || 'Nenhum atraso crítico identificado na amostra recente.'}\n\nVocê pode abrir a tela de **Pedidos e OPs** para filtrar e reprogramar prioridades.`,
          `Found **${orders.length} work orders** past due date with remaining balance:\n\n${details || 'No critical delays found in recent sample.'}\n\nYou can open Orders & WOs to reschedule priorities.`,
          `Encontré **${orders.length} órdenes de producción** con fecha vencida:\n\n${details || 'Sin retrasos críticos.'}`
        ),
        actions,
      };
    }

    if (saysOccurrences) {
      actions.push(nav('occurrences', copy('Abrir Gestão de Ocorrências', 'Open Occurrences', 'Abrir Incidencias')));
      if (unavailable('occurrences')) return { reply: copy('A consulta de ocorrências está indisponível no momento.', 'Occurrences query is currently unavailable.', 'Consulta de incidencias no disponible.'), actions };
      const list = context.activeOccurrences.slice(0, 5).map((item) => `* **OP ${item.numeroOp}** (${item.occurrenceType}): ${item.description}`).join('\n');

      if (personality === 'direct') {
        return {
          reply: copy(
            `**${context.activeOccurrencesTotal ?? 0} ocorrência(s) ativas**:\n\n${list || 'Nenhuma ocorrência em aberto no momento.'}`,
            `**${context.activeOccurrencesTotal ?? 0} active occurrence(s)**:\n\n${list || 'No open occurrences.'}`,
            `**${context.activeOccurrencesTotal ?? 0} incidencia(s) activas**:\n\n${list || 'Sin incidencias abiertas.'}`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `O sistema computa atualmente **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** fabris em tramitação ativa:\n\n${list || 'Inexistência de ocorrências ativas no presente ciclo.'}\n\nRecomenda-se o acompanhamento tempestivo na Gestão de Ocorrências.`,
            `The system currently records **${context.activeOccurrencesTotal ?? 0} active shop-floor occurrence(s)**:\n\n${list || 'No active occurrences in the current cycle.'}\n\nPrompt monitoring in Occurrence Management is advised.`,
            `El sistema registra actualmente **${context.activeOccurrencesTotal ?? 0} incidencia(s)** activas en planta:\n\n${list || 'Sin incidencias activas en el ciclo presente.'}`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `Temos **${context.activeOccurrencesTotal ?? 0} ocorrência(s)** abertas no chão de fábrica:\n\n${list || 'Nenhuma ocorrência pendente no momento!'}\n\nQuer abrir a tela para registrar uma atualização ou nova ocorrência?`,
          `We have **${context.activeOccurrencesTotal ?? 0} active occurrence(s)** on the shop floor:\n\n${list || 'No open occurrences right now!'}\n\nWould you like to open the management screen?`,
          `Tenemos **${context.activeOccurrencesTotal ?? 0} incidencia(s)** activas en planta:\n\n${list || '¡Sin incidencias pendientes!'}`
        ),
        actions,
      };
    }

    if (saysStock) {
      actions.push(nav('inventory', copy('Abrir Estoque de Insumos', 'Open Inventory', 'Abrir Inventario')));
      if (unavailable('inventory')) return { reply: copy('O estoque está sendo consultado.', 'Inventory is being queried.', 'Inventario en consulta.'), actions };
      const list = context.criticalInventory.slice(0, 5).map((item) => `* **${item.sku}** (${item.name}): saldo ${item.quantityOnHand} ${item.unit} (mínimo ${item.minimumStock})`).join('\n');

      if (personality === 'direct') {
        return {
          reply: copy(
            `**${context.criticalInventoryTotal ?? 0} insumos em estoque crítico**:\n\n${list || 'Nenhum insumo abaixo do estoque mínimo.'}`,
            `**${context.criticalInventoryTotal ?? 0} items at critical stock**:\n\n${list || 'No items below minimum stock.'}`,
            `**${context.criticalInventoryTotal ?? 0} insumos en nivel crítico**:\n\n${list || 'Ningún insumo por debajo del mínimo.'}`
          ),
          actions,
        };
      }

      if (personality === 'formal') {
        return {
          reply: copy(
            `Acusam-se **${context.criticalInventoryTotal ?? 0} insumo(s)** em patamar crítico ou inferior ao estoque de segurança:\n\n${list || 'Nenhum insumo vulnerável identificado na presente consulta.'}\n\nRecomenda-se a verificação com o setor de Suprimentos/Almoxarifado.`,
            `A total of **${context.criticalInventoryTotal ?? 0} item(s)** are currently at or below safety stock thresholds:\n\n${list || 'No inventory deficits detected in the current query.'}\n\nCoordination with Procurement and Inventory Control is advised.`,
            `Se registran **${context.criticalInventoryTotal ?? 0} insumo(s)** en nivel crítico de inventario:\n\n${list || 'Sin déficit en el inventario actual.'}`
          ),
          actions,
        };
      }

      return {
        reply: copy(
          `Temos **${context.criticalInventoryTotal ?? 0} insumo(s)** com saldo em alerta de reposição:\n\n${list || 'Todos os insumos cadastrados estão acima do estoque mínimo!'}\n\nVocê pode conferir as quantidades detalhadas na tela de Estoque.`,
          `We have **${context.criticalInventoryTotal ?? 0} item(s)** at or below minimum stock:\n\n${list || 'All materials are above minimum stock levels!'}\n\nYou can review details in the Inventory tab.`,
          `Tenemos **${context.criticalInventoryTotal ?? 0} insumo(s)** en nivel mínimo de reposición:\n\n${list || '¡Todos los insumos con niveles adecuados!'}`
        ),
        actions,
      };
    }

    if (saysSync) {
      actions.push(nav('settings?sub=protheus-sync', copy('Ver Sincronização Protheus', 'View Protheus Sync', 'Ver Sincronización Protheus')));
      if (unavailable('sync')) return { reply: copy('Histórico de sincronização em atualização.', 'Sync history updating.', 'Historial de sincronización actualizando.'), actions };
      return {
        reply: copy(
          context.lastSync
            ? (personality === 'direct'
                ? `Último lote Protheus: **${context.lastSync.batchCode}** (${context.lastSync.recordsCount} registros, status: \`${context.lastSync.status}\`).`
                : personality === 'formal'
                  ? `O último lote de sincronização Protheus processado foi o de código **${context.lastSync.batchCode}**, compreendendo **${context.lastSync.recordsCount} registros** com status \`${context.lastSync.status}\`.`
                  : `A última sincronização do Protheus foi com o lote **${context.lastSync.batchCode}**, contendo **${context.lastSync.recordsCount} registros** e situação \`${context.lastSync.status}\`.`)
            : `Ainda não há lotes de importação registrados no banco. Você pode executar uma sincronização na tela de integrações.`,
          context.lastSync
            ? `Latest Protheus sync was batch **${context.lastSync.batchCode}** with **${context.lastSync.recordsCount} records** (\`${context.lastSync.status}\`).`
            : `No import batches recorded yet.`,
          context.lastSync
            ? `Última sincronización Protheus: lote **${context.lastSync.batchCode}** con **${context.lastSync.recordsCount} registros** (\`${context.lastSync.status}\`).`
            : `Sin lotes registrados todavía.`
        ),
        actions,
      };
    }

    if (saysLines) {
      actions.push(nav('production-lines', copy('Ver Linhas e Postos', 'View Lines & Workstations', 'Ver Líneas y Puestos')));
      if (unavailable('lines')) return { reply: copy('Consulta de linhas em atualização.', 'Lines query updating.', 'Consulta de líneas actualizando.'), actions };
      const list = context.lines.map((line) => `* **${line.name}** (${line.code}): situação \`${line.status}\`, capacidade de ${line.capacityPerHour} un/h`).join('\n');
      return {
        reply: copy(
          personality === 'direct'
            ? `**${context.linesTotal ?? 0} linhas/postos cadastrados**:\n\n${list || 'Nenhum posto cadastrado.'}`
            : personality === 'formal'
              ? `O parque fabril compreende **${context.linesTotal ?? 0} linha(s) e postos de trabalho** homologados:\n\n${list || 'Nenhuma linha cadastrada na base de dados.'}\n\nPara conferência de capacidade nominal e supervisão, acesse o módulo correspondente.`
              : `Temos **${context.linesTotal ?? 0} linha(s) e postos** cadastrados:\n\n${list || 'Nenhum posto cadastrado ainda.'}\n\nPosso te levar até a tela de Linhas se quiser conferir as capacidades ou supervisores responsáveis.`,
          `We have **${context.linesTotal ?? 0} line(s) and workstation(s)**:\n\n${list || 'No lines registered yet.'}`,
          `Tenemos **${context.linesTotal ?? 0} línea(s) y puestos**:\n\n${list || 'Sin puestos registrados todavía.'}`
        ),
        actions,
      };
    }

    actions.push(
      nav('traceability', copy('Pedidos e OPs', 'Orders & WOs', 'Pedidos y OP')),
      nav('occurrences', copy('Ocorrências', 'Occurrences', 'Incidencias')),
      nav('dashboard', copy('Painel Geral', 'Dashboard', 'Panel General')),
    );

    if (personality === 'direct') {
      return {
        reply: copy(
          `Pronto para responder. Digite o número de uma OP, consulte atrasos, ocorrências ou estoques, ou selecione um atalho abaixo:`,
          `Ready to assist. Enter a work order number, query overdue items, occurrences, or inventory, or use the shortcuts below:`,
          `Listo para responder. Ingrese el número de una OP, consulte atrasos o inventarios, o use los accesos directos abajo:`
        ),
        actions,
      };
    }

    if (personality === 'formal') {
      return {
        reply: copy(
          `O Assistente Flash permanece à disposição para o fornecimento de dados consolidados e suporte à tomada de decisão no ambiente de manufatura.\n\nSugestões de consulta institucional:\n- Análise de OPs específicas pelo número identificador\n- Avaliação de conformidade temporal de ordens em andamento\n- Auditoria de ocorrências ativas e estoque de segurança\n\nIndique a consulta desejada para prosseguirmos.`,
          `Flash Assistant remains at your disposal for consolidated operational data and manufacturing decision support.\n\nSuggested inquiries:\n- Specific work order analysis by number\n- Schedule compliance audit on open orders\n- Review of active shop floor occurrences and safety stock\n\nPlease indicate your inquiry to proceed.`,
          `El Asistente Flash queda a su disposición para la provisión de información operativa consolidada y soporte a la toma de decisiones fabriles.`
        ),
        actions,
      };
    }

    return {
      reply: copy(
        `Com certeza! Estou à disposição para conversar sobre qualquer aspecto da fábrica e do PCP.\n\nVocê pode me perguntar, por exemplo:\n* *"Como está o andamento da produção hoje?"*\n* *"Quais OPs estão atrasadas?"*\n* *"Ver status da OP 000101"*\n* *"Quais ocorrências estão em aberto?"*\n* Ou me pedir para navegar para qualquer área do sistema.\n\nO que você gostaria de ver agora?`,
        `Certainly! I am here to chat and help with any aspect of factory operations and production control.\n\nYou can ask me things like:\n* *"How is production going today?"*\n* *"Which work orders are overdue?"*\n* *"Check status of WO 000101"*\n* *"Are there open occurrences?"*\n* Or ask me to take you to any section of the app.\n\nWhat would you like to explore?`,
        `¡Por supuesto! Estoy a tu disposición para ayudarte con qualquer aspecto de la fábrica y del PCP.\n\nPuedes preguntarme por el estado de producción, consultar una OP, revisar incidencias o pedirme que te lleve a cualquier pantalla. ¿Qué te gustaría ver ahora?`
      ),
      actions,
    };
  }
}

export const copilotService = new CopilotService();

