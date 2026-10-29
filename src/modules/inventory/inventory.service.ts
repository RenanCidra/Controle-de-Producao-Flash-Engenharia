import { InventoryRepository } from './inventory.repository.ts';
import { AuditService } from '../../services/audit.service.ts';

export class InventoryService {
  public static async list() {
    return await InventoryRepository.findAll();
  }

  public static async create(
    actorId: string,
    actorEmail: string,
    data: {
      sku: string;
      name: string;
      description?: string;
      category: string;
      unit?: string;
      costPrice?: string;
      salePrice?: string;
      quantityOnHand?: number;
      minimumStock?: number;
    }
  ) {
    if (!data.sku || !data.name || !data.category) {
      throw new Error('SKU, Nome e Categoria são obrigatórios.');
    }

    const existing = await InventoryRepository.findBySku(data.sku);
    if (existing) {
      throw new Error(`O código SKU '${data.sku.toUpperCase()}' já está cadastrado.`);
    }

    const item = await InventoryRepository.create(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'INVENTORY',
      entityId: String(item.id),
      details: { sku: item.sku, name: item.name, quantity: item.quantityOnHand },
    });

    return item;
  }

  public static async update(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      name?: string;
      description?: string;
      category?: string;
      unit?: string;
      costPrice?: string;
      salePrice?: string;
      quantityOnHand?: number;
      minimumStock?: number;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ) {
    const existing = await InventoryRepository.findById(id);
    if (!existing) {
      throw new Error('Item de estoque não encontrado.');
    }

    const updated = await InventoryRepository.update(id, data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'INVENTORY',
      entityId: String(id),
      details: { sku: existing.sku, changes: data },
    });

    return updated;
  }

  public static async delete(actorId: string, actorEmail: string, id: number) {
    const existing = await InventoryRepository.findById(id);
    if (!existing) {
      throw new Error('Item de estoque não encontrado.');
    }

    await InventoryRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'INVENTORY',
      entityId: String(id),
      details: { sku: existing.sku, name: existing.name },
    });

    return { success: true };
  }
}
