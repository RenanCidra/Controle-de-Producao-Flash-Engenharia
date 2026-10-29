import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { AuthRepository } from './auth.repository.ts';
import { normalizeLoginName, validateLoginName, validatePassword } from './credentials.ts';
import { TokenService } from '../../services/token.service.ts';
import { AuditService } from '../../services/audit.service.ts';
import { normalizeUserRole } from '../../types/index.ts';

const INVALID_CREDENTIALS = 'Credenciais inválidas.';

function publicUser(user: any) {
  return {
    id: user.id,
    uid: user.uid,
    loginName: user.loginName,
    email: user.email,
    name: user.name,
    role: normalizeUserRole(user.role),
    department: user.department,
  };
}

function issueAccessToken(user: any): string {
  return TokenService.generateAccessToken({
    userId: user.id,
    uid: user.uid,
    loginName: user.loginName,
    email: user.email || undefined,
    name: user.name,
    role: normalizeUserRole(user.role),
    status: user.status as 'ACTIVE' | 'INACTIVE',
    department: user.department,
  });
}

export class AuthService {
  public static async getSetupStatus() {
    const hasAdminCredential = await AuthRepository.hasActiveAdminCredential();
    return {
      setupRequired: !hasAdminCredential,
      bootstrapEnabled: Boolean(process.env.BOOTSTRAP_SECRET && process.env.BOOTSTRAP_SECRET.length >= 32),
    };
  }

  public static async bootstrapAdmin(data: {
    setupSecret: string;
    loginName: string;
    password: string;
    name: string;
    email?: string;
    ipAddress?: string;
  }) {
    TokenService.assertConfigured();
    const configuredSecret = process.env.BOOTSTRAP_SECRET;
    const suppliedSecret = Buffer.from(data.setupSecret || '');
    const expectedSecret = Buffer.from(configuredSecret || '');
    if (expectedSecret.length < 32 || suppliedSecret.length !== expectedSecret.length || !crypto.timingSafeEqual(suppliedSecret, expectedSecret)) {
      throw new Error('Configuração inicial indisponível ou chave inválida.');
    }

    const loginName = validateLoginName(data.loginName);
    validatePassword(data.password);
    if (!data.name?.trim()) throw new Error('Informe o nome do administrador.');

    const user = await AuthRepository.createFirstAdmin({
      uid: `usr_${crypto.randomUUID()}`,
      loginName,
      email: data.email,
      name: data.name,
      passwordHash: await bcrypt.hash(data.password, 12),
    });
    await AuthRepository.updateLastLogin(user.id);
    await AuditService.record({
      userId: user.uid,
      userEmail: user.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(user.id),
      details: { message: 'Conta administradora inicial provisionada' },
      ipAddress: data.ipAddress,
      status: 'SUCCESS',
    });

    return { user: publicUser(user), accessToken: issueAccessToken(user) };
  }

  public static async login(data: { loginName: string; password?: string; ipAddress?: string }) {
    TokenService.assertConfigured();
    const loginName = normalizeLoginName(data.loginName);
    const user = await AuthRepository.findByLoginName(loginName);
    const passwordMatches = user?.passwordHash && data.password
      ? await bcrypt.compare(data.password, user.passwordHash)
      : false;

    if (!user || user.status !== 'ACTIVE' || !passwordMatches) {
      await AuditService.record({
        userId: user?.uid || null,
        userEmail: user?.email || null,
        action: 'LOGIN',
        entity: 'AUTH',
        entityId: user ? String(user.id) : null,
        details: { message: 'Tentativa de autenticação inválida', loginName },
        ipAddress: data.ipAddress,
        status: 'FAILURE',
      });
      throw new Error(INVALID_CREDENTIALS);
    }

    await AuthRepository.updateLastLogin(user.id);
    await AuditService.record({
      userId: user.uid,
      userEmail: user.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(user.id),
      details: { message: 'Autenticação concluída', loginName },
      ipAddress: data.ipAddress,
      status: 'SUCCESS',
    });

    return { user: publicUser(user), accessToken: issueAccessToken(user) };
  }
}
