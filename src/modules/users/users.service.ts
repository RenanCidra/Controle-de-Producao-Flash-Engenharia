import { UsersRepository } from './users.repository.ts';
import { AuthRepository } from '../auth/auth.repository.ts';
import { AuditService } from '../../services/audit.service.ts';
import { USER_ROLES, USER_STATUSES, UserRole, UserStatus } from '../../types/index.ts';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { validateLoginName, validatePassword } from '../auth/credentials.ts';

function publicAccount(user: any) {
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
    }
  ) {
    const loginName = validateLoginName(data.loginName);
    const existing = await AuthRepository.findByLoginName(loginName);
    if (existing) {
      throw new Error('Este usuário de acesso já está em uso.');
    }
    if (data.email && await AuthRepository.findByEmail(data.email)) {
      throw new Error('E-mail já está em uso.');
    }

    validatePassword(data.password);
    if (!USER_ROLES.includes(data.role)) {
      throw new Error('Perfil de acesso inválido.');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const uid = 'usr_' + crypto.randomUUID();
    const created = await AuthRepository.createUser({
      uid,
      loginName,
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role,
      department: data.department,
    });

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'USER',
      entityId: String(created.id),
      details: { loginName: created.loginName, role: created.role, department: created.department },
    });

    return publicAccount(created);
  }

  public static async updateUser(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      name?: string;
      role?: UserRole;
      status?: UserStatus;
      department?: string;
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

    const isRemovingActiveAdmin = user.role === 'ADMIN'
      && ((data.role !== undefined && data.role !== 'ADMIN') || data.status === 'INACTIVE');
    if (isRemovingActiveAdmin && await UsersRepository.countActiveAdmins() <= 1) {
      throw new Error('Não é possível desativar ou rebaixar a última conta administradora ativa.');
    }

    const updated = await UsersRepository.update(id, data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'USER',
      entityId: String(id),
      details: { previous: user, updated: data },
    });

    return publicAccount(updated);
  }

  public static async deleteUser(actorId: string, actorEmail: string, id: number) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new Error('Conta de acesso não encontrada.');
    }

    if (user.role === 'ADMIN' && await UsersRepository.countActiveAdmins() <= 1) {
      throw new Error('Não é possível excluir a última conta administradora.');
    }

    await UsersRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'USER',
      entityId: String(id),
      details: { deletedEmail: user.email, name: user.name },
    });

    return { success: true };
  }
}
