import { db } from '../../db/index.ts';
import { integrations } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export class IntegrationsRepository {
  public static async findAll() {
    try {
      return await db.select().from(integrations).orderBy(desc(integrations.createdAt));
    } catch (error) {
      console.error('Database query error in IntegrationsRepository.findAll:', error);
      throw new Error('Falha ao consultar integrações de terceiros.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db.select().from(integrations).where(eq(integrations.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in IntegrationsRepository.findById:', error);
      throw new Error('Falha ao consultar integração por ID.', { cause: error });
    }
  }

  public static async create(data: {
    name: string;
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    authType?: string;
    headerName?: string;
  }) {
    try {
      const created = await db
        .insert(integrations)
        .values({
          name: data.name.trim(),
          provider: data.provider.toUpperCase().trim(),
          baseUrl: data.baseUrl?.trim() || null,
          apiKey: data.apiKey?.trim() || null,
          authType: data.authType || 'BEARER',
          headerName: data.headerName?.trim() || null,
          status: 'CONFIGURED',
        })
        .returning();
      return created[0];
    } catch (error) {
      console.error('Database insert error in IntegrationsRepository.create:', error);
      throw new Error('Falha ao registrar integração de API.', { cause: error });
    }
  }

  public static async update(
    id: number,
    data: {
      name?: string;
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      authType?: string;
      headerName?: string;
      status?: 'CONFIGURED' | 'ACTIVE' | 'ERROR' | 'DISABLED';
      lastSyncAt?: Date;
      lastStatusMessage?: string;
    }
  ) {
    try {
      const updated = await db
        .update(integrations)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, id))
        .returning();
      return updated[0] || null;
    } catch (error) {
      console.error('Database update error in IntegrationsRepository.update:', error);
      throw new Error('Falha ao atualizar dados da integração.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(integrations).where(eq(integrations.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in IntegrationsRepository.delete:', error);
      throw new Error('Falha ao remover integração.', { cause: error });
    }
  }
}
