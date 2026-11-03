import { AuditService } from '../../services/audit.service.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { FeedbackRepository } from './feedback.repository.ts';

export const FEEDBACK_CATEGORIES = ['IDEA', 'BUG', 'QUESTION', 'OTHER'] as const;
export const FEEDBACK_STATUSES = ['NEW', 'IN_REVIEW', 'PLANNED', 'COMPLETED', 'DECLINED'] as const;
export class FeedbackInputError extends Error {}
export class FeedbackNotFoundError extends Error {}

const text = (value: unknown, label: string, max: number, optional = false): string | null => {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim()) throw new FeedbackInputError(`${label} é obrigatório.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new FeedbackInputError(`${label} deve ter até ${max} caracteres.`);
  return normalized;
};

export class FeedbackService {
  static list() { return FeedbackRepository.list(); }

  static async create(actor: { uid: string; name: string; email?: string | null; loginName: string }, raw: Record<string, unknown>, req: AuthenticatedRequest) {
    const category = text(raw.category, 'Categoria', 20)!;
    if (!FEEDBACK_CATEGORIES.includes(category as typeof FEEDBACK_CATEGORIES[number])) throw new FeedbackInputError('Categoria inválida.');
    const created = await FeedbackRepository.create({
      category,
      title: text(raw.title, 'Título', 120)!,
      description: text(raw.description, 'Descrição', 3000)!,
      sourceScreen: text(raw.sourceScreen, 'Tela de origem', 120, true),
      submitterUid: actor.uid,
      submitterName: actor.name,
    });
    await AuditService.record({
      userId: actor.uid, userEmail: actor.email || actor.loginName,
      action: 'CREATE', entity: 'FEEDBACK_SUBMISSION', entityId: String(created.id),
      details: { category, status: created.status },
    }, req);
    return created;
  }

  static async updateStatus(rawId: string, statusRaw: unknown, actor: { uid: string; email?: string | null; loginName: string }, req: AuthenticatedRequest) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) throw new FeedbackInputError('Identificador de sugestão inválido.');
    const status = text(statusRaw, 'Situação', 20)!;
    if (!FEEDBACK_STATUSES.includes(status as typeof FEEDBACK_STATUSES[number])) throw new FeedbackInputError('Situação inválida.');
    const updated = await FeedbackRepository.updateStatus(id, status);
    if (!updated) throw new FeedbackNotFoundError('Sugestão não encontrada.');
    await AuditService.record({
      userId: actor.uid, userEmail: actor.email || actor.loginName,
      action: 'UPDATE', entity: 'FEEDBACK_SUBMISSION', entityId: String(id), details: { status },
    }, req);
    return updated;
  }
}
