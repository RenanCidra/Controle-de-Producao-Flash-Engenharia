import { db } from '../../db/index.ts';
import { organizations } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export class OrgRepository {
  public static async getProfile() {
    try {
      const records = await db.select().from(organizations).limit(1);
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in OrgRepository.getProfile:', error);
      throw new Error('Falha ao consultar perfil da fábrica.', { cause: error });
    }
  }

  public static async upsertProfile(data: {
    name: string;
    tradeName?: string;
    taxId?: string;
    plantCode?: string;
    email?: string;
    phone?: string;
    timezone?: string;
    address?: string;
  }) {
    try {
      const existing = await this.getProfile();
      if (existing) {
        const updated = await db
          .update(organizations)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, existing.id))
          .returning();
        return updated[0];
      } else {
        const created = await db
          .insert(organizations)
          .values({
            name: data.name,
            tradeName: data.tradeName || null,
            taxId: data.taxId || null,
            plantCode: data.plantCode || 'PLANTA-01',
            email: data.email || null,
            phone: data.phone || null,
            timezone: data.timezone || 'America/Sao_Paulo',
            address: data.address || null,
          })
          .returning();
        return created[0];
      }
    } catch (error) {
      console.error('Database write error in OrgRepository.upsertProfile:', error);
      throw new Error('Falha ao salvar dados da fábrica.', { cause: error });
    }
  }
}
