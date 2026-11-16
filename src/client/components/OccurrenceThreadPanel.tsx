import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Clock3, ImagePlus, LoaderCircle, RefreshCw, ShieldAlert, UserCheck, X,
} from 'lucide-react';
import { api, type DrawingOverlayData } from '../api.ts';
import { getIntlLocale, translateText } from '../i18n/index.ts';
import { OccurrenceContextBar, OCCURRENCE_STATUS_LABELS } from './OccurrenceContextBar.tsx';
import { SendPlaneIcon } from './SendPlaneIcon.tsx';
import { AnnotatedImagePreview } from './AnnotatedImagePreview.tsx';

interface OccurrenceThreadPanelProps {
  occurrenceId: number;
  onBack?: () => void;
  onOpenOp?: (numeroOp: string) => void;
  onUpdated?: (occurrence: any) => void;
}

type AssigneeOption = {
  id: number;
  uid: string;
  name: string;
  role: string;
  department: string | null;
  avatarUrl: string | null;
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const OccurrenceThreadPanel: React.FC<OccurrenceThreadPanelProps> = ({
  occurrenceId,
  onBack,
  onOpenOp,
  onUpdated,
}) => {
  const [detail, setDetail] = useState<any | null>(null);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [completing, setCompleting] = useState(false);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentUser = api.getUser();
  const role = currentUser?.role || 'OPERATOR';
  const isAuditor = role === 'AUDITOR';
  const canManage = role === 'ADMIN' || role === 'SUPERVISOR';
  const canComment = !isAuditor;
  const canAssign = !isAuditor;
  const canResolve = !isAuditor;

  const loadDetail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getOccurrence(occurrenceId);
      setDetail(data);
      setSelectedAssigneeId(data.assigneeId ? String(data.assigneeId) : '');
      onUpdated?.(data);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível carregar a ocorrência.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [occurrenceId, onUpdated]);

  useEffect(() => {
    void loadDetail();
    setCompleteOpen(false);
    setResolutionText('');
    setMessageBody('');
  }, [loadDetail]);

  useEffect(() => {
    if (!canAssign) return;
    api.getOccurrenceAssignees()
      .then((list) => setAssignees(Array.isArray(list) ? list : []))
      .catch(() => setAssignees([]));
  }, [canAssign]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && detail) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [detail?.messages?.length, detail?.events?.length]);

  const isClosed = detail ? ['CLOSED', 'CONCLUIDA', 'CANCELADA'].includes(detail.status) : false;

  const timelineItems = useMemo(() => {
    if (!detail) return [];
    const events = (detail.events || []).map((ev: any) => ({
      key: `event-${ev.id}`,
      kind: 'event' as const,
      createdAt: ev.createdAt,
      authorName: ev.authorName,
      message: ev.message,
      eventType: ev.eventType,
      newStatus: ev.newStatus,
    }));
    const msgs = (detail.messages || []).map((msg: any) => ({
      key: `msg-${msg.id}`,
      kind: 'message' as const,
      createdAt: msg.createdAt,
      authorUid: msg.authorUid,
      authorName: msg.authorName,
      body: msg.body,
    }));
    return [...events, ...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [detail]);

  const handleAssign = async (targetId: number | 'me') => {
    if (!detail || assigning) return;
    setAssigning(true);
    setError(null);
    try {
      await api.assignOccurrence(detail.id, targetId);
      await loadDetail(true);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível atribuir o responsável.'));
    } finally {
      setAssigning(false);
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = messageBody.trim();
    if (!trimmed || sending || !detail) return;
    setSending(true);
    setError(null);
    try {
      await api.addOccurrenceMessage(detail.id, trimmed);
      setMessageBody('');
      await loadDetail(true);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível enviar a mensagem.'));
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || completing) return;
    if (!detail.assigneeId) {
      setError(translateText('Atribua um responsável antes de concluir a ocorrência.'));
      return;
    }
    const trimmed = resolutionText.trim();
    if (trimmed.length < 3) {
      setError(translateText('Informe a resolução realizada (mínimo 3 caracteres).'));
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      await api.completeOccurrence(detail.id, trimmed);
      setCompleteOpen(false);
      setResolutionText('');
      await loadDetail(true);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível concluir a ocorrência.'));
    } finally {
      setCompleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!detail || !newStatus || statusUpdating) return;
    setStatusUpdating(true);
    setError(null);
    try {
      const label = OCCURRENCE_STATUS_LABELS[newStatus] || newStatus;
      await api.changeOccurrenceStatus(detail.id, newStatus, `Situação alterada para ${label}.`);
      await loadDetail(true);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível atualizar a situação.'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!detail || uploadingImage) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(translateText('A imagem excede o limite máximo de 5 MB.'));
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError(translateText('Formato não suportado. Envie PNG, JPEG ou WebP.'));
      return;
    }
    setUploadingImage(true);
    setError(null);
    try {
      await api.uploadOccurrenceImage(detail.id, file);
      await loadDetail(true);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível anexar a imagem.'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveAttachmentDrawing = async (attachmentId: number, drawingData: DrawingOverlayData) => {
    if (!detail) return;
    await api.saveOccurrenceAttachmentDrawing(detail.id, attachmentId, drawingData);
    await loadDetail(true);
  };

  if (loading && !detail) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-[#F8FAFC] p-6 text-xs text-slate-500">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#C27803]" />
        {translateText('Carregando ocorrência…')}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 bg-[#F8FAFC] p-6 text-center text-xs text-slate-500">
        <p>{error || translateText('Ocorrência não encontrada.')}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-1.5 font-semibold text-[#263548]"
          >
            {translateText('Voltar')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F1F4F7]">
      {/* Cabeçalho da ocorrência com retorno mobile */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#DCE3EB] bg-white px-3.5 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={translateText('Voltar')}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#F1F4F7] hover:text-[#263548]"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-mono text-sm font-bold text-[#263548]">
                {detail.code || `OC #${detail.id}`}
              </h2>
              <span className="text-xs text-slate-500">·</span>
              <span className="truncate text-xs font-medium text-slate-600">{detail.occurrenceType}</span>
            </div>
            <p className="truncate text-[11px] text-slate-500">
              {translateText('Aberta por')} {detail.requester?.name || detail.createdByName} · {formatDateTime(detail.openedAt || detail.createdAt)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadDetail(true)}
          title={translateText('Atualizar ocorrência')}
          aria-label={translateText('Atualizar ocorrência')}
          className="rounded-lg border border-[#DCE3EB] p-1.5 text-slate-500 transition hover:bg-[#F8FAFC] hover:text-[#263548]"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      {/* Cabeçalho fixo obrigatório: OP | PV | Componente | Armazém | Saldo | Status | SLA */}
      <OccurrenceContextBar occurrence={detail} onOpenOp={onOpenOp} />

      {/* Barra de ações operacionais (Atribuir, Aguardar, Concluir, Cancelar/Reabrir) */}
      {!isAuditor && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#DCE3EB] bg-white px-3.5 py-2 sm:px-5">
          {!isClosed && canAssign && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={assigning || detail.assigneeId === currentUser?.id}
                onClick={() => void handleAssign('me')}
                className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-[11px] font-semibold text-[#263548] transition hover:border-amber-400 hover:bg-[#FFF9E9] disabled:opacity-50"
              >
                <UserCheck size={13} />
                {detail.assigneeId === currentUser?.id ? translateText('Atribuída a você') : translateText('Assumir')}
              </button>
              <select
                aria-label={translateText('Atribuir responsável')}
                value={selectedAssigneeId}
                disabled={assigning}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAssigneeId(val);
                  if (val) void handleAssign(Number(val));
                }}
                className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-1.5 text-[11px] text-[#263548]"
              >
                <option value="">{translateText('Selecionar responsável…')}</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}{user.department ? ` · ${user.department}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isClosed && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {detail.status !== 'AGUARDANDO' && (
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => void handleStatusChange('AGUARDANDO')}
                  className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <Clock3 size={13} />
                  {translateText('Aguardando')}
                </button>
              )}
              {canResolve && (
                <button
                  type="button"
                  onClick={() => setCompleteOpen((open) => !open)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 size={13} />
                  {translateText('Concluir')}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => void handleStatusChange('CANCELADA')}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <X size={13} />
                  {translateText('Cancelar')}
                </button>
              )}
            </div>
          )}

          {isClosed && canManage && (
            <button
              type="button"
              disabled={statusUpdating}
              onClick={() => void handleStatusChange('EM_ATENDIMENTO')}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#263548] hover:bg-slate-50"
            >
              <RefreshCw size={13} />
              {translateText('Reabrir ocorrência')}
            </button>
          )}
        </div>
      )}

      {/* Formulário inline para conclusão com resolution_text obrigatório */}
      {completeOpen && !isClosed && (
        <form onSubmit={handleComplete} className="shrink-0 space-y-2 border-b border-[#DCE3EB] bg-emerald-50/70 px-3.5 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-900">
              {translateText('Concluir ocorrência')}
            </span>
            <button
              type="button"
              onClick={() => setCompleteOpen(false)}
              aria-label={translateText('Fechar')}
              className="text-slate-500 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>
          {!detail.assigneeId && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
              <ShieldAlert size={14} />
              {translateText('Atribua um responsável acima antes de concluir esta ocorrência.')}
            </p>
          )}
          <textarea
            required
            rows={2}
            maxLength={3000}
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            placeholder={translateText('Descreva a resolução aplicada (ex.: transferência realizada do armazém 01 para 50, saldo regularizado).')}
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-[#263548] outline-none focus:border-emerald-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCompleteOpen(false)}
              className="rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600"
            >
              {translateText('Cancelar')}
            </button>
            <button
              type="submit"
              disabled={completing || !detail.assigneeId || resolutionText.trim().length < 3}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {completing ? translateText('Concluindo…') : translateText('Confirmar conclusão')}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Área de descrição, eventos e mensagens do chat da ocorrência */}
      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-5">
        <div className="rounded-xl border border-[#DCE3EB] bg-white p-3.5 text-xs text-[#263548] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="font-semibold text-[#916B19]">{translateText('Descrição inicial')}</span>
            {detail.parentProduct && (
              <span className="font-mono">{translateText('Produto pai')}: {detail.parentProduct}</span>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#263548]">{detail.description}</p>
          {(detail.operation || detail.workstation || detail.immediateAction) && (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#E7ECF1] pt-2 text-[11px] text-slate-500">
              {detail.operation && <span>{translateText('Operação')}: <strong className="text-[#263548]">{detail.operation}</strong></span>}
              {detail.workstation && <span>{translateText('Posto')}: <strong className="text-[#263548]">{detail.workstation}</strong></span>}
              {detail.immediateAction && <span>{translateText('Ação imediata')}: <strong className="text-[#263548]">{detail.immediateAction}</strong></span>}
            </div>
          )}
          {detail.resolutionText && (
            <div className="mt-2.5 border-t border-emerald-200 bg-emerald-50/60 p-2.5 text-[11px] text-emerald-900">
              <strong>{translateText('Resolução')}:</strong> {detail.resolutionText}
            </div>
          )}
        </div>

        {(detail.attachments || []).filter((att: any) => att.type === 'IMAGE' || att.type === 'DRAWING').length > 0 && (
          <div className="rounded-xl border border-[#DCE3EB] bg-white p-3.5 shadow-sm">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {translateText('Prints e anotações')} ({(detail.attachments || []).filter((att: any) => att.type === 'IMAGE' || att.type === 'DRAWING').length})
            </p>
            <div className="flex flex-wrap gap-3">
              {(detail.attachments || [])
                .filter((att: any) => att.type === 'IMAGE' || att.type === 'DRAWING')
                .map((att: any) => (
                  <AnnotatedImagePreview
                    key={att.id}
                    cacheKey={`occ:${detail.id}:att:${att.id}`}
                    loadImageUrl={() => api.getOccurrenceAttachmentFile(detail.id, att.id)}
                    drawingData={att.drawingData}
                    canDraw={canComment && !isClosed}
                    caption={`${detail.code} - Anexo #${att.id}`}
                    onSaveDrawing={(nextDrawing) => handleSaveAttachmentDrawing(att.id, nextDrawing)}
                  />
                ))}
            </div>
          </div>
        )}

        {timelineItems.map((item) => {
          if (item.kind === 'event') {
            return (
              <div key={item.key} className="mx-auto max-w-xl py-1 text-center text-[11px] text-slate-500">
                <span>{item.message}</span>
                <span className="mx-1.5">·</span>
                <span>{item.authorName}</span>
                <span className="mx-1.5">·</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            );
          }

          const own = item.authorUid === currentUser?.uid;
          return (
            <article
              key={item.key}
              className={`max-w-[88%] rounded-xl border px-3.5 py-2.5 shadow-sm sm:max-w-[78%] ${
                own ? 'ml-auto border-[#E4D2A2] bg-[#FFF9E9]' : 'border-[#E7ECF1] bg-white'
              }`}
            >
              <p className="text-[10px] font-semibold text-[#916B19]">{item.authorName}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#263548]">{item.body}</p>
              <p className="mt-1 text-right text-[10px] text-slate-400">{formatDateTime(item.createdAt)}</p>
            </article>
          );
        })}
      </div>

      {/* Compositor do chat interno da ocorrência */}
      {canComment && !isClosed ? (
        <form onSubmit={handleSendMessage} className="flex shrink-0 items-center gap-2 border-t border-[#DCE3EB] bg-white px-3.5 py-3 sm:px-5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleUploadImage(file);
            }}
          />
          <button
            type="button"
            disabled={uploadingImage || sending}
            onClick={() => imageInputRef.current?.click()}
            title={translateText('Anexar print ou imagem (até 5 MB)')}
            aria-label={translateText('Anexar print ou imagem')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DCE3EB] bg-[#F8FAFC] text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            {uploadingImage ? <LoaderCircle size={17} className="animate-spin text-[#C27803]" /> : <ImagePlus size={18} />}
          </button>
          <input
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            maxLength={2000}
            placeholder={translateText('Responder na ocorrência…')}
            className="min-w-0 flex-1 rounded-full border border-[#C8D0DA] bg-[#F8FAFC] px-4 py-2 text-sm text-[#263548] outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            type="submit"
            disabled={sending || !messageBody.trim()}
            aria-label={translateText('Enviar mensagem')}
            title={translateText('Enviar mensagem')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] transition hover:bg-amber-300 disabled:opacity-40"
          >
            <SendPlaneIcon size={18} />
          </button>
        </form>
      ) : (
        <div className="shrink-0 border-t border-[#DCE3EB] bg-white px-4 py-2.5 text-center text-[11px] text-slate-500">
          {translateText(isAuditor ? 'Perfil de auditoria: visualização somente leitura.' : 'Ocorrência encerrada.')}
        </div>
      )}
    </div>
  );
};
