import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { JWT_CONFIG } from '../config/jwt.ts';
import type { JwtUserPayload } from '../types/index.ts';

export class TokenService {
  private static getSecret(): string {
    if (JWT_CONFIG.secret.length < 32) {
      throw new Error('JWT_SECRET deve estar configurado no ambiente com pelo menos 32 caracteres.');
    }
    return JWT_CONFIG.secret;
  }

  public static assertConfigured(): void {
    this.getSecret();
  }

  public static generateAccessToken(payload: Omit<JwtUserPayload, 'jti'>): { token: string; jti: string; expiresAt: Date } {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const options: jwt.SignOptions = {
      expiresIn: JWT_CONFIG.expiresIn as any,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      algorithm: 'HS256',
    };
    return { token: jwt.sign({ ...payload, jti }, this.getSecret(), options), jti, expiresAt };
  }

  public static generateRefreshToken(payload: Pick<JwtUserPayload, 'userId' | 'uid' | 'email'>): string {
    const options: jwt.SignOptions = {
      expiresIn: JWT_CONFIG.refreshExpiresIn as any,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    };
    return jwt.sign({ ...payload }, this.getSecret(), options);
  }

  public static verifyToken(token: string): JwtUserPayload {
    try {
      const decoded = jwt.verify(token, this.getSecret(), {
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        algorithms: ['HS256'],
      }) as JwtUserPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired JWT token', { cause: error });
    }
  }
}
