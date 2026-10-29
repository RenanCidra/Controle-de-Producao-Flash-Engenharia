import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/jwt.ts';
import { JwtUserPayload } from '../types/index.ts';

export class TokenService {
  public static generateAccessToken(payload: JwtUserPayload): string {
    const options: jwt.SignOptions = {
      expiresIn: JWT_CONFIG.expiresIn as any,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    };
    return jwt.sign({ ...payload }, JWT_CONFIG.secret, options);
  }

  public static generateRefreshToken(payload: Pick<JwtUserPayload, 'userId' | 'uid' | 'email'>): string {
    const options: jwt.SignOptions = {
      expiresIn: JWT_CONFIG.refreshExpiresIn as any,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    };
    return jwt.sign({ ...payload }, JWT_CONFIG.secret, options);
  }

  public static verifyToken(token: string): JwtUserPayload {
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.secret, {
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
      }) as JwtUserPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired JWT token', { cause: error });
    }
  }
}
