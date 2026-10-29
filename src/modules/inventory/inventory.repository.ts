import { db } from '../../db/index.ts';
import { inventoryItems } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export class InventoryRepository {
  public static async findAll() {
    try {
      return await db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt));
    } catch (error) {
      console.error('Database query error in InventoryRepository.findAll:', error);
      throw new Error('Falha ao consultar itens de estoque e insumos.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in InventoryRepository.findById:', error);
      throw new Error('Falha ao consultar item por ID.', { cause: error });
    }
  }

  public static async findBySku(sku: string) {
    try {
      const records = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku.trim().toUpperCase()));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in InventoryRepository.findBySku:', error);
      throw new Error('Falha ao consultar item por SKU.', { cause: error });
    }
  }

  public static async create(data: {
    sku: string;
    name: string;
    description?: string;
    itemType?: 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'PACKAGING' | 'COMPONENT';
    unit?: string;
    costPrice?: string;
    quantityOnHand?: number;
    minimumStock?: number;
  }) {
    try {
      const inserted = await db
        .insert(inventoryItems)
        .values({
          sku: data.sku.trim().toUpperCase(),
          name: data.name.trim(),
          description: data.description || null,
          itemType: data.itemType || 'RAW_MATERIAL',
          unit: data.unit || 'UN',
          costPrice: data.costPrice || '0.00',
          quantityOnHand: data.quantityOnHand ?? 0,
          minimumStock: data.minimumStock ?? 0,
          status: 'ACTIVE',
        })
        .returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert error in InventoryRepository.create:', error);
      throw new Error('Falha ao criar item no estoque de produção.', { cause: error });
    }
  }

  public static async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      itemType?: 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'PACKAGING' | 'COMPONENT';
      unit?: string;
      costPrice?: string;
      quantityOnHand?: number;
      minimumStock?: number;
      status?: 'ACTIVE' | 'INACTIVE';
    }
  ) {
    try {
      const updated = await db
        .update(inventoryItems)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, id))
        .returning();
      return updated[0] || null;
    } catch (error) {
      console.error('Database update error in InventoryRepository.update:', error);
      throw new Error('Falha ao atualizar item de estoque.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in InventoryRepository.delete:', error);
      throw new Error('Falha ao excluir item de estoque.', { cause: error });
    }
  }
}
