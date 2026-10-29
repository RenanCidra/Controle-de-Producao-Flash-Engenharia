import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthRepository } from './auth.repository.ts';
import { TokenService } from '../../services/token.service.ts';
import { AuditService } from '../../services/audit.service.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';

export class AuthService {
  public static async register(data: {
    email: string;
    password?: string;
    name: string;
    role?: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
    department?: string;
    ipAddress?: string;
  }) {
    const existing = await AuthRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('Já existe um usuário cadastrado com este e-mail.');
    }

    let passwordHash: string | undefined = undefined;
    if (data.password) {
      if (data.password.length < 6) {
        throw new Error('A senha deve possuir no mínimo 6 caracteres.');
      }
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const uid = 'usr_' + crypto.randomUUID();
    const newUser = await AuthRepository.createUser({
      uid,
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role || 'ADMIN',
      department: data.department,
    });

    const accessToken = TokenService.generateAccessToken({
      userId: newUser.id,
      uid: newUser.uid,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role as any,
      status: newUser.status as any,
      department: newUser.department,
    });

    const refreshToken = TokenService.generateRefreshToken({
      userId: newUser.id,
      uid: newUser.uid,
      email: newUser.email,
    });

    await AuditService.record({
      userId: newUser.uid,
      userEmail: newUser.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(newUser.id),
      details: { message: 'Conta de usuário criada com sucesso via JWT nativo' },
      ipAddress: data.ipAddress,
      status: 'SUCCESS',
    });

    return {
      user: {
        id: newUser.id,
        uid: newUser.uid,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        department: newUser.department,
      },
      accessToken,
      refreshToken,
    };
  }

  public static async login(data: { email: string; password?: string; ipAddress?: string }) {
    const user = await AuthRepository.findByEmail(data.email);
    if (!user) {
      throw new Error('Credenciais inválidas: e-mail ou senha incorretos.');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('Esta conta está inativa ou suspensa. Contate o administrador do ERP.');
    }

    if (!user.passwordHash || !data.password) {
      throw new Error('Esta conta requer autenticação federada (Google/Firebase) ou redefinição de senha.');
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      await AuditService.record({
        userId: user.uid,
        userEmail: user.email,
        action: 'LOGIN',
        entity: 'AUTH',
        entityId: String(user.id),
        details: { message: 'Tentativa de login com senha incorreta' },
        ipAddress: data.ipAddress,
        status: 'FAILURE',
      });
      throw new Error('Credenciais inválidas: e-mail ou senha incorretos.');
    }

    await AuthRepository.updateLastLogin(user.id);

    const accessToken = TokenService.generateAccessToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: user.role as any,
      status: user.status as any,
      department: user.department,
    });

    const refreshToken = TokenService.generateRefreshToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
    });

    await AuditService.record({
      userId: user.uid,
      userEmail: user.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(user.id),
      details: { message: 'Autenticação bem-sucedida via JWT' },
      ipAddress: data.ipAddress,
      status: 'SUCCESS',
    });

    return {
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      },
      accessToken,
      refreshToken,
    };
  }

  public static async syncFirebaseUser(firebaseIdToken: string, ipAddress?: string) {
    const decoded = await adminAuth.verifyIdToken(firebaseIdToken);
    const email = decoded.email || `${decoded.uid}@google.auth`;
    const name = decoded.name || email.split('@')[0];

    let user = await AuthRepository.findByUid(decoded.uid);
    if (!user) {
      user = await AuthRepository.findByEmail(email);
    }

    if (!user) {
      user = await AuthRepository.createUser({
        uid: decoded.uid,
        email,
        name,
        role: 'ADMIN', // First user or admin
      });
    } else {
      await AuthRepository.updateLastLogin(user.id);
    }

    const accessToken = TokenService.generateAccessToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: user.role as any,
      status: user.status as any,
      department: user.department,
    });

    const refreshToken = TokenService.generateRefreshToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
    });

    await AuditService.record({
      userId: user.uid,
      userEmail: user.email,
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: String(user.id),
      details: { message: 'Sincronização e login com Google/Firebase completado' },
      ipAddress,
      status: 'SUCCESS',
    });

    return {
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      },
      accessToken,
      refreshToken,
    };
  }
}
