import { QualityRepository } from './quality.repository.ts';
import { AuditService } from '../../services/audit.service.ts';

export class QualityService {
  public static async list() {
    return await QualityRepository.findAll();
  }

  public static async create(
    actorId: string,
    actorEmail: string,
    data: {
      productionOrderId: number;
      batchNumber: string;
      sampleSize: number;
      approvedCount: number;
      rejectedCount: number;
      status: 'PASSED' | 'FAILED' | 'PENDING';
      inspectorName: string;
      notes?: string;
    }
  ) {
    if (!data.productionOrderId || !data.batchNumber || data.sampleSize === undefined || !data.inspectorName) {
      throw new Error('Ordem de produção, lote, tamanho da amostra e inspetor são obrigatórios.');
    }

    const created = await QualityRepository.create(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'QUALITY',
      entityId: String(created.id),
      details: {
        batchNumber: created.batchNumber,
        status: created.status,
        sampleSize: created.sampleSize,
      },
    });

    return created;
  }

  public static async delete(actorId: string, actorEmail: string, id: number) {
    const existing = await QualityRepository.findById(id);
    if (!existing) {
      throw new Error('Inspeção de qualidade não encontrada.');
    }

    await QualityRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'QUALITY',
      entityId: String(id),
      details: { batchNumber: existing.batchNumber },
    });

    return { success: true };
  }
}
