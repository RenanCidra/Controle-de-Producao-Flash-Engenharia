import { db } from '../../db/index.ts';
import { productionOrders, inventoryItems, productionLines } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export class ProductionOrdersRepository {
  public static async findAll() {
    try {
      return await db
        .select({
          id: productionOrders.id,
          orderNumber: productionOrders.orderNumber,
          inventoryItemId: productionOrders.inventoryItemId,
          itemName: inventoryItems.name,
          itemSku: inventoryItems.sku,
          itemUnit: inventoryItems.unit,
          productionLineId: productionOrders.productionLineId,
          productionLineName: productionLines.name,
          productionLineCode: productionLines.code,
          quantityPlanned: productionOrders.quantityPlanned,
          quantityProduced: productionOrders.quantityProduced,
          quantityScrap: productionOrders.quantityScrap,
          status: productionOrders.status,
          priority: productionOrders.priority,
          startDate: productionOrders.startDate,
          plannedEndDate: productionOrders.plannedEndDate,
          completedDate: productionOrders.completedDate,
          notes: productionOrders.notes,
          createdAt: productionOrders.createdAt,
        })
        .from(productionOrders)
        .leftJoin(inventoryItems, eq(productionOrders.inventoryItemId, inventoryItems.id))
        .leftJoin(productionLines, eq(productionOrders.productionLineId, productionLines.id))
        .orderBy(desc(productionOrders.createdAt));
    } catch (error) {
      console.error('Database query error in ProductionOrdersRepository.findAll:', error);
      throw new Error('Falha ao consultar ordens de produção.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in ProductionOrdersRepository.findById:', error);
      throw new Error('Falha ao consultar ordem de produção por ID.', { cause: error });
    }
  }

  public static async findByOrderNumber(orderNumber: string) {
    try {
      const records = await db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.orderNumber, orderNumber.trim().toUpperCase()));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in ProductionOrdersRepository.findByOrderNumber:', error);
      throw new Error('Falha ao consultar ordem por número.', { cause: error });
    }
  }

  public static async create(data: {
    orderNumber: string;
    inventoryItemId: number;
    productionLineId?: number;
    quantityPlanned: number;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    startDate?: string;
    plannedEndDate: string;
    notes?: string;
  }) {
    try {
      const inserted = await db
        .insert(productionOrders)
        .values({
          orderNumber: data.orderNumber.trim().toUpperCase(),
          inventoryItemId: data.inventoryItemId,
          productionLineId: data.productionLineId || null,
          quantityPlanned: data.quantityPlanned,
          quantityProduced: 0,
          quantityScrap: 0,
          status: 'PLANNED',
          priority: data.priority || 'NORMAL',
          startDate: data.startDate || null,
          plannedEndDate: data.plannedEndDate,
          notes: data.notes || null,
        })
        .returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert error in ProductionOrdersRepository.create:', error);
      throw new Error('Falha ao criar ordem de produção.', { cause: error });
    }
  }

  public static async update(
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
    try {
      const updated = await db
        .update(productionOrders)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(productionOrders.id, id))
        .returning();
      return updated[0] || null;
    } catch (error) {
      console.error('Database update error in ProductionOrdersRepository.update:', error);
      throw new Error('Falha ao atualizar ordem de produção.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(productionOrders).where(eq(productionOrders.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in ProductionOrdersRepository.delete:', error);
      throw new Error('Falha ao excluir ordem de produção.', { cause: error });
    }
  }
}
