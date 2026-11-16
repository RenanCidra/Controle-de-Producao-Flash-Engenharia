import { AuditService } from '../../services/audit.service.ts';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { hasPermission } from '../../middleware/access-control.ts';
import { randomUUID } from 'node:crypto';
import {
  MediaValidationError,
  copyPrivateFile,
  deletePrivateFile,
  savePrivateFile,
  validateDrawingData,
  validateImageUpload,
} from '../../lib/private-storage.ts';
import {
  ALL_ACCEPTED_STATUS_INPUTS,
  OCCURRENCE_PRIORITIES,
  OCCURRENCE_SECTORS,
  OCCURRENCE_TYPE_LABELS,
  extractOccurrenceFieldsFromText,
  getRoutingRule,
  normalizeOccurrenceStatus,
  normalizeOccurrenceType,
  type OccurrencePriority,
  type OccurrenceSector,
  type OccurrenceType,
} from './occurrence-engine.ts';
import { OccurrencesRepository, OccurrenceValidationError, type OccurrenceFilters } from './occurrences.repository.ts';
import { NotificationsService } from '../notifications/notifications.service.ts';
import {
  buildOccurrencesCsv,
  parseOccurrenceImportText,
  validateImportRows,
  type NormalizedOccurrenceImportRow,
} from './occurrence-import.ts';

export { ALL_ACCEPTED_STATUS_INPUTS, OCCURRENCE_STATUSES } from './occurrence-engine.ts';

export class OccurrenceInputError extends Error {}
export class OccurrenceNotFoundError extends Error {}
export class OccurrenceForbiddenError extends Error {}

export interface OccurrenceActor {
  id: number;
  uid: string;
  name: string;
  email?: string | null;
  loginName: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR';
}

function mapRepoError(error: unknown): never {
  if (error instanceof OccurrenceValidationError) {
    if (error.message === 'PERMISSAO_NEGADA_STATUS') {
      throw new OccurrenceForbiddenError('Apenas supervisores ou administradores podem cancelar ou reabrir ocorrências.');
    }
    throw new OccurrenceInputError(error.message);
  }
  throw error;
}

export class OccurrencesService {
  static list(filters: OccurrenceFilters) {
    return OccurrencesRepository.list(filters);
  }

  static getAnalyticsStats(filters: {
    from?: string;
    to?: string;
    sector?: OccurrenceSector;
    type?: OccurrenceType;
  }) {
    return OccurrencesRepository.getAnalyticsStats(filters);
  }

  static async exportCsv(filters: Omit<OccurrenceFilters, 'page' | 'pageSize'>): Promise<string> {
    const rows = await OccurrencesRepository.exportRows(filters, 5000);
    return buildOccurrencesCsv(rows);
  }

  static async previewHistoricalImport(rawContent: unknown) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new OccurrenceInputError('Envie ou cole o conteúdo CSV/Excel para pré-visualizar.');
    }
    let parsed: ReturnType<typeof parseOccurrenceImportText>;
    try {
      parsed = parseOccurrenceImportText(rawContent);
    } catch (error) {
      throw new OccurrenceInputError(error instanceof Error ? error.message : 'Formato inválido para importação.');
    }

    const opNumbers = parsed.rows.map((r) => r.numeroOp || '').filter(Boolean);
    const codes = parsed.rows.map((r) => r.code || '').filter(Boolean);
    const context = await OccurrencesRepository.loadImportValidationContext(opNumbers, codes);
    return validateImportRows(parsed, context.mirrorOrdersMap, context.existingRows);
  }

  static async confirmHistoricalImport(
    actor: OccurrenceActor,
    rawContent: unknown,
    skipDuplicates: boolean,
    req: AuthenticatedRequest,
  ) {
    const preview = await this.previewHistoricalImport(rawContent);
    if (preview.errorCount > 0) {
      throw new OccurrenceInputError(`Existem ${preview.errorCount} linha(s) com erro. Corrija-as antes de confirmar a importação.`);
    }

    const rowsToInsert = preview.rows
      .filter((row) => row.validationStatus === 'VALID' || (!skipDuplicates && row.validationStatus === 'DUPLICATE'))
      .map((row) => row.normalized)
      .filter((item): item is NormalizedOccurrenceImportRow => item !== null);

    if (rowsToInsert.length === 0) {
      throw new OccurrenceInputError('Nenhuma ocorrência válida para importar após descartar duplicidades.');
    }

    const inserted = await OccurrencesRepository.importHistoricalBatch(rowsToInsert, {
      id: actor.id,
      uid: actor.uid,
      name: actor.name,
    });

    await AuditService.record({
      userId: actor.uid,
      userEmail: actor.email || actor.loginName,
      action: 'CREATE',
      entity: 'PRODUCTION_OCCURRENCE',
      entityId: inserted[0]?.code || 'IMPORT_BATCH',
      details: {
        event: 'HISTORICAL_IMPORT',
        totalParsed: preview.totalRows,
        insertedCount: inserted.length,
        skippedDuplicates: skipDuplicates ? preview.duplicateCount : 0,
        missingOpInMirrorCount: preview.missingOpInMirrorCount,
      },
    }, req);

    return {
      insertedCount: inserted.length,
      skippedDuplicates: skipDuplicates ? preview.duplicateCount : 0,
      missingOpInMirrorCount: preview.missingOpInMirrorCount,
      codes: inserted.map((row) => row.code),
    };
  }

  static listAssignees() {
    return OccurrencesRepository.listAssignees();
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
    const id = this.parseId(rawId);
    const detail = await OccurrencesRepository.findDetail(id);
    if (!detail) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    return detail;
  }

  static async listMessages(rawId: string) {
    const id = this.parseId(rawId);
    const result = await OccurrencesRepository.listMessages(id);
    if (!result) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    return result;
  }

  static async create(
    actor: OccurrenceActor,
    input: Record<string, unknown>,
    req: AuthenticatedRequest,
  ) {
    const rawOp = input.opNumber ?? input.op_number ?? input.numeroOp;
    const rawPv = input.pvNumber ?? input.pv_number ?? input.numeroPv;
    const rawParent = input.parentProduct ?? input.parent_product;
    const rawComp = input.componentCode ?? input.component_code;
    const rawWarehouse = input.warehouse;
    const rawBalance = input.currentBalance ?? input.current_balance;
    const rawType = input.type;
    const rawOccurrenceType = input.occurrenceType ?? input.occurrence_type;
    const rawDescription = input.description;
    const rawSector = input.sector;
    const rawPriority = input.priority;
    const rawAssigneeId = input.assigneeId ?? input.assignee_id;
    const rawSlaMinutes = input.slaMinutes ?? input.sla_minutes;

    const numeroOp = this.optionalText(rawOp, 'Número da OP', 80);
    const pvNumber = this.optionalText(rawPv, 'Número do PV', 80);
    const parentProduct = this.optionalText(rawParent, 'Produto pai', 80);
    const componentCode = this.optionalText(rawComp, 'Código do componente', 80);
    const warehouse = this.optionalText(rawWarehouse, 'Armazém', 20);
    const currentBalance = this.parseOptionalBalance(rawBalance);

    const parsedType: OccurrenceType =
      normalizeOccurrenceType(typeof rawType === 'string' ? rawType : null)
      || normalizeOccurrenceType(typeof rawOccurrenceType === 'string' ? rawOccurrenceType : null)
      || 'OUTRO';

    const occurrenceType = this.optionalText(rawOccurrenceType, 'Tipo/assunto', 80)
      || OCCURRENCE_TYPE_LABELS[parsedType];

    const description = this.requiredText(rawDescription, 'Descrição', 2000);
    const operation = this.optionalText(input.operation, 'Operação', 120);
    const workstation = this.optionalText(input.workstation, 'Posto ou recurso', 120);
    const immediateAction = this.optionalText(input.immediateAction ?? input.immediate_action, 'Ação imediata', 1000);

    const rule = getRoutingRule(parsedType);
    const sector = this.parseSector(rawSector, rule.sector);
    const priority = this.parsePriority(rawPriority, rule.priority);
    const slaMinutes = this.parseOptionalPositiveInt(rawSlaMinutes, rule.slaMinutes, 14400);
    const assigneeId = this.parseOptionalUserId(rawAssigneeId);

    const sourceMessageKind = input.sourceMessageKind === 'group' || input.sourceMessageKind === 'direct'
      ? input.sourceMessageKind
      : null;
    const sourceMessageId = typeof input.sourceMessageId === 'number' && Number.isSafeInteger(input.sourceMessageId) && input.sourceMessageId > 0
      ? input.sourceMessageId
      : null;

    try {
      const created = await OccurrencesRepository.create({
        type: parsedType,
        numeroOp,
        pvNumber,
        parentProduct,
        componentCode,
        warehouse,
        currentBalance,
        occurrenceType,
        description,
        operation,
        workstation,
        immediateAction,
        requesterId: actor.id,
        assigneeId,
        sector,
        priority,
        slaMinutes,
        sourceMessageKind,
        sourceMessageId,
        authorUid: actor.uid,
        authorName: actor.name,
      });

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'CREATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(created.id),
        details: {
          code: created.code,
          type: created.type,
          sector: created.sector,
          priority: created.priority,
          numeroOp: created.numeroOp,
          componentCode: created.componentCode,
          isRecurrence: created.isRecurrence,
          status: created.status,
        },
      }, req);

      void NotificationsService.notifyOccurrenceEvent({
        occurrence: {
          id: created.id,
          sector: created.sector,
          assigneeId: created.assigneeId,
          requesterId: created.requesterId,
        },
        eventType: 'OCCURRENCE_CREATED',
        actorId: actor.id,
      });

      return created;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async createFromMessage(
    actor: OccurrenceActor,
    input: Record<string, unknown>,
    req: AuthenticatedRequest,
  ) {
    const rawKind = input.messageKind ?? input.message_kind;
    const rawMessageId = input.messageId ?? input.message_id;
    let sourceBody = '';
    let sourceMessageKind: 'group' | 'direct' | null = null;
    let sourceMessageId: number | null = null;
    let sourceImage: {
      storagePath: string;
      mimeType: string;
      sizeBytes: number;
      drawingData: Record<string, unknown> | null;
    } | null = null;

    if (rawMessageId !== undefined && rawMessageId !== null && rawMessageId !== '') {
      const kind = rawKind === 'direct' ? 'direct' : 'group';
      const msgId = Number(rawMessageId);
      if (!Number.isSafeInteger(msgId) || msgId < 1) {
        throw new OccurrenceInputError('Identificador de mensagem inválido.');
      }
      const source = await OccurrencesRepository.findSourceMessage(kind, msgId, actor.id);
      if (!source) throw new OccurrenceNotFoundError('Mensagem de origem não encontrada.');
      if (source.forbidden) throw new OccurrenceForbiddenError('Sem acesso à conversa da mensagem selecionada.');
      sourceBody = source.body || '';
      sourceMessageKind = source.kind;
      sourceMessageId = source.messageId;
      if (source.imageStoragePath && source.imageMimeType) {
        sourceImage = {
          storagePath: source.imageStoragePath,
          mimeType: source.imageMimeType,
          sizeBytes: source.imageSizeBytes || 0,
          drawingData: source.drawingData ?? null,
        };
      }
    }

    const bodyOverride = typeof input.body === 'string' ? input.body.trim() : '';
    const descOverride = typeof input.description === 'string' ? input.description.trim() : '';
    const combinedText = [descOverride, bodyOverride, sourceBody].filter(Boolean).join('\n');
    const extracted = extractOccurrenceFieldsFromText(combinedText);

    const finalDescription = descOverride || bodyOverride || sourceBody || 'Ocorrência aberta a partir de conversa na Central.';

    const created = await this.create(actor, {
      ...input,
      type: input.type ?? extracted.type ?? 'OUTRO',
      opNumber: input.opNumber ?? input.op_number ?? input.numeroOp ?? extracted.opNumber,
      pvNumber: input.pvNumber ?? input.pv_number ?? input.numeroPv ?? extracted.pvNumber,
      parentProduct: input.parentProduct ?? input.parent_product ?? extracted.parentProduct,
      componentCode: input.componentCode ?? input.component_code ?? extracted.componentCode,
      warehouse: input.warehouse ?? extracted.warehouse,
      currentBalance: input.currentBalance ?? input.current_balance ?? extracted.currentBalance,
      description: finalDescription,
      sourceMessageKind,
      sourceMessageId,
    }, req);

    if (sourceImage) {
      const ext = sourceImage.mimeType === 'image/png' ? 'png' : sourceImage.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const targetPath = `occurrences/${created.id}/${randomUUID()}.${ext}`;
      try {
        const copiedPath = await copyPrivateFile(sourceImage.storagePath, targetPath, sourceImage.mimeType);
        await OccurrencesRepository.attachImage({
          occurrenceId: created.id,
          actor: { id: actor.id, uid: actor.uid, name: actor.name },
          storagePath: copiedPath,
          mimeType: sourceImage.mimeType,
          sizeBytes: sourceImage.sizeBytes,
          drawingData: sourceImage.drawingData,
          recordEvent: false,
        });
      } catch (copyError) {
        console.error('Failed to copy source message image into occurrence:', copyError);
      }
    }

    return created;
  }

  static async assign(
    idRaw: string,
    actor: OccurrenceActor,
    input: Record<string, unknown>,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const rawAssignee = input.assigneeId ?? input.assignee_id;
    const assigneeId = rawAssignee === 'me' || rawAssignee === undefined || rawAssignee === null || rawAssignee === ''
      ? actor.id
      : Number(rawAssignee);

    if (!Number.isSafeInteger(assigneeId) || assigneeId < 1) {
      throw new OccurrenceInputError('Responsável inválido.');
    }
    const note = this.optionalText(input.message ?? input.note, 'Observação', 500);

    try {
      const updated = await OccurrencesRepository.assign(id, assigneeId, {
        id: actor.id,
        uid: actor.uid,
        name: actor.name,
      }, note);
      if (!updated) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { event: 'ASSIGNED', assigneeId: updated.assigneeId, status: updated.status },
      }, req);
      void NotificationsService.notifyOccurrenceEvent({
        occurrence: {
          id: updated.id,
          sector: updated.sector,
          assigneeId: updated.assigneeId,
          requesterId: updated.requesterId,
        },
        eventType: 'OCCURRENCE_ASSIGNED',
        actorId: actor.id,
      });

      return updated;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async addMessage(
    idRaw: string,
    actor: OccurrenceActor,
    bodyRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const body = this.requiredText(bodyRaw, 'Mensagem', 2000);
    try {
      const result = await OccurrencesRepository.addMessage(id, {
        id: actor.id,
        uid: actor.uid,
        name: actor.name,
      }, body);
      if (!result) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { event: 'OCCURRENCE_MESSAGE_ADDED', status: result.occurrence.status },
      }, req);
      void NotificationsService.notifyOccurrenceEvent({
        occurrence: {
          id: result.occurrence.id,
          sector: result.occurrence.sector,
          assigneeId: result.occurrence.assigneeId,
          requesterId: result.occurrence.requesterId,
        },
        eventType: 'OCCURRENCE_MESSAGE',
        actorId: actor.id,
      });

      return result;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async addEvent(
    idRaw: string,
    actor: OccurrenceActor,
    messageRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const message = this.requiredText(messageRaw, 'Atualização', 1500);
    const result = await OccurrencesRepository.addEvent(id, {
      message,
      authorId: actor.id,
      authorUid: actor.uid,
      authorName: actor.name,
    });
    if (!result) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
    if (result.closed) {
      throw new OccurrenceInputError('A ocorrência está encerrada. Um supervisor precisa reabri-la antes de receber novas atualizações.');
    }
    await AuditService.record({
      userId: actor.uid,
      userEmail: actor.email || actor.loginName,
      action: 'UPDATE',
      entity: 'PRODUCTION_OCCURRENCE',
      entityId: String(id),
      details: { event: 'NOTE_ADDED' },
    }, req);
    void OccurrencesRepository.findOccurrence(id).then((occ) => {
      if (!occ) return;
      return NotificationsService.notifyOccurrenceEvent({
        occurrence: {
          id: occ.id,
          sector: occ.sector,
          assigneeId: occ.assigneeId,
          requesterId: occ.requesterId,
        },
        eventType: 'OCCURRENCE_MESSAGE',
        actorId: actor.id,
      });
    }).catch(() => undefined);

    return result.event;
  }

  static async complete(
    idRaw: string,
    actor: OccurrenceActor,
    input: Record<string, unknown>,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const resolutionText = this.requiredText(
      input.resolutionText ?? input.resolution_text ?? input.message,
      'Texto de resolução',
      3000,
    );
    if (resolutionText.length < 3) {
      throw new OccurrenceInputError('Descreva a resolução realizada (mínimo 3 caracteres).');
    }

    try {
      const updated = await OccurrencesRepository.complete(id, resolutionText, {
        uid: actor.uid,
        name: actor.name,
      });
      if (!updated) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { event: 'COMPLETED', status: updated.status },
      }, req);
      void NotificationsService.notifyOccurrenceEvent({
        occurrence: {
          id: updated.id,
          sector: updated.sector,
          assigneeId: updated.assigneeId,
          requesterId: updated.requesterId,
        },
        eventType: 'OCCURRENCE_COMPLETED',
        actorId: actor.id,
      });

      return updated;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async changeStatus(
    idRaw: string,
    actor: OccurrenceActor,
    statusRaw: unknown,
    messageRaw: unknown,
    resolutionTextRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const rawStatus = this.requiredText(statusRaw, 'Situação', 30);
    const normalized = normalizeOccurrenceStatus(rawStatus);
    if (!normalized) {
      throw new OccurrenceInputError('Situação inválida. Selecione aberta, em atendimento, aguardando, concluída ou cancelada.');
    }
    const resolutionText = this.optionalText(resolutionTextRaw, 'Texto de resolução', 3000);
    const message = this.optionalText(messageRaw, 'Motivo da atualização', 1500) || resolutionText || '';
    if (!message) {
      throw new OccurrenceInputError('Motivo da atualização é obrigatório.');
    }

    try {
      const updated = await OccurrencesRepository.changeStatus(
        id,
        normalized,
        message,
        {
          uid: actor.uid,
          name: actor.name,
          canManage: hasPermission(actor.role, 'occurrences:manage'),
        },
        resolutionText,
      );
      if (!updated) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { status: updated.status },
      }, req);
      if (updated.status === 'CONCLUIDA' || updated.status === 'CLOSED') {
        void NotificationsService.notifyOccurrenceEvent({
          occurrence: {
            id: updated.id,
            sector: updated.sector,
            assigneeId: updated.assigneeId,
            requesterId: updated.requesterId,
          },
          eventType: 'OCCURRENCE_COMPLETED',
          actorId: actor.id,
        });
      }

      return updated;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async uploadImage(
    idRaw: string,
    actor: OccurrenceActor,
    buffer: Buffer,
    declaredMimeType: string | undefined,
    captionRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const existing = await OccurrencesRepository.findOccurrence(id);
    if (!existing) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

    let validated;
    try {
      validated = validateImageUpload(buffer, declaredMimeType);
    } catch (error) {
      throw new OccurrenceInputError(error instanceof MediaValidationError ? error.message : 'Imagem inválida.');
    }

    const caption = this.optionalText(captionRaw, 'Legenda', 300);
    const objectPath = `occurrences/${id}/${randomUUID()}.${validated.extension}`;
    const storedPath = await savePrivateFile(objectPath, buffer, validated.mimeType);

    try {
      const attachment = await OccurrencesRepository.attachImage({
        occurrenceId: id,
        actor: { id: actor.id, uid: actor.uid, name: actor.name },
        storagePath: storedPath,
        mimeType: validated.mimeType,
        sizeBytes: buffer.length,
        caption,
      });
      if (!attachment) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { event: 'IMAGE_ATTACHED', attachmentId: attachment.id, sizeBytes: buffer.length },
      }, req);

      return attachment;
    } catch (error) {
      await deletePrivateFile(storedPath).catch(() => undefined);
      return mapRepoError(error);
    }
  }

  static async saveAttachmentDrawing(
    idRaw: string,
    attachmentIdRaw: string,
    actor: OccurrenceActor,
    drawingDataRaw: unknown,
    req: AuthenticatedRequest,
  ) {
    const id = this.parseId(idRaw);
    const attachmentId = this.parseId(attachmentIdRaw);
    let sanitized;
    try {
      sanitized = validateDrawingData(drawingDataRaw);
    } catch (error) {
      throw new OccurrenceInputError(error instanceof MediaValidationError ? error.message : 'Desenho inválido.');
    }

    try {
      const result = await OccurrencesRepository.saveAttachmentDrawing(
        id,
        attachmentId,
        { uid: actor.uid, name: actor.name },
        sanitized as unknown as Record<string, unknown>,
      );
      if (!result) throw new OccurrenceNotFoundError('Ocorrência não encontrada.');
      if (result.attachmentNotFound) throw new OccurrenceNotFoundError('Imagem da ocorrência não encontrada.');

      await AuditService.record({
        userId: actor.uid,
        userEmail: actor.email || actor.loginName,
        action: 'UPDATE',
        entity: 'PRODUCTION_OCCURRENCE',
        entityId: String(id),
        details: { event: 'DRAWING_SAVED', attachmentId, strokes: sanitized.strokes.length },
      }, req);

      return result.attachment;
    } catch (error) {
      return mapRepoError(error);
    }
  }

  static async getAttachmentFile(idRaw: string, attachmentIdRaw: string) {
    const id = this.parseId(idRaw);
    const attachmentId = this.parseId(attachmentIdRaw);
    const file = await OccurrencesRepository.findAttachmentFile(id, attachmentId);
    const path = file?.originalImagePath || file?.storagePath;
    if (!file || !path || !file.mimeType) {
      throw new OccurrenceNotFoundError('Anexo não encontrado.');
    }
    return { path, mimeType: file.mimeType, attachmentId: file.id };
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

  private static parseOptionalBalance(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim().replace(',', '.')
        : '';
    if (!normalized || !/^-?\d+(?:\.\d{1,4})?$/.test(normalized) || !Number.isFinite(Number(normalized))) {
      throw new OccurrenceInputError('Saldo atual inválido. Informe um número válido (ex.: -13 ou 25.5).');
    }
    return normalized;
  }

  private static parseSector(value: unknown, fallback: OccurrenceSector): OccurrenceSector {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
      const upper = value.trim().toUpperCase();
      if ((OCCURRENCE_SECTORS as readonly string[]).includes(upper)) {
        return upper as OccurrenceSector;
      }
    }
    throw new OccurrenceInputError('Setor de destino inválido.');
  }

  private static parsePriority(value: unknown, fallback: OccurrencePriority): OccurrencePriority {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
      const upper = value.trim().toUpperCase();
      if ((OCCURRENCE_PRIORITIES as readonly string[]).includes(upper)) {
        return upper as OccurrencePriority;
      }
    }
    throw new OccurrenceInputError('Prioridade inválida.');
  }

  private static parseOptionalPositiveInt(value: unknown, fallback: number, max: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
      throw new OccurrenceInputError(`SLA em minutos deve ser um inteiro entre 1 e ${max}.`);
    }
    return parsed;
  }

  private static parseOptionalUserId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new OccurrenceInputError('Responsável inválido.');
    }
    return parsed;
  }
}
