import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { and, eq, desc, sql } from 'drizzle-orm';
import { UserRole, UserStatus } from '../../types/index.ts';

export class UsersRepository {
  public static async countActiveAdmins(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
    return Number(result?.count || 0);
  }

  public static async findAll() {
    try {
      return await db
        .select({
          id: users.id,
          uid: users.uid,
          loginName: users.loginName,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          department: users.department,
          avatarUrl: users.avatarUrl,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
    } catch (error) {
      console.error('Database query error in UsersRepository.findAll:', error);
      throw new Error('Falha ao consultar contas de acesso.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db
        .select({
          id: users.id,
          uid: users.uid,
          loginName: users.loginName,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          department: users.department,
          avatarUrl: users.avatarUrl,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, id));
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in UsersRepository.findById:', error);
      throw new Error('Falha ao consultar conta de acesso por ID.', { cause: error });
    }
  }

  public static async update(
    id: number,
    data: {
      name?: string;
      role?: UserRole;
      status?: UserStatus;
      department?: string;
    }
  ) {
    try {
      const updated = await db
        .update(users)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      return updated[0] || null;
    } catch (error) {
      console.error('Database update error in UsersRepository.update:', error);
      throw new Error('Falha ao atualizar conta de acesso.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(users).where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in UsersRepository.delete:', error);
      throw new Error('Falha ao excluir conta de acesso.', { cause: error });
    }
  }
}
