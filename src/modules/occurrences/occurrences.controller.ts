import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { streamPrivateFile } from '../../lib/private-storage.ts';
import {
  ALL_ACCEPTED_STATUS_INPUTS,
  OCCURRENCE_SECTORS,
  OCCURRENCE_TYPES,
} from './occurrence-engine.ts';
import {
  OccurrenceForbiddenError,
  OccurrenceInputError,
  OccurrenceNotFoundError,
  OccurrencesService,
  type OccurrenceActor,
} from './occurrences.service.ts';

const queryText = (value: unknown, maxLength = 120): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;

function actor(req: AuthenticatedRequest): OccurrenceActor {
  const user = req.user!;
  return {
    id: user.userId,
    uid: user.uid,
    name: user.name,
    email: user.email,
    loginName: user.loginName,
    role: user.role,
  };
}

function respondError(res: Response, error: unknown) {
  if (error instanceof OccurrenceForbiddenError) return res.status(403).json({ error: error.message });
  if (error instanceof OccurrenceNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof OccurrenceInputError) return res.status(400).json({ error: error.message });
  if (error instanceof Error && /é obrigatório|deve ter até|ao menos 2 caracteres|Identificador.*inválido/i.test(error.message)) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Occurrence request failed:', error);
  return res.status(500).json({ error: 'Não foi possível processar a ocorrência agora.' });
}

export class OccurrencesController {
  private static parseListFilters(req: AuthenticatedRequest) {
    const status = queryText(req.query.status, 30)?.toUpperCase();
    if (status && !(ALL_ACCEPTED_STATUS_INPUTS as readonly string[]).includes(status)) {
      throw new OccurrenceInputError('Situação de ocorrência inválida.');
    }
    const sector = queryText(req.query.sector, 20)?.toUpperCase();
    if (sector && !(OCCURRENCE_SECTORS as readonly string[]).includes(sector)) {
      throw new OccurrenceInputError('Setor inválido.');
    }
    const type = queryText(req.query.type, 30)?.toUpperCase();
    if (type && !(OCCURRENCE_TYPES as readonly string[]).includes(type)) {
      throw new OccurrenceInputError('Tipo de ocorrência inválido.');
    }
    const rawAssigneeId = queryText(req.query.assigneeId, 20);
    const assigneeId = rawAssigneeId ? Number(rawAssigneeId) : undefined;
    if (rawAssigneeId && (!Number.isSafeInteger(assigneeId) || assigneeId! < 1)) {
      throw new OccurrenceInputError('Responsável inválido.');
    }
    const from = queryText(req.query.from, 10);
    const to = queryText(req.query.to, 10);
    const validDate = (value?: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));
    if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
      throw new OccurrenceInputError('Período de consulta inválido.');
    }
    return {
      search: queryText(req.query.search),
      numeroOp: queryText(req.query.numeroOp, 80),
      numeroPv: queryText(req.query.numeroPv, 80),
      status,
      type,
      sector,
      assigneeId,
      occurrenceType: queryText(req.query.occurrenceType, 80),
      from,
      to,
    };
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const page = Math.max(1, Math.min(10000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
      const pageSize = Math.max(1, Math.min(50, Number.parseInt(String(req.query.pageSize || '10'), 10) || 10));
      const filters = OccurrencesController.parseListFilters(req);
      const result = await OccurrencesService.list({ ...filters, page, pageSize });
      return res.json(result);
    } catch (error) { return respondError(res, error); }
  }

  static async exportCsv(req: AuthenticatedRequest, res: Response) {
    try {
      const filters = OccurrencesController.parseListFilters(req);
      const csv = await OccurrencesService.exportCsv(filters);
      const filename = `nexus_ocorrencias_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (error) { return respondError(res, error); }
  }

  static async importPreview(req: AuthenticatedRequest, res: Response) {
    try {
      const preview = await OccurrencesService.previewHistoricalImport(req.body?.content);
      return res.json(preview);
    } catch (error) { return respondError(res, error); }
  }

  static async importConfirm(req: AuthenticatedRequest, res: Response) {
    try {
      const skipDuplicates = req.body?.skipDuplicates !== false;
      const result = await OccurrencesService.confirmHistoricalImport(actor(req), req.body?.content, skipDuplicates, req);
      return res.status(201).json(result);
    } catch (error) { return respondError(res, error); }
  }

  static async listAssignees(_req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.listAssignees()); }
    catch (error) { return respondError(res, error); }
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
    try { return res.status(201).json(await OccurrencesService.create(actor(req), req.body || {}, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async createFromMessage(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json(await OccurrencesService.createFromMessage(actor(req), req.body || {}, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async assign(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.assign(req.params.id, actor(req), req.body || {}, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async listMessages(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.listMessages(req.params.id)); }
    catch (error) { return respondError(res, error); }
  }

  static async addMessage(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json(await OccurrencesService.addMessage(req.params.id, actor(req), req.body?.body ?? req.body?.message, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async addEvent(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json(await OccurrencesService.addEvent(req.params.id, actor(req), req.body?.message, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async complete(req: AuthenticatedRequest, res: Response) {
    try { return res.json(await OccurrencesService.complete(req.params.id, actor(req), req.body || {}, req)); }
    catch (error) { return respondError(res, error); }
  }

  static async changeStatus(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json(await OccurrencesService.changeStatus(
        req.params.id,
        actor(req),
        req.body?.status,
        req.body?.message,
        req.body?.resolutionText ?? req.body?.resolution_text,
        req,
      ));
    } catch (error) { return respondError(res, error); }
  }

  static async uploadImage(req: AuthenticatedRequest, res: Response) {
    try {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(415).json({ error: 'Envie uma imagem PNG, JPEG ou WebP de até 5 MB.' });
      }
      const attachment = await OccurrencesService.uploadImage(
        req.params.id,
        actor(req),
        req.body,
        req.get('content-type'),
        req.query.caption,
        req,
      );
      return res.status(201).json(attachment);
    } catch (error) { return respondError(res, error); }
  }

  static async saveAttachmentDrawing(req: AuthenticatedRequest, res: Response) {
    try {
      const updated = await OccurrencesService.saveAttachmentDrawing(
        req.params.id,
        req.params.attachmentId,
        actor(req),
        req.body?.drawingData,
        req,
      );
      return res.json(updated);
    } catch (error) { return respondError(res, error); }
  }

  static async streamAttachmentFile(req: AuthenticatedRequest, res: Response) {
    try {
      const file = await OccurrencesService.getAttachmentFile(req.params.id, req.params.attachmentId);
      return streamPrivateFile(
        file.path,
        file.mimeType,
        `occurrence-${req.params.id}-attachment-${file.attachmentId}`,
        res,
        () => {
          if (!res.headersSent) res.status(503).json({ error: 'Não foi possível carregar o anexo.' });
          else res.destroy();
        },
      );
    } catch (error) { return respondError(res, error); }
  }
}
