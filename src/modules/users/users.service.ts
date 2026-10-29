import { UsersRepository } from './users.repository.ts';
import { AuthRepository } from '../auth/auth.repository.ts';
import { AuditService } from '../../services/audit.service.ts';
import { USER_ROLES, USER_STATUSES, UserRole, UserStatus } from '../../types/index.ts';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { formatProperName, validateLoginName, validatePassword } from '../auth/credentials.ts';

function sanitizeUser(user: any) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export class UsersService {
  public static async listUsers() {
    return await UsersRepository.findAll();
  }

  public static async createUser(
    actorId: string,
    actorEmail: string,
    data: {
      name: string;
      loginName: string;
      email?: string;
      password: string;
      role: UserRole;
      department?: string;
      customUid?: string;
    }
  ) {
    const formattedName = formatProperName(data.name);
    const loginName = validateLoginName(data.loginName);
    const normalizedEmail = data.email?.toLowerCase().trim() || null;
    const formattedDept = data.department ? formatProperName(data.department) : null;

    let uid: string;
    if (data.customUid && data.customUid.trim()) {
      uid = data.customUid.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (uid.length < 3 || uid.length > 36) {
        throw new Error('O ID próprio deve ter entre 3 e 36 caracteres alfanuméricos.');
      }
      const existingUid = await AuthRepository.findByUid(uid);
      if (existingUid) {
        throw new Error(`O ID próprio "${uid}" já está cadastrado.`);
      }
    } else {
      uid = `usr_${crypto.randomUUID()}`;
    }

    const existingLogin = await AuthRepository.findByExactLoginName(loginName);
    if (existingLogin) {
      throw new Error('Este usuário de acesso já está em uso.');
    }

    if (normalizedEmail) {
      const existingEmail = await AuthRepository.findByEmail(normalizedEmail);
      if (existingEmail) {
        throw new Error('Este e-mail já está em uso.');
      }
    }

    validatePassword(data.password);
    if (!USER_ROLES.includes(data.role)) {
      throw new Error('Perfil de acesso inválido.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const created = await AuthRepository.createUser({
      uid,
      loginName,
      email: normalizedEmail,
      name: formattedName,
      passwordHash,
      role: data.role,
      department: formattedDept || undefined,
    });

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'USER',
      entityId: String(created.id),
      details: {
        uid: created.uid,
        loginName: created.loginName,
        role: created.role,
        department: created.department,
      },
    });

    return sanitizeUser(created);
  }

  public static async updateUser(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      name?: string;
      email?: string | null;
      role?: UserRole;
      status?: UserStatus;
      department?: string | null;
    }
  ) {
    if (data.role !== undefined && !USER_ROLES.includes(data.role)) {
      throw new Error('Perfil de acesso inválido.');
    }
    if (data.status !== undefined && !USER_STATUSES.includes(data.status)) {
      throw new Error('Estado da conta inválido.');
    }

    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new Error('Conta de acesso não encontrada.');
    }

    const normalizedEmail = data.email !== undefined
      ? (data.email ? data.email.toLowerCase().trim() : null)
      : undefined;

    if (normalizedEmail) {
      const existingByEmail = await AuthRepository.findByEmail(normalizedEmail);
      if (existingByEmail && existingByEmail.id !== id) {
        throw new Error('Este e-mail já está em uso por outra conta.');
      }
    }

    const isRemovingActiveAdmin = user.role === 'ADMIN'
      && ((data.role !== undefined && data.role !== 'ADMIN') || data.status === 'INACTIVE');
    if (isRemovingActiveAdmin && (await UsersRepository.countActiveAdmins()) <= 1) {
      throw new Error('Não é possível desativar ou rebaixar a última conta administradora ativa.');
    }

    const updatePayload: {
      name?: string;
      email?: string | null;
      role?: UserRole;
      status?: UserStatus;
      department?: string | null;
    } = {};

    if (data.name !== undefined) {
      updatePayload.name = formatProperName(data.name);
    }
    if (normalizedEmail !== undefined) {
      updatePayload.email = normalizedEmail;
    }
    if (data.role !== undefined) {
      updatePayload.role = data.role;
    }
    if (data.status !== undefined) {
      updatePayload.status = data.status;
    }
    if (data.department !== undefined) {
      updatePayload.department = data.department ? formatProperName(data.department) : null;
    }

    const updated = await UsersRepository.update(id, updatePayload);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'USER',
      entityId: String(id),
      details: { previous: user, updated: data },
    });

    return sanitizeUser(updated);
  }

  public static async resetPassword(
    actorId: string,
    actorEmail: string,
    targetId: number,
    newPassword: string,
  ) {
    validatePassword(newPassword);

    const user = await UsersRepository.findById(targetId);
    if (!user) {
      throw new Error('Conta de acesso não encontrada.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await UsersRepository.updatePassword(targetId, passwordHash);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'USER',
      entityId: String(targetId),
      details: {
        action: 'PASSWORD_RESET',
        targetLoginName: user.loginName,
        targetName: user.name,
      },
    });

    return {
      success: true,
      message: `Senha da conta "${user.loginName}" redefinida com sucesso.`,
    };
  }

  public static async deleteUser(actorId: string, actorEmail: string, id: number) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new Error('Conta de acesso não encontrada.');
    }

    if (user.role === 'ADMIN' && (await UsersRepository.countActiveAdmins()) <= 1) {
      throw new Error('Não é possível excluir a última conta administradora ativa.');
    }

    await UsersRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'USER',
      entityId: String(id),
      details: { deletedLoginName: user.loginName, deletedEmail: user.email, name: user.name },
    });

    return { success: true, message: 'Conta de acesso excluída com sucesso.' };
  }
}
