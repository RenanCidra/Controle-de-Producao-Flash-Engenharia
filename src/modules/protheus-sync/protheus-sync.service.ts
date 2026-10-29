import { ProtheusNormalizer } from './protheus-sync.normalizer.ts';
import { ProtheusSyncRepository } from './protheus-sync.repository.ts';
import {
  IngestionResult,
  ProtheusEntityType,
  ProtheusSourceType,
  ProtheusSyncBundle,
} from './protheus-sync.types.ts';

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
    const batchCode = this.generateBatchCode(sourceType === 'REST_API' ? 'REST' : 'FILE');
    const batch = await ProtheusSyncRepository.createBatch(
      batchCode,
      sourceType,
      'BUNDLE',
      importedBy
    );

    const errors: string[] = [];
    let totalProcessed = 0;
    const details: IngestionResult['details'] = {};

    try {
      // 1. Products (SB1)
      if (bundle.products && bundle.products.length > 0) {
        const normalized = bundle.products.map((p) => ProtheusNormalizer.normalizeProduct(p));
        const count = await ProtheusSyncRepository.upsertProducts(normalized, batch.id);
        details.products = count;
        totalProcessed += count;
      }

      // 2. Product Structures (SG1)
      if (bundle.structures && bundle.structures.length > 0) {
        const normalized = bundle.structures.map((s) => ProtheusNormalizer.normalizeStructure(s));
        const count = await ProtheusSyncRepository.upsertStructures(normalized, batch.id);
        details.structures = count;
        totalProcessed += count;
      }

      // 3. Routings (SG2)
      if (bundle.routings && bundle.routings.length > 0) {
        const normalized = bundle.routings.map((r) => ProtheusNormalizer.normalizeRouting(r));
        const count = await ProtheusSyncRepository.upsertRoutings(normalized, batch.id);
        details.routings = count;
        totalProcessed += count;
      }

      // 4. Sales Orders (SC5 / SC6)
      if (bundle.salesOrders && bundle.salesOrders.length > 0) {
        const normalized = bundle.salesOrders.map((o) => ProtheusNormalizer.normalizeSalesOrder(o));
        const count = await ProtheusSyncRepository.upsertSalesOrders(normalized, batch.id);
        details.salesOrders = count;
        totalProcessed += count;
      }

      // 5. Production Orders (SC2)
      if (bundle.productionOrders && bundle.productionOrders.length > 0) {
        const normalized = bundle.productionOrders.map((o) =>
          ProtheusNormalizer.normalizeProductionOrder(o)
        );
        const count = await ProtheusSyncRepository.upsertProductionOrders(normalized, batch.id);
        details.productionOrders = count;
        totalProcessed += count;
      }

      // 6. Appointments (SH6)
      if (bundle.appointments && bundle.appointments.length > 0) {
        const normalized = bundle.appointments.map((a) => ProtheusNormalizer.normalizeAppointment(a));
        const count = await ProtheusSyncRepository.insertAppointments(normalized, batch.id);
        details.appointments = count;
        totalProcessed += count;
      }

      const summary = `Processados com sucesso: ${Object.entries(details)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`;

      await ProtheusSyncRepository.updateBatchSummary(
        batch.id,
        totalProcessed,
        'PROCESSED',
        summary
      );

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
        totalProcessed,
        'FAILED',
        err.message || 'Falha no processamento do lote'
      );
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
          else bundle.products = parsed;

          return this.processBundle(bundle, 'FILE_IMPORT', importedBy);
        } else if (typeof parsed === 'object') {
          // Multi-entity JSON bundle
          return this.processBundle(parsed as ProtheusSyncBundle, 'FILE_IMPORT', importedBy);
        }
      } catch (err: any) {
        throw new Error(`Arquivo JSON inválido: ${err.message}`);
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
    else bundle.products = rows;

    return this.processBundle(bundle, 'FILE_IMPORT', importedBy);
  }
}
