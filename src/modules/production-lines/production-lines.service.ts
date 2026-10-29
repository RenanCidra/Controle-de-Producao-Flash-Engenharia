import { ProductionLinesRepository } from './production-lines.repository.ts';
import { AuditService } from '../../services/audit.service.ts';

export class ProductionLinesService {
  public static async list() {
    return await ProductionLinesRepository.findAll();
  }

  public static async create(
    actorId: string,
    actorEmail: string,
    data: {
      code: string;
      name: string;
      description?: string;
      capacityPerHour?: number;
      status?: 'OPERATIONAL' | 'MAINTENANCE' | 'IDLE';
      supervisorName?: string;
    }
  ) {
    if (!data.code || !data.name) {
      throw new Error('Código e nome do posto/linha de produção são obrigatórios.');
    }

    const existing = await ProductionLinesRepository.findByCode(data.code);
    if (existing) {
      throw new Error(`Linha com código '${data.code.toUpperCase()}' já existe.`);
    }

    const created = await ProductionLinesRepository.create(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'PRODUCTION_LINE',
      entityId: String(created.id),
      details: { code: created.code, name: created.name, capacity: created.capacityPerHour },
    });

    return created;
  }

  public static async update(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      name?: string;
      description?: string;
      capacityPerHour?: number;
      status?: 'OPERATIONAL' | 'MAINTENANCE' | 'IDLE';
      supervisorName?: string;
    }
  ) {
    const existing = await ProductionLinesRepository.findById(id);
    if (!existing) {
      throw new Error('Linha de produção não encontrada.');
    }

    const updated = await ProductionLinesRepository.update(id, data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'PRODUCTION_LINE',
      entityId: String(id),
      details: { code: existing.code, previousStatus: existing.status, changes: data },
    });

    return updated;
  }

  public static async delete(actorId: string, actorEmail: string, id: number) {
    const existing = await ProductionLinesRepository.findById(id);
    if (!existing) {
      throw new Error('Linha de produção não encontrada.');
    }

    await ProductionLinesRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'PRODUCTION_LINE',
      entityId: String(id),
      details: { code: existing.code, name: existing.name },
    });

    return { success: true };
  }
}
