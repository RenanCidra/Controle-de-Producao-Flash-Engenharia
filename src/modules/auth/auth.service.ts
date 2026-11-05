import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { AuthRepository } from './auth.repository.ts';
import { AuthSessionsRepository } from './auth-sessions.repository.ts';
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

async function issueAccessToken(user: any): Promise<string> {
  const session = TokenService.generateAccessToken({
    userId: user.id,
    uid: user.uid,
    loginName: user.loginName,
    email: user.email || undefined,
    name: user.name,
    role: normalizeUserRole(user.role),
    status: user.status as 'ACTIVE' | 'INACTIVE',
    department: user.department,
  });
  await AuthSessionsRepository.create(user.id, session.jti, session.expiresAt);
  return session.token;
}

export class AuthService {
  public static async getOwnAvatar(uid: string) {
    const user = await AuthRepository.findByUid(uid);
    if (!user || user.status !== 'ACTIVE') throw new Error('CONTA_INATIVA');
    return user.avatarUrl || null;
  }

  public static async updateOwnAvatar(uid: string, avatarUrl: unknown) {
    if (avatarUrl !== null && typeof avatarUrl !== 'string') throw new Error('FOTO_INVALIDA');
    if (typeof avatarUrl === 'string') {
      const match = avatarUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) throw new Error('FOTO_INVALIDA');
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2]) throw new Error('FOTO_INVALIDA');
      const validSignature = match[1] === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
        : match[1] === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!validSignature) throw new Error('FOTO_INVALIDA');
    }
    const updated = await AuthRepository.updateAvatarUrl(uid, avatarUrl);
    if (!updated) throw new Error('CONTA_INATIVA');
    return updated.avatarUrl;
  }

  public static async changeOwnPassword(uid: string, currentPassword: string, newPassword: string, currentTokenId: string, ipAddress?: string) {
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
    await AuthSessionsRepository.revokeOtherSessions(user.id, currentTokenId);
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
    const accessToken = await issueAccessToken(user);
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

    return { user: publicUser(user), accessToken };
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

    const accessToken = await issueAccessToken(matchedUser);
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

    return { user: publicUser(matchedUser), accessToken };
  }
}

