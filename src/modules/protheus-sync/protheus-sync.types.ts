export type ProtheusEntityType =
  | 'SALES_ORDERS'
  | 'PRODUCTS'
  | 'STRUCTURES'
  | 'ROUTINGS'
  | 'PRODUCTION_ORDERS'
  | 'APPOINTMENTS'
  | 'BUNDLE';

export type ProtheusSourceType = 'REST_API' | 'FILE_IMPORT';

export interface NormalizedProduct {
  codigoProduto: string;
  descricao: string;
  tipo: string;
  unidadeMedida: string;
  revisao?: string;
  armazemPadrao?: string;
}

export interface NormalizedStructure {
  codigoProdutoPai: string;
  codigoComponente: string;
  descricaoComponente?: string;
  quantidadeNecessaria: number;
  unidadeComponente: string;
  perdaPercentual?: number;
  revisao?: string;
}

export interface NormalizedRouting {
  codigoProduto: string;
  codigoRoteiro: string;
  sequenciaOperacao: string;
  codigoOperacao: string;
  descricaoOperacao: string;
  postoTrabalho?: string;
  tempoPadraoMinutos?: number;
}

export interface NormalizedSalesOrder {
  numeroPv: string;
  itemPv: string;
  clienteCodigo?: string;
  clienteNome: string;
  clienteCnpj?: string;
  codigoProduto: string;
  descricaoProduto?: string;
  quantidadePedida: number;
  quantidadeEntregue: number;
  unidadeMedida: string;
  dataEmissao: string;
  dataEntrega: string;
  statusProtheus: string;
}

export interface NormalizedProductionOrder {
  numeroOp: string;
  codigoProduto: string;
  descricaoProduto?: string;
  numeroPv?: string;
  itemPv?: string;
  codigoRoteiro?: string;
  quantidadePlanejada: number;
  quantidadeProduzida: number;
  quantidadeRefugo: number;
  saldoAProduzir: number;
  statusProtheus: string;
  etapaAtual?: string;
  dataEmissao: string;
  dataInicioReal?: string;
  dataPrevisaoFim: string;
  dataConclusaoReal?: string;
}

export interface NormalizedAppointment {
  numeroOp: string;
  sequenciaOperacao: string;
  codigoOperacao?: string;
  descricaoOperacao?: string;
  postoTrabalho?: string;
  operador?: string;
  quantidadeProduzida: number;
  quantidadeRefugo: number;
  dataApontamento: string;
  horaInicio?: string;
  horaFim?: string;
  tipoApontamento: string;
  motivoRefugo?: string;
}

export interface ProtheusSyncBundle {
  products?: (NormalizedProduct | Record<string, any>)[];
  structures?: (NormalizedStructure | Record<string, any>)[];
  routings?: (NormalizedRouting | Record<string, any>)[];
  salesOrders?: (NormalizedSalesOrder | Record<string, any>)[];
  productionOrders?: (NormalizedProductionOrder | Record<string, any>)[];
  appointments?: (NormalizedAppointment | Record<string, any>)[];
}

export interface IngestionResult {
  batchId: number;
  batchCode: string;
  sourceType: ProtheusSourceType;
  entityType: ProtheusEntityType;
  totalRecordsProcessed: number;
  details: {
    products?: number;
    structures?: number;
    routings?: number;
    salesOrders?: number;
    productionOrders?: number;
    appointments?: number;
  };
  errors: string[];
  createdAt: string;
}
