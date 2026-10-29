import { db } from '../../db/index.ts';
import { productionLines } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export class ProductionLinesRepository {
  public static async findAll() {
    try {
      return await db.select().from(productionLines).orderBy(desc(productionLines.createdAt));
    } catch (error) {
      console.error('Database query error in ProductionLinesRepository.findAll:', error);
      throw new Error('Falha ao consultar linhas de produção.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db.select().from(productionLines).where(eq(productionLines.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in ProductionLinesRepository.findById:', error);
      throw new Error('Falha ao consultar linha de produção por ID.', { cause: error });
    }
  }

  public static async findByCode(code: string) {
    try {
      const records = await db.select().from(productionLines).where(eq(productionLines.code, code.trim().toUpperCase()));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in ProductionLinesRepository.findByCode:', error);
      throw new Error('Falha ao consultar código de linha de produção.', { cause: error });
    }
  }

  public static async create(data: {
    code: string;
    name: string;
    description?: string;
    capacityPerHour?: number;
    status?: 'OPERATIONAL' | 'MAINTENANCE' | 'IDLE';
    supervisorName?: string;
  }) {
    try {
      const inserted = await db
        .insert(productionLines)
        .values({
          code: data.code.trim().toUpperCase(),
          name: data.name.trim(),
          description: data.description || null,
          capacityPerHour: data.capacityPerHour ?? 0,
          status: data.status || 'OPERATIONAL',
          supervisorName: data.supervisorName?.trim() || null,
        })
        .returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert error in ProductionLinesRepository.create:', error);
      throw new Error('Falha ao cadastrar linha de produção.', { cause: error });
    }
  }

  public static async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      capacityPerHour?: number;
      status?: 'OPERATIONAL' | 'MAINTENANCE' | 'IDLE';
      supervisorName?: string;
    }
  ) {
    try {
      const updated = await db
        .update(productionLines)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(productionLines.id, id))
        .returning();
      return updated[0] || null;
    } catch (error) {
      console.error('Database update error in ProductionLinesRepository.update:', error);
      throw new Error('Falha ao atualizar linha de produção.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(productionLines).where(eq(productionLines.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in ProductionLinesRepository.delete:', error);
      throw new Error('Falha ao excluir linha de produção.', { cause: error });
    }
  }
}
