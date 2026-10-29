import { TraceabilityRepository } from './traceability.repository.ts';
import {
  TraceabilityDetail,
  TraceabilityFilterParams,
  TraceabilityMatrixItem,
  TraceabilitySummaryMetrics,
} from './traceability.types.ts';

export class TraceabilityService {
  public static async getMatrix(params: TraceabilityFilterParams): Promise<{
    items: TraceabilityMatrixItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    return TraceabilityRepository.listMatrix(params);
  }

  public static async getOpDetail(numeroOp: string): Promise<TraceabilityDetail | null> {
    if (!numeroOp || !numeroOp.trim()) {
      throw new Error('Número da Ordem de Produção não informado.');
    }
    return TraceabilityRepository.getOpDetail(numeroOp.trim());
  }

  public static async getMetrics(): Promise<TraceabilitySummaryMetrics> {
    return TraceabilityRepository.getMetrics();
  }

  /**
   * Generates a Brazilian standard industrial CSV with semicolon delimiter, UTF-8 BOM,
   * and clean escaping for Excel / ERP integration.
   */
  public static async generateExportCsv(params: TraceabilityFilterParams): Promise<string> {
    // Fetch all items matching the filter (up to 5000 records for export)
    const exportParams = { ...params, page: 1, limit: 5000 };
    const { items } = await TraceabilityRepository.listMatrix(exportParams);

    const headers = [
      'Numero_OP',
      'Status_OP_Protheus',
      'Etapa_Atual',
      'Posto_Trabalho_Atual',
      'Codigo_Produto',
      'Descricao_Produto',
      'Qtd_Planejada_OP',
      'Qtd_Produzida_OP',
      'Saldo_Produzir_OP',
      'Refugo_OP',
      'Progresso_Fisico_Perc',
      'Emissao_OP',
      'Previsao_Fim_OP',
      'Conclusao_Real_OP',
      'Situacao_Prazo',
      'Dias_Atraso_Folga',
      'Possui_Divergencia',
      'Numero_PV',
      'Item_PV',
      'Cliente_Nome',
      'Cliente_CNPJ',
      'Cliente_Codigo',
      'Qtd_Pedida_PV',
      'Qtd_Entregue_PV',
      'Emissao_PV',
      'Entrega_PV',
      'Status_PV_Protheus',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      if (str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    const rows = items.map((item) => [
      escapeCsv(item.numeroOp),
      escapeCsv(item.statusProtheusOp),
      escapeCsv(item.etapaAtual),
      escapeCsv(item.postoTrabalhoAtual || '-'),
      escapeCsv(item.codigoProduto),
      escapeCsv(item.descricaoProduto),
      escapeCsv(item.quantidadePlanejada),
      escapeCsv(item.quantidadeProduzida),
      escapeCsv(item.saldoAProduzir),
      escapeCsv(item.quantidadeRefugo),
      escapeCsv(item.percentualConclusao),
      escapeCsv(item.dataEmissaoOp),
      escapeCsv(item.dataPrevisaoFimOp),
      escapeCsv(item.dataConclusaoRealOp || '-'),
      escapeCsv(item.statusPrazo),
      escapeCsv(item.diasAtrasoOuFolga !== null ? item.diasAtrasoOuFolga : '-'),
      escapeCsv(item.possuiDivergencia ? 'SIM' : 'NAO'),
      escapeCsv(item.numeroPv || '-'),
      escapeCsv(item.itemPv || '-'),
      escapeCsv(item.clienteNome || '-'),
      escapeCsv(item.clienteCnpj || '-'),
      escapeCsv(item.clienteCodigo || '-'),
      escapeCsv(item.quantidadePedidaPv !== null ? item.quantidadePedidaPv : '-'),
      escapeCsv(item.quantidadeEntreguePv !== null ? item.quantidadeEntreguePv : '-'),
      escapeCsv(item.dataEmissaoPv || '-'),
      escapeCsv(item.dataEntregaPv || '-'),
      escapeCsv(item.statusProtheusPv || '-'),
    ]);

    // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel
    const csvContent =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');

    return csvContent;
  }

  /**
   * Generates a structured JSON dump for APIs and automated audits.
   */
  public static async generateExportJson(params: TraceabilityFilterParams) {
    const exportParams = { ...params, page: 1, limit: 5000 };
    const { items, total } = await TraceabilityRepository.listMatrix(exportParams);

    return {
      metadata: {
        sistema: 'NexusPCP - Rastreabilidade Industrial TOTVS Protheus',
        modulo: 'Modulo 2 - Motor de Rastreabilidade Avancada PV <-> OP',
        geradoEm: new Date().toISOString(),
        totalRegistros: total,
        filtrosAplicados: params,
      },
      data: items,
    };
  }
}
