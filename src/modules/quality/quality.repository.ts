import { db } from '../../db/index.ts';
import { qualityInspections, productionOrders, inventoryItems } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export class QualityRepository {
  public static async findAll() {
    try {
      return await db
        .select({
          id: qualityInspections.id,
          productionOrderId: qualityInspections.productionOrderId,
          orderNumber: productionOrders.orderNumber,
          itemName: inventoryItems.name,
          itemSku: inventoryItems.sku,
          batchNumber: qualityInspections.batchNumber,
          sampleSize: qualityInspections.sampleSize,
          approvedCount: qualityInspections.approvedCount,
          rejectedCount: qualityInspections.rejectedCount,
          status: qualityInspections.status,
          inspectorName: qualityInspections.inspectorName,
          notes: qualityInspections.notes,
          inspectedAt: qualityInspections.inspectedAt,
          createdAt: qualityInspections.createdAt,
        })
        .from(qualityInspections)
        .leftJoin(productionOrders, eq(qualityInspections.productionOrderId, productionOrders.id))
        .leftJoin(inventoryItems, eq(productionOrders.inventoryItemId, inventoryItems.id))
        .orderBy(desc(qualityInspections.createdAt));
    } catch (error) {
      console.error('Database query error in QualityRepository.findAll:', error);
      throw new Error('Falha ao consultar inspeções de qualidade.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db.select().from(qualityInspections).where(eq(qualityInspections.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in QualityRepository.findById:', error);
      throw new Error('Falha ao consultar inspeção por ID.', { cause: error });
    }
  }

  public static async create(data: {
    productionOrderId: number;
    batchNumber: string;
    sampleSize: number;
    approvedCount: number;
    rejectedCount: number;
    status: 'PASSED' | 'FAILED' | 'PENDING';
    inspectorName: string;
    notes?: string;
  }) {
    try {
      const inserted = await db
        .insert(qualityInspections)
        .values({
          productionOrderId: data.productionOrderId,
          batchNumber: data.batchNumber.trim().toUpperCase(),
          sampleSize: data.sampleSize,
          approvedCount: data.approvedCount,
          rejectedCount: data.rejectedCount,
          status: data.status,
          inspectorName: data.inspectorName.trim(),
          notes: data.notes || null,
        })
        .returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert error in QualityRepository.create:', error);
      throw new Error('Falha ao registrar inspeção de qualidade.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(qualityInspections).where(eq(qualityInspections.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in QualityRepository.delete:', error);
      throw new Error('Falha ao excluir inspeção de qualidade.', { cause: error });
    }
  }
}
