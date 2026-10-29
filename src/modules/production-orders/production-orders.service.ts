import { ProductionOrdersRepository } from './production-orders.repository.ts';
import { AuditService } from '../../services/audit.service.ts';

export class ProductionOrdersService {
  public static async list() {
    return await ProductionOrdersRepository.findAll();
  }

  public static async create(
    actorId: string,
    actorEmail: string,
    data: {
      orderNumber: string;
      inventoryItemId: number;
      productionLineId?: number;
      quantityPlanned: number;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      startDate?: string;
      plannedEndDate: string;
      notes?: string;
    }
  ) {
    if (!data.orderNumber || !data.inventoryItemId || !data.quantityPlanned || !data.plannedEndDate) {
      throw new Error('Número da OP, item, quantidade planejada e previsão de término são obrigatórios.');
    }

    const existing = await ProductionOrdersRepository.findByOrderNumber(data.orderNumber);
    if (existing) {
      throw new Error(`Ordem de produção '${data.orderNumber.toUpperCase()}' já existe.`);
    }

    const created = await ProductionOrdersRepository.create(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'PRODUCTION_ORDER',
      entityId: String(created.id),
      details: {
        orderNumber: created.orderNumber,
        itemId: created.inventoryItemId,
        quantityPlanned: created.quantityPlanned,
      },
    });

    return created;
  }

  public static async update(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      productionLineId?: number;
      quantityProduced?: number;
      quantityScrap?: number;
      status?: 'PLANNED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      startDate?: string;
      plannedEndDate?: string;
      completedDate?: string;
      notes?: string;
    }
  ) {
    const existing = await ProductionOrdersRepository.findById(id);
    if (!existing) {
      throw new Error('Ordem de produção não encontrada.');
    }

    const updated = await ProductionOrdersRepository.update(id, data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'PRODUCTION_ORDER',
      entityId: String(id),
      details: {
        orderNumber: existing.orderNumber,
        previousStatus: existing.status,
        changes: data,
      },
    });

    return updated;
  }

  public static async delete(actorId: string, actorEmail: string, id: number) {
    const existing = await ProductionOrdersRepository.findById(id);
    if (!existing) {
      throw new Error('Ordem de produção não encontrada.');
    }

    await ProductionOrdersRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'PRODUCTION_ORDER',
      entityId: String(id),
      details: { orderNumber: existing.orderNumber },
    });

    return { success: true };
  }
}
