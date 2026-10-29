import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { AuthRepository } from './auth.repository.ts';
import { UsersRepository } from '../users/users.repository.ts';
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
  public static async changeOwnPassword(uid: string, currentPassword: string, newPassword: string, ipAddress?: string) {
    const user = await AuthRepository.findByUid(uid);
    if (!user || user.status !== 'ACTIVE') throw new Error('CONTA_INATIVA');
    if (!user.passwordHash || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      throw new Error('SENHA_ATUAL_INCORRETA');
    }
    validatePassword(newPassword);
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new Error('SENHA_NOVA_IGUAL');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await UsersRepository.updatePassword(user.id, passwordHash);
    await AuditService.record({
      userId: user.uid,
      userEmail: user.email,
      action: 'UPDATE',
      entity: 'USER',
      entityId: String(user.id),
      details: { action: 'OWN_PASSWORD_CHANGE', loginName: user.loginName },
      ipAddress,
      status: 'SUCCESS',
    });

    return { success: true, message: 'Senha alterada com sucesso.' };
  }

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

  public static async login(data: { loginName?: string; identifier?: string; password?: string; ipAddress?: string }) {
    TokenService.assertConfigured();
    const rawIdentifier = (data.identifier || data.loginName || '').trim();
    if (!rawIdentifier) {
      throw new Error(INVALID_CREDENTIALS);
    }

    const candidates = await AuthRepository.findByIdentifier(rawIdentifier);
    let matchedUser: any = null;

    if (data.password) {
      for (const candidate of candidates) {
        if (candidate.status === 'ACTIVE' && candidate.passwordHash) {
          const isMatch = await bcrypt.compare(data.password, candidate.passwordHash);
          if (isMatch) {
            matchedUser = candidate;
            break;
          }
        }
      }
    }

    if (!matchedUser) {
      await AuditService.record({
        userId: candidates[0]?.uid || null,
        userEmail: candidates[0]?.email || null,
        action: 'LOGIN',
        entity: 'AUTH',
        entityId: candidates[0] ? String(candidates[0].id) : null,
        details: { message: 'Tentativa de autenticação inválida' },
        ipAddress: data.ipAddress,
        status: 'FAILURE',
      });
      throw new Error(INVALID_CREDENTIALS);
    }

    await AuthRepository.updateLastLogin(matchedUser.id);
    await AuditService.record({
      userId: matchedUser.uid,
      userEmail: matchedUser.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(matchedUser.id),
      details: { message: 'Autenticação concluída', loginName: matchedUser.loginName },
      ipAddress: data.ipAddress,
      status: 'SUCCESS',
    });

    return { user: publicUser(matchedUser), accessToken: issueAccessToken(matchedUser) };
  }
}
