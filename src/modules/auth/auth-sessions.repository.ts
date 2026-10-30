import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { authSessions } from '../../db/schema.ts';

export class AuthSessionsRepository {
  public static hashTokenId(tokenId: string): string {
    return createHash('sha256').update(tokenId).digest('hex');
  }

  public static async create(userId: number, tokenId: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(authSessions).where(lt(authSessions.expiresAt, retentionCutoff));
    await db.insert(authSessions).values({
      userId,
      sessionHash: this.hashTokenId(tokenId),
      expiresAt,
    });
  }

  public static async isActive(userId: number, tokenId: string): Promise<boolean> {
    const [session] = await db.select({ id: authSessions.id }).from(authSessions).where(and(
      eq(authSessions.userId, userId),
      eq(authSessions.sessionHash, this.hashTokenId(tokenId)),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
    )).limit(1);
    return Boolean(session);
  }

  public static async revoke(userId: number, tokenId: string): Promise<void> {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(and(
      eq(authSessions.userId, userId),
      eq(authSessions.sessionHash, this.hashTokenId(tokenId)),
      isNull(authSessions.revokedAt),
    ));
  }

  public static async revokeOtherSessions(userId: number, currentTokenId: string): Promise<void> {
    // Revoke only unexpired, non-current sessions; retain the browser performing the password change.
    await db.update(authSessions).set({ revokedAt: new Date() }).where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
      ne(authSessions.sessionHash, this.hashTokenId(currentTokenId)),
    ));
  }

  public static async revokeAll(userId: number): Promise<void> {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
    ));
  }
}
