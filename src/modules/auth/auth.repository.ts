import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { UserRole } from '../../types/index.ts';

export class AuthRepository {
  public static async findByEmail(email: string) {
    if (!email?.trim()) return null;
    try {
      const records = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      return records[0] || null;
    } catch (error) {
      console.error('Database query failed in AuthRepository.findByEmail:', error);
      throw new Error('Falha ao consultar usuário no banco de dados.', { cause: error });
    }
  }

  public static async findByExactLoginName(loginName: string) {
    if (!loginName?.trim()) return null;
    try {
      const normalized = loginName.toLowerCase().trim();
      const records = await db.select().from(users).where(eq(users.loginName, normalized));
      return records[0] || null;
    } catch (error) {
      console.error('Database query failed in AuthRepository.findByExactLoginName:', error);
      throw new Error('Falha ao consultar conta de acesso.', { cause: error });
    }
  }

  public static async findByIdentifier(identifier: string) {
    if (!identifier?.trim()) return [];
    try {
      const raw = identifier.trim();
      const normalized = raw.toLowerCase();
      const upper = raw.toUpperCase();
      const numMatch = raw.match(/^#?(\d+)$/);
      const numericId = numMatch ? parseInt(numMatch[1], 10) : null;

      const conditions = [
        eq(users.loginName, normalized),
        eq(users.email, normalized),
        eq(users.uid, raw),
        eq(users.uid, normalized),
        eq(users.uid, upper),
        sql`LOWER(${users.name}) = ${normalized}`,
      ];

      if (numericId !== null && !isNaN(numericId)) {
        conditions.push(eq(users.id, numericId));
      }

      // Exact identifiers and exact full names preserve compatibility without an unbounded prefix scan.
      const records = await db.select().from(users).where(or(...conditions)).limit(10);
      return records;
    } catch (error) {
      console.error('Database query failed in AuthRepository.findByIdentifier:', error);
      throw new Error('Falha ao consultar conta de acesso.', { cause: error });
    }
  }

  public static async findByLoginName(loginName: string) {
    const matches = await this.findByIdentifier(loginName);
    return matches[0] || null;
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
    loginName: string;
    email?: string | null;
    name: string;
    passwordHash?: string;
    role?: UserRole;
    department?: string;
  }) {
    try {
      const inserted = await db.insert(users).values({
        uid: data.uid,
        loginName: data.loginName.toLowerCase().trim(),
        email: data.email?.toLowerCase().trim() || null,
        name: data.name.trim(),
        passwordHash: data.passwordHash || null,
        role: data.role || 'OPERATOR',
        department: data.department || null,
        status: 'ACTIVE',
      }).returning();
      return inserted[0];
    } catch (error) {
      console.error('Database insert failed in AuthRepository.createUser:', error);
      throw new Error('Falha ao registrar novo usuário no banco de dados.', { cause: error });
    }
  }

  public static async hasActiveAdminCredential(): Promise<boolean> {
    const [result] = await db.select({ id: users.id }).from(users).where(and(
      eq(users.role, 'ADMIN'),
      eq(users.status, 'ACTIVE'),
      isNotNull(users.passwordHash),
    )).limit(1);
    return Boolean(result);
  }

  public static async createFirstAdmin(data: {
    uid: string;
    loginName: string;
    email?: string | null;
    name: string;
    passwordHash: string;
  }) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(731904211)`);
      const [admin] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.role, 'ADMIN'),
        eq(users.status, 'ACTIVE'),
        isNotNull(users.passwordHash),
      )).limit(1);
      if (admin) throw new Error('A configuração inicial já foi concluída.');

      const [created] = await tx.insert(users).values({
        uid: data.uid,
        loginName: data.loginName,
        email: data.email?.toLowerCase().trim() || null,
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      }).returning();
      return created;
    });
  }

  public static async updateLastLogin(id: number) {
    try {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
    } catch (error) {
      console.error('Failed to update last login:', error);
    }
  }
}

