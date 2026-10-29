import { ProtheusNormalizer } from './protheus-sync.normalizer.ts';
import { ProtheusSyncRepository } from './protheus-sync.repository.ts';
import {
  IngestionResult,
  ProtheusEntityType,
  ProtheusSourceType,
  ProtheusSyncBundle,
} from './protheus-sync.types.ts';
import { AuditService } from '../../services/audit.service.ts';
import { db } from '../../db/index.ts';

export class ProtheusSyncService {
  private static generateBatchCode(prefix: string): string {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  }

  public static async processBundle(
    bundle: ProtheusSyncBundle,
    sourceType: ProtheusSourceType,
    importedBy?: string
  ): Promise<IngestionResult> {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      throw new Error('A carga deve ser um objeto com grupos de registros válidos.');
    }
    const prepare = <T extends object>(
      name: string,
      rows: Record<string, any>[] | undefined,
      normalize: (row: Record<string, any>) => T,
      required: (keyof T)[]
    ): T[] => (rows || []).map((row, index) => {
      try {
        const value = normalize(row);
        const missing = required.filter((key) => (value as any)[key] === undefined || (value as any)[key] === null || (typeof (value as any)[key] === 'string' && !(value as any)[key].trim()));
        if (missing.length) throw new Error(`campos obrigatórios ausentes: ${missing.join(', ')}`);
        return value;
      } catch (error: any) {
        throw new Error(`${name}, registro ${index + 1}: ${error.message || 'dados inválidos'}`);
      }
    });

    // Normalize and validate every row before creating a batch or writing any entity.
    const normalized = {
      products: prepare('Produto', bundle.products, ProtheusNormalizer.normalizeProduct.bind(ProtheusNormalizer), ['codigoProduto', 'descricao', 'tipo', 'unidadeMedida']),
      structures: prepare('Estrutura', bundle.structures, ProtheusNormalizer.normalizeStructure.bind(ProtheusNormalizer), ['codigoProdutoPai', 'codigoComponente', 'quantidadeNecessaria', 'unidadeComponente']),
      routings: prepare('Roteiro', bundle.routings, ProtheusNormalizer.normalizeRouting.bind(ProtheusNormalizer), ['codigoProduto', 'codigoRoteiro', 'sequenciaOperacao', 'codigoOperacao', 'descricaoOperacao']),
      salesOrders: prepare('Pedido de venda', bundle.salesOrders, ProtheusNormalizer.normalizeSalesOrder.bind(ProtheusNormalizer), ['numeroPv', 'itemPv', 'clienteNome', 'codigoProduto', 'quantidadePedida', 'quantidadeEntregue', 'unidadeMedida', 'dataEmissao', 'dataEntrega', 'statusProtheus']),
      productionOrders: prepare('Ordem de produção', bundle.productionOrders, ProtheusNormalizer.normalizeProductionOrder.bind(ProtheusNormalizer), ['numeroOp', 'codigoProduto', 'quantidadePlanejada', 'quantidadeProduzida', 'quantidadeRefugo', 'saldoAProduzir', 'statusProtheus', 'dataEmissao', 'dataPrevisaoFim']),
      appointments: prepare('Apontamento', bundle.appointments, ProtheusNormalizer.normalizeAppointment.bind(ProtheusNormalizer), ['numeroOp', 'sequenciaOperacao', 'quantidadeProduzida', 'quantidadeRefugo', 'dataApontamento', 'tipoApontamento']),
    };
    if (Object.values(normalized).every((rows) => rows.length === 0)) {
      throw new Error('O lote não contém registros para importar.');
    }
    const batchCode = this.generateBatchCode(sourceType === 'REST_API' ? 'REST' : 'FILE');
    const batch = await ProtheusSyncRepository.createBatch(
      batchCode,
      sourceType,
      'BUNDLE',
      importedBy
    );

    const errors: string[] = [];
    let totalProcessed = 0;
    let summary = '';
    const details: IngestionResult['details'] = {};

    try {
      await db.transaction(async (tx) => {
      // 1. Products (SB1)
      if (normalized.products.length > 0) {
        const count = await ProtheusSyncRepository.upsertProducts(normalized.products, batch.id, tx);
        details.products = count;
        totalProcessed += count;
      }

      // 2. Product Structures (SG1)
      if (normalized.structures.length > 0) {
        const count = await ProtheusSyncRepository.upsertStructures(normalized.structures, batch.id, tx);
        details.structures = count;
        totalProcessed += count;
      }

      // 3. Routings (SG2)
      if (normalized.routings.length > 0) {
        const count = await ProtheusSyncRepository.upsertRoutings(normalized.routings, batch.id, tx);
        details.routings = count;
        totalProcessed += count;
      }

      // 4. Sales Orders (SC5 / SC6)
      if (normalized.salesOrders.length > 0) {
        const count = await ProtheusSyncRepository.upsertSalesOrders(normalized.salesOrders, batch.id, tx);
        details.salesOrders = count;
        totalProcessed += count;
      }

      // 5. Production Orders (SC2)
      if (normalized.productionOrders.length > 0) {
        const count = await ProtheusSyncRepository.upsertProductionOrders(normalized.productionOrders, batch.id, tx);
        details.productionOrders = count;
        totalProcessed += count;
      }

      // 6. Appointments (SH6)
      if (normalized.appointments.length > 0) {
        const count = await ProtheusSyncRepository.insertAppointments(normalized.appointments, batch.id, tx);
        details.appointments = count;
        totalProcessed += count;
      }

      summary = `Processados com sucesso: ${Object.entries(details)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`;

      await ProtheusSyncRepository.updateBatchSummary(
        batch.id,
        totalProcessed,
        'PROCESSED',
        summary,
        tx
      );
      });

      await AuditService.record({
        userId: importedBy || 'SYSTEM',
        userEmail: importedBy || 'PROTHEUS_INTEGRATION',
        action: sourceType === 'REST_API' ? 'SYNC' : 'IMPORT',
        entity: 'PROTHEUS_SYNC',
        entityId: batchCode,
        details: {
          batchId: batch.id,
          sourceType,
          totalRecordsProcessed: totalProcessed,
          details,
          summary,
        },
        status: 'SUCCESS',
      });

      return {
        batchId: batch.id,
        batchCode,
        sourceType,
        entityType: 'BUNDLE',
        totalRecordsProcessed: totalProcessed,
        details,
        errors,
        createdAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await ProtheusSyncRepository.updateBatchSummary(
        batch.id,
        0,
        'FAILED',
        `Lote revertido; nenhum registro foi gravado. ${err.message || 'Falha no processamento.'}`
      );
      await AuditService.record({
        userId: importedBy || 'SYSTEM',
        userEmail: importedBy || 'PROTHEUS_INTEGRATION',
        action: sourceType === 'REST_API' ? 'SYNC' : 'IMPORT',
        entity: 'PROTHEUS_SYNC',
        entityId: batchCode,
        details: {
          batchId: batch.id,
          sourceType,
          error: err.message,
        },
        status: 'FAILURE',
      });
      throw err;
    }
  }

  public static async processFileContent(
    content: string,
    fileName: string,
    explicitEntityType?: ProtheusEntityType,
    importedBy?: string
  ): Promise<IngestionResult> {
    const isJson = fileName.endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[');

    if (isJson) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          // Array of objects
          const headers = parsed.length > 0 ? Object.keys(parsed[0]) : [];
          const entityType = explicitEntityType || ProtheusNormalizer.detectEntityTypeFromHeaders(headers);
          const bundle: ProtheusSyncBundle = {};

          if (entityType === 'PRODUCTS') bundle.products = parsed;
          else if (entityType === 'STRUCTURES') bundle.structures = parsed;
          else if (entityType === 'ROUTINGS') bundle.routings = parsed;
          else if (entityType === 'SALES_ORDERS') bundle.salesOrders = parsed;
          else if (entityType === 'PRODUCTION_ORDERS') bundle.productionOrders = parsed;
          else if (entityType === 'APPOINTMENTS') bundle.appointments = parsed;
          else throw new Error('A entidade BUNDLE não aceita uma lista simples. Informe a entidade ou envie um objeto com os grupos de dados.');

          return this.processBundle(bundle, 'FILE_IMPORT', importedBy);
        } else if (parsed && typeof parsed === 'object') {
          // Multi-entity JSON bundle
          return this.processBundle(parsed as ProtheusSyncBundle, 'FILE_IMPORT', importedBy);
        }
      } catch (err: any) {
        if (err instanceof SyntaxError) throw new Error(`Arquivo JSON inválido: ${err.message}`);
        throw err;
      }
    }

    // CSV file parsing
    const { headers, rows } = ProtheusNormalizer.parseCsv(content);
    if (rows.length === 0) {
      throw new Error('O arquivo CSV não possui registros válidos ou está vazio.');
    }

    const entityType = explicitEntityType || ProtheusNormalizer.detectEntityTypeFromHeaders(headers);
    const bundle: ProtheusSyncBundle = {};

    if (entityType === 'PRODUCTS') bundle.products = rows;
    else if (entityType === 'STRUCTURES') bundle.structures = rows;
    else if (entityType === 'ROUTINGS') bundle.routings = rows;
    else if (entityType === 'SALES_ORDERS') bundle.salesOrders = rows;
    else if (entityType === 'PRODUCTION_ORDERS') bundle.productionOrders = rows;
    else if (entityType === 'APPOINTMENTS') bundle.appointments = rows;
    else throw new Error('Não foi possível identificar a entidade deste CSV. Selecione o tipo de dado antes de importar.');

    return this.processBundle(bundle, 'FILE_IMPORT', importedBy);
  }
}
