import { AuditService } from '../../services/audit.service.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { OccurrencesRepository, type OccurrenceFilters } from './occurrences.repository.ts';

export const OCCURRENCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;

export class OccurrenceInputError extends Error {}
export class OccurrenceNotFoundError extends Error {}

export class OccurrencesService {
  static list(filters: OccurrenceFilters) {
    return OccurrencesRepository.list(filters);
  }

  static async listForOp(numeroOp: string) {
    const normalized = this.requiredText(numeroOp, 'Número da OP', 80);
    return OccurrencesRepository.listForOp(normalized);
  }

  static async findOrders(search: string) {
    const normalized = this.requiredText(search, 'Busca de OP', 100);
    if (normalized.length < 2) throw new Error('Informe ao menos 2 caracteres para buscar uma OP.');
    return OccurrencesRepository.findOrders(normalized);
  }

  static async detail(rawId: string) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Identificador de ocorrência inválido.');
    const detail = await OccurrencesRepository.findDetail(id);
    if (!detail) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    return detail;
  }

  static async create(
    actor: { uid: string; name: string; email?: string | null; loginName: string },
    input: { numeroOp: unknown; occurrenceType: unknown; description: unknown; operation?: unknown; workstation?: unknown; immediateAction?: unknown },
    req: AuthenticatedRequest,
  ) {
    const numeroOp = this.requiredText(input.numeroOp, 'Número da OP', 80);
    const occurrenceType = this.requiredText(input.occurrenceType, 'Tipo/assunto', 80);
    const description = this.requiredText(input.description, 'Descrição', 1500);
    const operation = this.optionalText(input.operation, 'Operação', 120);
    const workstation = this.optionalText(input.workstation, 'Posto ou recurso', 120);
    const immediateAction = this.optionalText(input.immediateAction, 'Ação imediata', 1000);
    try {
      const created = await OccurrencesRepository.create({
        numeroOp, occurrenceType, description, operation, workstation, immediateAction,
        authorUid: actor.uid, authorName: actor.name,
      });
      await AuditService.record({
        userId: actor.uid, userEmail: actor.email || actor.loginName,
        action: 'CREATE', entity: 'PRODUCTION_OCCURRENCE', entityId: String(created.id),
        details: { numeroOp, occurrenceType, status: created.status },
      }, req);
      return created;
    } catch (error: any) {
      if (error?.code === '23503') throw new OccurrenceInputError('A OP informada não existe no espelho atual do Protheus. Confirme o número e tente novamente.');
      throw error;
    }
  }

  static async addEvent(idRaw: string, actor: { uid: string; name: string }, messageRaw: unknown, req: AuthenticatedRequest) {
    const id = this.parseId(idRaw);
    const message = this.requiredText(messageRaw, 'Atualização', 1500);
    const result = await OccurrencesRepository.addEvent(id, { message, authorUid: actor.uid, authorName: actor.name });
    if (!result) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    if (result.closed) throw new OccurrenceInputError('A ocorrência está encerrada. Um supervisor precisa reabri-la antes de receber novas atualizações.');
    await AuditService.record({
      userId: actor.uid, action: 'UPDATE', entity: 'PRODUCTION_OCCURRENCE', entityId: String(id),
      details: { event: 'NOTE_ADDED' },
    }, req);
    return result.event;
  }

  static async changeStatus(
    idRaw: string,
    actor: { uid: string; name: string; email?: string | null; loginName: string },
    statusRaw: unknown,
    messageRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const status = this.requiredText(statusRaw, 'Situação', 30);
    if (!OCCURRENCE_STATUSES.includes(status as typeof OCCURRENCE_STATUSES[number])) {
      throw new OccurrenceInputError('Situação inválida. Selecione aberta, em tratamento ou encerrada.');
    }
    const message = this.requiredText(messageRaw, 'Motivo da atualização', 1500);
    const updated = await OccurrencesRepository.changeStatus(id, status, message, actor.uid, actor.name);
    if (!updated) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    await AuditService.record({
      userId: actor.uid, userEmail: actor.email || actor.loginName,
      action: 'UPDATE', entity: 'PRODUCTION_OCCURRENCE', entityId: String(id),
      details: { status },
    }, req);
    return updated;
  }

  private static parseId(value: string) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new OccurrenceInputError('Identificador de ocorrência inválido.');
    return id;
  }

  private static requiredText(value: unknown, label: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim()) throw new OccurrenceInputError(`${label} é obrigatório.`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new OccurrenceInputError(`${label} deve ter até ${maxLength} caracteres.`);
    return normalized;
  }

  private static optionalText(value: unknown, label: string, maxLength: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredText(value, label, maxLength);
  }
}

