import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { UserRole, UserStatus } from '../../types/index.ts';

export class UsersRepository {
  public static async findAll() {
    try {
      return await db
        .select({
          id: users.id,
          uid: users.uid,
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
      throw new Error('Falha ao consultar equipe de produção.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db
        .select({
          id: users.id,
          uid: users.uid,
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
      throw new Error('Falha ao consultar operador por ID.', { cause: error });
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
      throw new Error('Falha ao atualizar dados do operador.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      await db.delete(users).where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error('Database delete error in UsersRepository.delete:', error);
      throw new Error('Falha ao excluir colaborador.', { cause: error });
    }
  }
}
