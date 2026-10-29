import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export class AuthRepository {
  public static async findByEmail(email: string) {
    try {
      const records = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      return records[0] || null;
    } catch (error) {
      console.error('Database query failed in AuthRepository.findByEmail:', error);
      throw new Error('Falha ao consultar usuário no banco de dados.', { cause: error });
    }
  }

  public static async findByUid(uid: string) {
    try {
      const records = await db.select().from(users).where(eq(users.uid, uid));
      return records[0] || null;
    } catch (error) {
      console.error('Database query failed in AuthRepository.findByUid:', error);
      throw new Error('Falha ao consultar usuário por UID.', { cause: error });
    }
  }

  public static async createUser(data: {
    uid: string;
    email: string;
    name: string;
    passwordHash?: string;
    role?: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
    department?: string;
  }) {
    try {
      const inserted = await db.insert(users).values({
        uid: data.uid,
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        passwordHash: data.passwordHash || null,
        role: data.role || 'ADMIN',
        department: data.department || null,
        status: 'ACTIVE',
      }).returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert failed in AuthRepository.createUser:', error);
      throw new Error('Falha ao registrar novo usuário no banco de dados.', { cause: error });
    }
  }

  public static async updateLastLogin(id: number) {
    try {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
    } catch (error) {
      console.error('Failed to update last login:', error);
    }
  }
}
