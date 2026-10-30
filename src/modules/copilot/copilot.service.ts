import { GoogleGenAI } from '@google/genai';
import { db } from '../../db/index.ts';
import {
  protheusProductionOrders,
  productionOccurrences,
  inventoryItems,
  productionLines,
  protheusImportBatches,
  protheusSalesOrders,
  protheusRoutings,
} from '../../db/schema.ts';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { UserRole } from '../../types/index.ts';

export interface CopilotChatOptions {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  user: {
    uid: string;
    name: string;
    role: UserRole;
    department?: string | null;
  };
}

export interface CopilotAction {
  type: 'NAVIGATE' | 'FILTER_OP' | 'OPEN_MODAL';
  target: string;
  label: string;
  payload?: Record<string, unknown>;
}

export interface CopilotChatResponse {
  reply: string;
  actions?: CopilotAction[];
  snapshotSummary?: {
    totalOrders: number;
    openOccurrences: number;
    criticalInventory: number;
    linesOperational: string;
  };
}

export class CopilotService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  /**
   * Coleta dados em tempo real do banco de dados para alimentar o contexto do assistente.
   */
  public async getOperationalContext() {
    try {
      const [
        ordersData,
        occurrencesData,
        inventoryData,
        linesData,
        lastBatchData,
      ] = await Promise.all([
        // Resumo de ordens de produção
        db
          .select({
            numeroOp: protheusProductionOrders.numeroOp,
            codigoProduto: protheusProductionOrders.codigoProduto,
            descricaoProduto: protheusProductionOrders.descricaoProduto,
            quantidadePlanejada: protheusProductionOrders.quantidadePlanejada,
            quantidadeProduzida: protheusProductionOrders.quantidadeProduzida,
            saldoAProduzir: protheusProductionOrders.saldoAProduzir,
            statusProtheus: protheusProductionOrders.statusProtheus,
            etapaAtual: protheusProductionOrders.etapaAtual,
            dataPrevisaoFim: protheusProductionOrders.dataPrevisaoFim,
          })
          .from(protheusProductionOrders)
          .orderBy(desc(protheusProductionOrders.createdAt))
          .limit(20)
          .catch(() => []),

        // Ocorrências ativas
        db
          .select({
            id: productionOccurrences.id,
            numeroOp: productionOccurrences.numeroOp,
            occurrenceType: productionOccurrences.occurrenceType,
            description: productionOccurrences.description,
            workstation: productionOccurrences.workstation,
            status: productionOccurrences.status,
            createdAt: productionOccurrences.createdAt,
          })
          .from(productionOccurrences)
          .where(eq(productionOccurrences.status, 'OPEN'))
          .orderBy(desc(productionOccurrences.createdAt))
          .limit(10)
          .catch(() => []),

        // Itens de estoque com nível crítico ou zerado
        db
          .select({
            sku: inventoryItems.sku,
            name: inventoryItems.name,
            quantityOnHand: inventoryItems.quantityOnHand,
            minimumStock: inventoryItems.minimumStock,
            unit: inventoryItems.unit,
          })
          .from(inventoryItems)
          .limit(15)
          .catch(() => []),

        // Linhas de produção e postos
        db
          .select({
            code: productionLines.code,
            name: productionLines.name,
            status: productionLines.status,
            capacityPerHour: productionLines.capacityPerHour,
            supervisorName: productionLines.supervisorName,
          })
          .from(productionLines)
          .limit(10)
          .catch(() => []),

        // Último lote de sincronização Protheus
        db
          .select({
            batchCode: protheusImportBatches.batchCode,
            entityType: protheusImportBatches.entityType,
            recordsCount: protheusImportBatches.recordsCount,
            status: protheusImportBatches.status,
            createdAt: protheusImportBatches.createdAt,
          })
          .from(protheusImportBatches)
          .orderBy(desc(protheusImportBatches.createdAt))
          .limit(1)
          .catch(() => []),
      ]);

      const totalOps = ordersData.length;
      const delayedOps = ordersData.filter((op) => {
        if (!op.dataPrevisaoFim) return false;
        const nowStr = new Date().toISOString().slice(0, 10);
        return op.dataPrevisaoFim < nowStr && Number(op.saldoAProduzir) > 0;
      });

      const criticalInventory = inventoryData.filter(
        (item) => item.quantityOnHand <= item.minimumStock,
      );

      return {
        totalOrders: totalOps,
        sampleOrders: ordersData,
        delayedOrdersCount: delayedOps.length,
        delayedOrdersSample: delayedOps.slice(0, 5),
        openOccurrencesCount: occurrencesData.length,
        openOccurrences: occurrencesData,
        criticalInventoryCount: criticalInventory.length,
        criticalInventory,
        lines: linesData,
        lastSync: lastBatchData[0] || null,
      };
    } catch (err) {
      console.error('Erro ao montar contexto operacional do Copilot:', err);
      return {
        totalOrders: 0,
        sampleOrders: [],
        delayedOrdersCount: 0,
        delayedOrdersSample: [],
        openOccurrencesCount: 0,
        openOccurrences: [],
        criticalInventoryCount: 0,
        criticalInventory: [],
        lines: [],
        lastSync: null,
      };
    }
  }

  /**
   * Busca detalhes aprofundados se a mensagem citar um número de OP específico (ex: "OP 000101" ou "000101").
   */
  public async searchSpecificOpData(message: string) {
    const opMatch = message.match(/(?:OP|ordem|número)?\s*#?([A-Za-z0-9\-_]{4,15})/i);
    if (!opMatch) return null;

    const opCandidate = opMatch[1];
    try {
      const [opResult] = await db
        .select()
        .from(protheusProductionOrders)
        .where(
          or(
            eq(protheusProductionOrders.numeroOp, opCandidate),
            ilike(protheusProductionOrders.numeroOp, `%${opCandidate}%`),
          ),
        )
        .limit(1);

      if (!opResult) return null;

      // Buscar ocorrências desta OP
      const opOccurrences = await db
        .select()
        .from(productionOccurrences)
        .where(eq(productionOccurrences.numeroOp, opResult.numeroOp))
        .orderBy(desc(productionOccurrences.createdAt))
        .limit(5);

      // Buscar roteiro se houver produto
      const routings = await db
        .select()
        .from(protheusRoutings)
        .where(eq(protheusRoutings.codigoProduto, opResult.codigoProduto))
        .limit(5);

      return {
        op: opResult,
        occurrences: opOccurrences,
        routings,
      };
    } catch {
      return null;
    }
  }

  /**
   * Processa a mensagem do usuário via Gemini API com prompt de sistema industrial
   */
  public async chat(options: CopilotChatOptions): Promise<CopilotChatResponse> {
    const { message, user } = options;

    // 1. Coleta contexto do chão de fábrica
    const context = await this.getOperationalContext();
    const specificOp = await this.searchSpecificOpData(message);

    // Formata o resumo do chão de fábrica para o modelo
    const contextPrompt = `
DADOS REAIS EM TEMPO REAL DO CHÃO DE FÁBRICA (NEXUSPCP - FLASH ENGENHARIA):
- Usuário Atual: ${user.name} (Perfil: ${user.role}, Setor: ${user.department || 'Operações Gerais'})
- Total de OPs recentes monitoradas: ${context.totalOrders}
- OPs com atraso detectado: ${context.delayedOrdersCount}
- Ocorrências abertas no chão de fábrica: ${context.openOccurrencesCount}
- Itens de estoque em nível crítico (<= estoque mínimo): ${context.criticalInventoryCount}
- Linhas de Produção: ${context.lines.map((l) => `${l.name} (${l.status})`).join(', ') || 'Nenhuma cadastrada'}
- Última sincronização Protheus: ${context.lastSync ? `Lote ${context.lastSync.batchCode} (${context.lastSync.recordsCount} registros)` : 'Sem dados recentes'}

AMOSTRA DE ORDENS DE PRODUÇÃO ATIVAS:
${context.sampleOrders.map((o) => `* OP ${o.numeroOp} | Produto: ${o.codigoProduto} - ${o.descricaoProduto || ''} | Status: ${o.statusProtheus} | Plan: ${o.quantidadePlanejada} | Prod: ${o.quantidadeProduzida} | Saldo: ${o.saldoAProduzir} | Previsão Fim: ${o.dataPrevisaoFim}`).join('\n')}

OCORRÊNCIAS ABERTAS:
${context.openOccurrences.map((occ) => `* ID #${occ.id} | OP: ${occ.numeroOp} | Tipo: ${occ.occurrenceType} | Posto: ${occ.workstation || 'Geral'} | Descrição: ${occ.description}`).join('\n') || 'Nenhuma ocorrência em aberto no momento.'}

ITENS CRÍTICOS DE ESTOQUE:
${context.criticalInventory.map((i) => `* SKU ${i.sku} (${i.name}): Estoque Atual ${i.quantityOnHand} ${i.unit} (Mínimo: ${i.minimumStock} ${i.unit})`).join('\n') || 'Estoque dentro dos parâmetros ideais.'}

${
  specificOp
    ? `DADOS ESPECÍFICOS DA OP CONSULTADA (${specificOp.op.numeroOp}):
- Produto: ${specificOp.op.codigoProduto} - ${specificOp.op.descricaoProduto}
- Pedido de Venda associado: ${specificOp.op.numeroPv || 'Sem PV direto (Ordem de Estoque)'}
- Quantidade: Planejada ${specificOp.op.quantidadePlanejada} | Produzida ${specificOp.op.quantidadeProduzida} | Saldo ${specificOp.op.saldoAProduzir} | Refugo: ${specificOp.op.quantidadeRefugo}
- Previsão de Conclusão: ${specificOp.op.dataPrevisaoFim}
- Ocorrências registradas nesta OP: ${specificOp.occurrences.length} (${specificOp.occurrences.map((o) => `${o.occurrenceType}: ${o.description}`).join('; ') || 'Nenhuma'})
`
    : ''
}
`;

    // Se temos cliente Gemini inicializado
    if (this.ai) {
      try {
        const systemInstruction = `
Você é o **Assistente Flash**, o copiloto de Inteligência Artificial e "Mago do PCP" da Flash Engenharia e da plataforma industrial NexusPCP.
Sua missão é dar superpoderes aos operadores, supervisores e gestores de chão de fábrica e controle de produção integrado ao TOTVS Protheus.

DIRETRIZES DE RESPOSTA:
1. Tom: Industrial, objetivo, analítico, seguro e ágil. Você não enrola.
2. Seja preciso com números, códigos de OP, produtos, prazos e saldo a produzir baseando-se estritamente nos dados reais fornecidos.
3. Se o usuário pedir atalhos ou navegar para telas, oriente com precisão. Você pode incluir tags especiais no final da mensagem para renderizar botões de ação na interface:
   - [[ACTION:NAVIGATE:traceability?op=NUMERO_DA_OP]] (para abrir a rastreabilidade daquela OP)
   - [[ACTION:NAVIGATE:occurrences]] (para ir para a gestão de ocorrências)
   - [[ACTION:NAVIGATE:occurrences?op=NUMERO_DA_OP]] (para filtrar ocorrências de uma OP específica)
   - [[ACTION:NAVIGATE:inventory]] (para tela de estoque)
   - [[ACTION:NAVIGATE:production-lines]] (para linhas de produção)
   - [[ACTION:NAVIGATE:dashboard]] (para o painel geral)
   - [[ACTION:NAVIGATE:settings?sub=protheus-sync]] (para sincronização do Protheus)
4. Formate a resposta usando Markdown limpo com negrito, listas e emojis discretos (ex: ⚡, 🏭, 📦, ⚠️, ✅).
5. Responda no idioma em que o usuário perguntar (prioritariamente Português).
`;

        const response = await this.ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `${contextPrompt}\n\nPERGUNTA DO USUÁRIO:\n${message}`,
          config: {
            systemInstruction,
          },
        });

        const rawText = response.text || 'Desculpe, não consegui processar a resposta no momento.';
        return this.parseActionsAndFormat(rawText, specificOp?.op.numeroOp);
      } catch (geminiError: any) {
        console.error('Erro na chamada Gemini API do Assistente Flash:', geminiError);
        // Fallback inteligente caso haja erro de cota ou conexão
        return this.generateDeterministicFallback(message, context, specificOp);
      }
    }

    // Se a chave não estiver no ambiente, responder com o motor determinístico inteligente
    return this.generateDeterministicFallback(message, context, specificOp);
  }

  /**
   * Gera o Briefing Operacional Instantâneo (Resumo do Turno)
   */
  public async getBriefing(user: { name: string; role: UserRole }): Promise<CopilotChatResponse> {
    const prompt = 'Gere um Briefing Operacional completo do turno atual. Destaque OPs atrasadas, gargalos, ocorrências abertas e saúde do estoque.';
    return this.chat({
      message: prompt,
      user: {
        uid: 'system',
        name: user.name,
        role: user.role,
      },
    });
  }

  /**
   * Extrai tags [[ACTION:...]] do texto e as transforma em objetos de ação interativos
   */
  private parseActionsAndFormat(rawText: string, defaultOp?: string): CopilotChatResponse {
    const actions: CopilotAction[] = [];
    const actionRegex = /\[\[ACTION:([A-Z_]+):([^\]]+)\]\]/g;
    let cleanText = rawText;

    let match;
    while ((match = actionRegex.exec(rawText)) !== null) {
      const actionType = match[1] as 'NAVIGATE';
      const target = match[2];

      if (actionType === 'NAVIGATE') {
        let label = 'Navegar';
        if (target.startsWith('traceability')) {
          label = target.includes('op=')
            ? `Ver OP ${target.split('op=')[1]} na Rastreabilidade`
            : 'Abrir Pedidos e OPs';
        } else if (target.startsWith('occurrences')) {
          label = target.includes('op=')
            ? `Ver Ocorrências da OP ${target.split('op=')[1]}`
            : 'Abrir Gestão de Ocorrências';
        } else if (target.startsWith('inventory')) {
          label = 'Consultar Estoque de Insumos';
        } else if (target.startsWith('production-lines')) {
          label = 'Ver Linhas e Postos';
        } else if (target.startsWith('dashboard')) {
          label = 'Ir para Painel Geral';
        } else if (target.includes('protheus-sync')) {
          label = 'Ver Sincronização Protheus';
        }

        actions.push({
          type: 'NAVIGATE',
          target,
          label,
        });
      }
    }

    // Remove as tags visuais do corpo do texto para manter estética limpa
    cleanText = cleanText.replace(actionRegex, '').trim();

    // Se falou de uma OP e não adicionou ação explícita, sugerir a ação de rastreabilidade
    if (defaultOp && !actions.some((a) => a.target.includes(defaultOp))) {
      actions.push({
        type: 'NAVIGATE',
        target: `traceability?op=${defaultOp}`,
        label: `Consultar OP ${defaultOp} no PCP`,
      });
    }

    return {
      reply: cleanText,
      actions,
    };
  }

  /**
   * Resposta determinística para quando a API externa não estiver disponível
   */
  private generateDeterministicFallback(
    message: string,
    context: any,
    specificOp: any,
  ): CopilotChatResponse {
    const lower = message.toLowerCase();
    const actions: CopilotAction[] = [];

    if (specificOp) {
      const op = specificOp.op;
      const occCount = specificOp.occurrences.length;
      actions.push({
        type: 'NAVIGATE',
        target: `traceability?op=${op.numeroOp}`,
        label: `Abrir Rastreabilidade da OP ${op.numeroOp}`,
      });
      if (occCount > 0) {
        actions.push({
          type: 'NAVIGATE',
          target: `occurrences?op=${op.numeroOp}`,
          label: `Ver ${occCount} Ocorrência(s) da OP`,
        });
      }

      return {
        reply: `⚡ **Status da OP ${op.numeroOp}**:
* **Produto:** ${op.codigoProduto} - ${op.descricaoProduto || 'Produto industrial'}
* **Status:** \`${op.statusProtheus}\` | **Etapa Atual:** ${op.etapaAtual || 'Chão de fábrica'}
* **Quantidades:** Planejada: **${op.quantidadePlanejada}** | Produzida: **${op.quantidadeProduzida}** | Saldo: **${op.saldoAProduzir}**
* **Previsão de Conclusão:** ${op.dataPrevisaoFim || 'Não informada'}
* **Ocorrências associadas:** ${occCount === 0 ? 'Nenhuma ocorrência pendente ✅' : `⚠️ ${occCount} ocorrência(s) registrada(s)`}`,
        actions,
      };
    }

    if (lower.includes('resumo') || lower.includes('turno') || lower.includes('briefing')) {
      actions.push(
        { type: 'NAVIGATE', target: 'dashboard', label: 'Painel Geral' },
        { type: 'NAVIGATE', target: 'occurrences', label: 'Gestão de Ocorrências' },
      );

      return {
        reply: `⚡ **Briefing Operacional Flash (Resumo do Turno)**:

* 🏭 **Ordens Monitoradas:** ${context.totalOrders} ordens de produção em acompanhamento.
* ⚠️ **Atrasos:** ${context.delayedOrdersCount} OP(s) ultrapassaram a data prevista de entrega.
* 📋 **Ocorrências Abertas:** ${context.openOccurrencesCount} ocorrência(s) necessitando de ação imediata.
* 📦 **Estoque Crítico:** ${context.criticalInventoryCount} insumo(s) abaixo da margem de segurança.
* 🔄 **Integração Protheus:** ${context.lastSync ? `Último lote importado (${context.lastSync.batchCode}) com status \`${context.lastSync.status}\`.` : 'Nenhum lote recente registrado.'}

Dica: Posso abrir os detalhes de qualquer OP diretamente ou detalhar as ocorrências para você!`,
        actions,
      };
    }

    if (lower.includes('ocorrên') || lower.includes('parada') || lower.includes('defeito')) {
      actions.push({ type: 'NAVIGATE', target: 'occurrences', label: 'Ver Todas as Ocorrências' });
      return {
        reply: `📋 **Ocorrências no Chão de Fábrica**:
Atualmente existem **${context.openOccurrencesCount} ocorrência(s) abertas**.
${context.openOccurrences.slice(0, 4).map((o: any) => `* **OP ${o.numeroOp}** (${o.occurrenceType}): ${o.description} [Posto: ${o.workstation || 'Geral'}]`).join('\n') || 'Nenhuma ocorrência crítica aberta no momento!'}`,
        actions,
      };
    }

    if (lower.includes('estoque') || lower.includes('materia') || lower.includes('insumo')) {
      actions.push({ type: 'NAVIGATE', target: 'inventory', label: 'Abrir Gestão de Estoque' });
      return {
        reply: `📦 **Posição de Estoque**:
Temos **${context.criticalInventoryCount} item(ns) com alerta de reposição**.
${context.criticalInventory.slice(0, 4).map((i: any) => `* **${i.sku}** (${i.name}): Atual ${i.quantityOnHand} ${i.unit} (Mínimo: ${i.minimumStock})`).join('\n') || 'Todos os insumos cadastrados estão com níveis adequados.'}`,
        actions,
      };
    }

    // Resposta padrão
    actions.push(
      { type: 'NAVIGATE', target: 'traceability', label: 'Ver Pedidos e OPs' },
      { type: 'NAVIGATE', target: 'occurrences', label: 'Ver Ocorrências' },
    );

    return {
      reply: `⚡ Olá! Sou o **Assistente Flash**, seu copiloto industrial e "Mago do PCP".
Posso ajudar você com:
1. **Consultar qualquer OP:** Digite o número da OP (ex: *"Como está a OP 000101?"*)
2. **Resumo do Turno:** Peça um *"Resumo do Turno"* ou *"Briefing Operacional"*
3. **Alertas:** Verifique *"Ocorrências abertas"* ou *"Estoque crítico"*
4. **Navegação rápida:** Peça para ir para qualquer tela do sistema!

Como posso ajudar sua produção agora?`,
      actions,
    };
  }
}

export const copilotService = new CopilotService();
