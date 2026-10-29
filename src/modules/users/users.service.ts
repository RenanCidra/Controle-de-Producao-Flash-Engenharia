import { UsersRepository } from './users.repository.ts';
import { AuthRepository } from '../auth/auth.repository.ts';
import { AuditService } from '../../services/audit.service.ts';
import { UserRole, UserStatus } from '../../types/index.ts';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class UsersService {
  public static async listUsers() {
    return await UsersRepository.findAll();
  }

  public static async createUser(
    actorId: string,
    actorEmail: string,
    data: {
      name: string;
      email: string;
      password?: string;
      role: UserRole;
      department?: string;
    }
  ) {
    const existing = await AuthRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('E-mail já está em uso.');
    }

    let passwordHash: string | undefined = undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const uid = 'usr_' + crypto.randomUUID();
    const created = await AuthRepository.createUser({
      uid,
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role as any,
      department: data.department,
    });

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'USER',
      entityId: String(created.id),
      details: { email: created.email, role: created.role, department: created.department },
    });

    return created;
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
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new Error('Colaborador não encontrado.');
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

    return updated;
  }

  public static async deleteUser(actorId: string, actorEmail: string, id: number) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new Error('Colaborador não encontrado.');
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
