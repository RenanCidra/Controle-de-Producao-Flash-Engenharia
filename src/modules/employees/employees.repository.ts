import { db } from '../../db/index.ts';
import { employees, users } from '../../db/schema.ts';
import { eq, desc, sql, and, ne } from 'drizzle-orm';

export interface CreateEmployeeDTO {
  name: string;
  employeeCode?: string | null;
  department?: string | null;
  status?: string;
  linkedUserId?: number | null;
}

export interface UpdateEmployeeDTO {
  name?: string;
  employeeCode?: string | null;
  department?: string | null;
  status?: string;
  linkedUserId?: number | null;
}

export class EmployeesRepository {
  public static async count(): Promise<number> {
    try {
      const [res] = await db.select({ count: sql<number>`count(*)` }).from(employees);
      return Number(res?.count || 0);
    } catch (error) {
      console.error('Error counting employees:', error);
      return 0;
    }
  }

  public static async findAll() {
    try {
      await this.ensureSeed();
      const records = await db
        .select({
          id: employees.id,
          organizationId: employees.organizationId,
          employeeCode: employees.employeeCode,
          name: employees.name,
          department: employees.department,
          status: employees.status,
          createdAt: employees.createdAt,
          updatedAt: employees.updatedAt,
          linkedUserId: users.id,
          linkedUserUid: users.uid,
          linkedUserLogin: users.loginName,
          linkedUserRole: users.role,
          linkedUserAvatar: users.avatarUrl,
        })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(desc(employees.createdAt));

      return records;
    } catch (error) {
      console.error('Database query error in EmployeesRepository.findAll:', error);
      throw new Error('Falha ao consultar colaboradores.', { cause: error });
    }
  }

  public static async findById(id: number) {
    try {
      const records = await db
        .select({
          id: employees.id,
          organizationId: employees.organizationId,
          employeeCode: employees.employeeCode,
          name: employees.name,
          department: employees.department,
          status: employees.status,
          createdAt: employees.createdAt,
          updatedAt: employees.updatedAt,
          linkedUserId: users.id,
          linkedUserUid: users.uid,
          linkedUserLogin: users.loginName,
          linkedUserRole: users.role,
          linkedUserAvatar: users.avatarUrl,
        })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(eq(employees.id, id));

      return records[0] || null;
    } catch (error) {
      console.error('Database query error in EmployeesRepository.findById:', error);
      throw new Error('Falha ao consultar colaborador por ID.', { cause: error });
    }
  }

  public static async findByCode(code: string, excludeId?: number) {
    try {
      if (!code) return null;
      const condition = excludeId
        ? and(eq(employees.employeeCode, code), ne(employees.id, excludeId))
        : eq(employees.employeeCode, code);

      const records = await db.select().from(employees).where(condition);
      return records[0] || null;
    } catch (error) {
      console.error('Database query error in EmployeesRepository.findByCode:', error);
      return null;
    }
  }

  public static async create(data: CreateEmployeeDTO) {
    try {
      const [newEmployee] = await db
        .insert(employees)
        .values({
          name: data.name,
          employeeCode: data.employeeCode || null,
          department: data.department || null,
          status: data.status || 'ACTIVE',
          updatedAt: new Date(),
        })
        .returning();

      if (data.linkedUserId && newEmployee?.id) {
        await db
          .update(users)
          .set({ employeeId: newEmployee.id })
          .where(eq(users.id, data.linkedUserId));
      }

      return this.findById(newEmployee.id);
    } catch (error) {
      console.error('Database query error in EmployeesRepository.create:', error);
      throw new Error('Falha ao criar colaborador no banco de dados.', { cause: error });
    }
  }

  public static async update(id: number, data: UpdateEmployeeDTO) {
    try {
      const updatePayload: Record<string, any> = { updatedAt: new Date() };
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.employeeCode !== undefined) updatePayload.employeeCode = data.employeeCode || null;
      if (data.department !== undefined) updatePayload.department = data.department || null;
      if (data.status !== undefined) updatePayload.status = data.status;

      await db.update(employees).set(updatePayload).where(eq(employees.id, id));

      if (data.linkedUserId !== undefined) {
        // Clear previous links
        await db.update(users).set({ employeeId: null }).where(eq(users.employeeId, id));
        if (data.linkedUserId) {
          await db.update(users).set({ employeeId: id }).where(eq(users.id, data.linkedUserId));
        }
      }

      return this.findById(id);
    } catch (error) {
      console.error('Database query error in EmployeesRepository.update:', error);
      throw new Error('Falha ao atualizar colaborador.', { cause: error });
    }
  }

  public static async delete(id: number) {
    try {
      // Unlink users first
      await db.update(users).set({ employeeId: null }).where(eq(users.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
      return true;
    } catch (error) {
      console.error('Database query error in EmployeesRepository.delete:', error);
      throw new Error('Falha ao excluir colaborador.', { cause: error });
    }
  }

  public static async getEligibleUsers() {
    try {
      return await db
        .select({
          id: users.id,
          uid: users.uid,
          loginName: users.loginName,
          name: users.name,
          role: users.role,
          employeeId: users.employeeId,
        })
        .from(users)
        .where(eq(users.status, 'ACTIVE'));
    } catch (error) {
      console.error('Error fetching eligible users for employees:', error);
      return [];
    }
  }

  private static async ensureSeed() {
    try {
      const count = await this.count();
      if (count > 0) return;

      const sample = [
        { code: 'OP-101', name: 'Alex Pareira', dept: 'Montagem Final', status: 'ACTIVE', linkLogin: 'alex' },
        { code: 'OP-102', name: 'Carlos Eduardo Silveira', dept: 'Usinagem CNC', status: 'ACTIVE' },
        { code: 'OP-103', name: 'Juliana Rocha Mendes', dept: 'Qualidade e Metrologia', status: 'ACTIVE' },
        { code: 'OP-104', name: 'Marcos Vinicius Santos', dept: 'Solda e Caldeiraria', status: 'ACTIVE' },
        { code: 'OP-105', name: 'Fernanda Lima de Souza', dept: 'Pintura Eletrostática', status: 'ACTIVE' },
        { code: 'OP-106', name: 'Roberto Antunes Dias', dept: 'Logística e Expedição', status: 'ACTIVE' },
        { code: 'OP-107', name: 'Tatiane Oliveira Castro', dept: 'Montagem de Painéis', status: 'ACTIVE' },
        { code: 'OP-108', name: 'Lucas Henrique Prado', dept: 'Usinagem CNC', status: 'ACTIVE' },
        { code: 'OP-109', name: 'Patricia Alencar Diniz', dept: 'Acabamento e Embalagem', status: 'INACTIVE' },
      ];

      for (const item of sample) {
        const [emp] = await db
          .insert(employees)
          .values({
            name: item.name,
            employeeCode: item.code,
            department: item.dept,
            status: item.status,
            updatedAt: new Date(),
          })
          .returning();

        if (item.linkLogin && emp?.id) {
          await db
            .update(users)
            .set({ employeeId: emp.id })
            .where(eq(users.loginName, item.linkLogin));
        }
      }
    } catch (e) {
      console.warn('Seed employees non-fatal warning:', e);
    }
  }
}
