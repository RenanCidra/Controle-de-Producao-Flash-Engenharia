import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { EmployeesService } from './employees.service.ts';

export class EmployeesController {
  public static async list(_req: AuthenticatedRequest, res: Response) {
    try {
      const data = await EmployeesService.listEmployees();
      res.json(data);
    } catch (error: any) {
      console.error('Failed to list employees:', error);
      res.status(500).json({ error: error.message || 'Erro ao consultar colaboradores.' });
    }
  }

  public static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const id = Number(req.params.id);
      const employee = await EmployeesService.getEmployee(id);
      res.json(employee);
    } catch (error: any) {
      res.status(error.message === 'Colaborador não encontrado.' ? 404 : 400).json({ error: error.message });
    }
  }

  public static async getEligibleUsers(_req: AuthenticatedRequest, res: Response) {
    try {
      const users = await EmployeesService.getEligibleUsers();
      res.json(users);
    } catch (error: any) {
      console.error('Failed to get eligible users:', error);
      res.status(500).json({ error: 'Erro ao consultar usuários elegíveis.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const actor = { userId: req.user.userId, uid: req.user.uid, name: req.user.name };
      const employee = await EmployeesService.createEmployee(req.body, actor);
      res.status(201).json(employee);
    } catch (error: any) {
      console.error('Failed to create employee:', error);
      res.status(400).json({ error: error.message || 'Erro ao cadastrar colaborador.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const id = Number(req.params.id);
      const actor = { userId: req.user.userId, uid: req.user.uid, name: req.user.name };
      const employee = await EmployeesService.updateEmployee(id, req.body, actor);
      res.json(employee);
    } catch (error: any) {
      console.error('Failed to update employee:', error);
      res.status(400).json({ error: error.message || 'Erro ao atualizar colaborador.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const id = Number(req.params.id);
      const actor = { userId: req.user.userId, uid: req.user.uid, name: req.user.name };
      const result = await EmployeesService.deleteEmployee(id, actor);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to delete employee:', error);
      res.status(400).json({ error: error.message || 'Erro ao remover colaborador.' });
    }
  }
}
