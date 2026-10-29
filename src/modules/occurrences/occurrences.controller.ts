import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { OccurrenceInputError, OccurrenceNotFoundError, OccurrencesService, OCCURRENCE_STATUSES } from './occurrences.service.ts';

const queryText = (value: unknown, maxLength = 120): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;

function actor(req: AuthenticatedRequest) {
  const user = req.user!;
  return { uid: user.uid, name: user.name, email: user.email, loginName: user.loginName };
}

function respondError(res: Response, error: unknown) {
  if (error instanceof OccurrenceNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof OccurrenceInputError) return res.status(400).json({ error: error.message });
  if (error instanceof Error && /é obrigatório|deve ter até|ao menos 2 caracteres|Identificador.*inválido/i.test(error.message)) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Occurrence request failed:', error);
  return res.status(500).json({ error: 'Não foi possível processar a ocorrência agora.' });
}

export class OccurrencesController {
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const page = Math.max(1, Math.min(10000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
      const pageSize = Math.max(1, Math.min(50, Number.parseInt(String(req.query.pageSize || '10'), 10) || 10));
      const status = queryText(req.query.status, 20)?.toUpperCase();
      if (status && !OCCURRENCE_STATUSES.includes(status as typeof OCCURRENCE_STATUSES[number])) {
        return res.status(400).json({ error: 'Situação de ocorrência inválida.' });
      }
      const from = queryText(req.query.from, 10);
      const to = queryText(req.query.to, 10);
      const validDate = (value?: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
      if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
        return res.status(400).json({ error: 'Período de consulta inválido.' });
      }
      const result = await OccurrencesService.list({
        search: queryText(req.query.search), numeroOp: queryText(req.query.numeroOp, 80),
        numeroPv: queryText(req.query.numeroPv, 80), status,
        occurrenceType: queryText(req.query.occurrenceType, 80), from, to, page, pageSize,
      });
      return res.json(result);
    } catch (error) { return respondError(res, error); }
  }

  static async findOrders(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.findOrders(queryText(req.query.search, 100) || '')); }
    catch (error) { return respondError(res, error); }
  }

  static async listForOp(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.listForOp(req.params.numeroOp)); }
    catch (error) { return respondError(res, error); }
  }

  static async detail(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.detail(req.params.id)); }
    catch (error) { return respondError(res, error); }
  }

  static async create(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json(await OccurrencesService.create(actor(req), req.body, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async addEvent(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json(await OccurrencesService.addEvent(req.params.id, actor(req), req.body.message, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async changeStatus(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.changeStatus(req.params.id, actor(req), req.body.status, req.body.message, req)); }
    catch (error) { return respondError(res, error); }
  }
}

