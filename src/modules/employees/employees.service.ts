import { EmployeesRepository, type CreateEmployeeDTO, type UpdateEmployeeDTO } from './employees.repository.ts';
import { AuditService } from '../../services/audit.service.ts';
import { formatProperName } from '../auth/credentials.ts';

export class EmployeesService {
  public static async listEmployees() {
    const list = await EmployeesRepository.findAll();
    const total = list.length;
    const active = list.filter((e) => e.status === 'ACTIVE').length;
    const inactive = total - active;
    const linkedAccounts = list.filter((e) => Boolean(e.linkedUserId)).length;
    const uniqueDepartments = Array.from(new Set(list.map((e) => e.department).filter(Boolean))) as string[];

    return {
      employees: list,
      metrics: {
        total,
        active,
        inactive,
        linkedAccounts,
        unlinkedOperators: total - linkedAccounts,
        departmentsCount: uniqueDepartments.length,
        departments: uniqueDepartments,
      },
    };
  }

  public static async getEmployee(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Identificador de colaborador inválido.');
    }
    const emp = await EmployeesRepository.findById(id);
    if (!emp) {
      throw new Error('Colaborador não encontrado.');
    }
    return emp;
  }

  public static async getEligibleUsers() {
    return EmployeesRepository.getEligibleUsers();
  }

  public static async createEmployee(
    data: { name: string; employeeCode?: string; department?: string; status?: string; linkedUserId?: number },
    actor: { userId?: number; uid?: string; name: string }
  ) {
    const name = data.name?.trim();
    if (!name || name.length < 3) {
      throw new Error('O nome do colaborador deve conter pelo menos 3 caracteres.');
    }

    const employeeCode = data.employeeCode?.trim().toUpperCase() || null;
    if (employeeCode) {
      const existing = await EmployeesRepository.findByCode(employeeCode);
      if (existing) {
        throw new Error(`A matrícula/código "${employeeCode}" já está em uso por outro colaborador.`);
      }
    }

    const formattedName = formatProperName(name);
    const department = data.department?.trim() ? formatProperName(data.department) : null;
    const status = data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const created = await EmployeesRepository.create({
      name: formattedName,
      employeeCode,
      department,
      status,
      linkedUserId: data.linkedUserId ? Number(data.linkedUserId) : null,
    });

    if (created) {
      await AuditService.record({
        userId: actor.uid || (actor.userId ? String(actor.userId) : null),
        userEmail: actor.name,
        action: 'CREATE',
        entity: 'EMPLOYEE',
        entityId: String(created.id),
        details: {
          name: created.name,
          employeeCode: created.employeeCode,
          department: created.department,
          status: created.status,
          linkedUserId: created.linkedUserId,
        },
      });
    }

    return created;
  }

  public static async updateEmployee(
    id: number,
    data: { name?: string; employeeCode?: string; department?: string; status?: string; linkedUserId?: number | null },
    actor: { userId?: number; uid?: string; name: string }
  ) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Identificador de colaborador inválido.');
    }

    const existing = await EmployeesRepository.findById(id);
    if (!existing) {
      throw new Error('Colaborador não encontrado.');
    }

    const updatePayload: UpdateEmployeeDTO = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || name.length < 3) {
        throw new Error('O nome do colaborador deve conter pelo menos 3 caracteres.');
      }
      updatePayload.name = formatProperName(name);
    }

    if (data.employeeCode !== undefined) {
      const code = data.employeeCode?.trim().toUpperCase() || null;
      if (code) {
        const duplicate = await EmployeesRepository.findByCode(code, id);
        if (duplicate) {
          throw new Error(`A matrícula/código "${code}" já está em uso por outro colaborador.`);
        }
      }
      updatePayload.employeeCode = code;
    }

    if (data.department !== undefined) {
      updatePayload.department = data.department?.trim() ? formatProperName(data.department) : null;
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    }

    if (data.linkedUserId !== undefined) {
      updatePayload.linkedUserId = data.linkedUserId ? Number(data.linkedUserId) : null;
    }

    const updated = await EmployeesRepository.update(id, updatePayload);

    if (updated) {
      await AuditService.record({
        userId: actor.uid || (actor.userId ? String(actor.userId) : null),
        userEmail: actor.name,
        action: 'UPDATE',
        entity: 'EMPLOYEE',
        entityId: String(id),
        details: {
          name: updated.name,
          employeeCode: updated.employeeCode,
          department: updated.department,
          status: updated.status,
          linkedUserId: updated.linkedUserId,
        },
      });
    }

    return updated;
  }

  public static async deleteEmployee(id: number, actor: { userId?: number; uid?: string; name: string }) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Identificador de colaborador inválido.');
    }

    const existing = await EmployeesRepository.findById(id);
    if (!existing) {
      throw new Error('Colaborador não encontrado.');
    }

    await EmployeesRepository.delete(id);

    await AuditService.record({
      userId: actor.uid || (actor.userId ? String(actor.userId) : null),
      userEmail: actor.name,
      action: 'DELETE',
      entity: 'EMPLOYEE',
      entityId: String(id),
      details: {
        name: existing.name,
        employeeCode: existing.employeeCode,
      },
    });

    return { success: true };
  }
}
