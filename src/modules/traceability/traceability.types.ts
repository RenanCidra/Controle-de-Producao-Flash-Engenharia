export interface TraceabilityFilterParams {
  search?: string;
  numeroPv?: string;
  numeroOp?: string;
  cliente?: string;
  codigoProduto?: string;
  statusOp?: string;
  statusPv?: string;
  postoTrabalho?: string;
  dataInicio?: string; // YYYYMMDD or YYYY-MM-DD
  dataFim?: string;
  apenasAtrasadas?: boolean;
  apenasComRefugo?: boolean;
  semVinculoPv?: boolean;
  page?: number;
  limit?: number;
}

export type PrazoStatus = 'NO_PRAZO' | 'ATRASADO' | 'RISCO_ATRASO' | 'CONCLUIDO' | 'SEM_PREVISAO';

export interface OperationProgress {
  sequenciaOperacao: string;
  codigoOperacao: string;
  descricaoOperacao: string;
  postoTrabalho: string | null;
  tempoPadraoMinutos: number | null;
  quantidadeApontada: number;
  quantidadeRefugo: number;
  concluida: boolean;
  emAndamento: boolean;
  ultimoApontamentoEm?: string | null;
  operadores: string[];
}

export interface TraceabilityMatrixItem {
  // OP Data (SC2)
  idOp: number;
  numeroOp: string;
  codigoProduto: string;
  descricaoProduto: string;
  codigoRoteiro: string | null;
  quantidadePlanejada: number;
  quantidadeProduzida: number;
  quantidadeRefugo: number;
  saldoAProduzir: number;
  percentualConclusao: number | null;
  statusProtheusOp: string;
  etapaAtual: string;
  postoTrabalhoAtual: string | null;
  dataEmissaoOp: string;
  dataInicioRealOp: string | null;
  dataPrevisaoFimOp: string;
  dataConclusaoRealOp: string | null;
  
  // PV Data (SC5/SC6) - if linked
  temVinculoPv: boolean;
  idPv?: number | null;
  numeroPv?: string | null;
  itemPv?: string | null;
  clienteCodigo?: string | null;
  clienteNome?: string | null;
  clienteCnpj?: string | null;
  quantidadePedidaPv?: number | null;
  quantidadeEntreguePv?: number | null;
  dataEmissaoPv?: string | null;
  dataEntregaPv?: string | null;
  statusProtheusPv?: string | null;

  // Real analysis
  statusPrazo: PrazoStatus;
  diasAtrasoOuFolga: number | null;
  totalOperacoesRoteiro: number;
  operacoesConcluidasCount: number;
  totalApontamentosCount: number;
  possuiDivergencia: boolean;
  motivoDivergencia?: string | null;
}

export interface TraceabilityDetail {
  op: TraceabilityMatrixItem;
  // Product Details (SB1)
  produto: {
    codigoProduto: string;
    descricao: string;
    tipo: string;
    unidadeMedida: string;
    armazemPadrao?: string | null;
  } | null;
  // Bill of Materials (SG1)
  estrutura: Array<{
    codigoComponente: string;
    descricaoComponente?: string | null;
    quantidadeNecessaria: number;
    unidadeComponente: string;
    perdaPercentual?: number | null;
    opFilhaRelacionada?: {
      numeroOp: string;
      quantidadePlanejada: number;
      quantidadeProduzida: number;
      etapaAtual: string;
      statusProtheus: string;
    } | null;
  }>;
  // Routing with physical progress (SG2 + SH6)
  roteiroComProgresso: OperationProgress[];
  // Physical Appointments history (SH6)
  apontamentos: Array<{
    id: number;
    sequenciaOperacao: string;
    codigoOperacao?: string | null;
    descricaoOperacao?: string | null;
    postoTrabalho?: string | null;
    operador?: string | null;
    quantidadeProduzida: number;
    quantidadeRefugo: number;
    dataApontamento: string;
    horaInicio?: string | null;
    horaFim?: string | null;
    tipoApontamento: string;
    motivoRefugo?: string | null;
  }>;
  // Parent Sales Order with other sibling items
  pedidoVendaCompleto?: {
    numeroPv: string;
    clienteNome: string;
    clienteCnpj?: string | null;
    dataEmissao: string;
    dataEntrega: string;
    statusProtheus: string;
    itens: Array<{
      itemPv: string;
      codigoProduto: string;
      descricaoProduto?: string | null;
      quantidadePedida: number;
      quantidadeEntregue: number;
      dataEntrega: string;
      opsRelacionadas: string[];
    }>;
  } | null;
}

export interface TraceabilitySummaryMetrics {
  totalOps: number;
  totalPvs: number;
  opsEmAndamento: number;
  opsConcluidas: number;
  opsAtrasadas: number;
  opsComRefugo: number;
  taxaEntregaPrazoPercentual: number | null;
}
