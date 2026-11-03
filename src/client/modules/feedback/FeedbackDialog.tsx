import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Lightbulb, LoaderCircle, MessageSquareText, Send, X } from 'lucide-react';
import { api, type AuthUser, type FeedbackCategory, type FeedbackStatus, type FeedbackSubmission } from '../../api.ts';
import { translateText } from '../../i18n/index.ts';

const t = translateText;
const categoryLabels: Record<FeedbackCategory, string> = { IDEA: 'Sugestão de melhoria', BUG: 'Problema encontrado', QUESTION: 'Dúvida', OTHER: 'Outro assunto' };
const statusLabels: Record<FeedbackStatus, string> = { NEW: 'Novo', IN_REVIEW: 'Em análise', PLANNED: 'Planejado', COMPLETED: 'Concluído', DECLINED: 'Não será implementado' };
const statuses = Object.keys(statusLabels) as FeedbackStatus[];
const previewKey = (uid: string) => `nexus_preview_feedback_${uid}`;

function readPreview(uid: string): FeedbackSubmission[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(previewKey(uid)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'number' && typeof item.title === 'string') : [];
  } catch { return []; }
}

export const FeedbackDialog: React.FC<{
  user: AuthUser;
  localPreview: boolean;
  initialTab: 'submit' | 'inbox';
  onClose: () => void;
  onToast: (message: string, type: 'success' | 'error') => void;
}> = ({ user, localPreview, initialTab, onClose, onToast }) => {
  const canReview = user.role === 'ADMIN' || user.role === 'SUPERVISOR';
  const [tab, setTab] = useState<'submit' | 'inbox'>(initialTab === 'inbox' && canReview ? 'inbox' : 'submit');
  const [category, setCategory] = useState<FeedbackCategory>('IDEA');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<FeedbackSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadItems = async () => {
    if (localPreview) { setItems(readPreview(user.uid)); setLoading(false); setLoadError(false); return; }
    setLoading(true); setLoadError(false);
    try { const result = await api.getFeedback(); setItems(result.items || []); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab === 'inbox' && canReview) void loadItems();
  }, [tab, canReview, localPreview, user.uid]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (localPreview) {
        const demoItem: FeedbackSubmission = {
          id: Date.now(), category, title: title.trim(), description: description.trim(), sourceScreen: null,
          status: 'NEW', submitterUid: user.uid, submitterName: user.name,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const next = [demoItem, ...readPreview(user.uid)].slice(0, 100);
        localStorage.setItem(previewKey(user.uid), JSON.stringify(next));
      } else {
        await api.createFeedback({ category, title: title.trim(), description: description.trim(), sourceScreen: window.location.pathname });
      }
      setSaved(true); setTitle(''); setDescription('');
      onToast(localPreview ? t('Feedback salvo nesta prévia local; não foi enviado ao servidor.') : t('Feedback enviado. Obrigado pela contribuição.'), 'success');
      if (localPreview && canReview) setItems(readPreview(user.uid));
    } catch (error) {
      onToast(error instanceof Error ? error.message : t('Não foi possível enviar o feedback.'), 'error');
    } finally { setSubmitting(false); }
  };

  const changeStatus = async (item: FeedbackSubmission, status: FeedbackStatus) => {
    try {
      if (localPreview) {
        const next = readPreview(user.uid).map(row => row.id === item.id ? { ...row, status, updatedAt: new Date().toISOString() } : row);
        localStorage.setItem(previewKey(user.uid), JSON.stringify(next)); setItems(next);
      } else {
        const updated = await api.updateFeedbackStatus(item.id, status);
        setItems(current => current.map(row => row.id === item.id ? updated : row));
      }
    } catch (error) { onToast(error instanceof Error ? error.message : t('Não foi possível atualizar a sugestão.'), 'error'); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="flex max-h-[min(88dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Lightbulb className="h-5 w-5" /></span><div><h2 id="feedback-title" className="font-semibold text-slate-900">{t('Feedback e sugestões')}</h2><p className="text-xs text-slate-500">{t('Ajude a melhorar o sistema para a rotina da fábrica.')}</p></div></div>
        <button type="button" onClick={onClose} aria-label={t('Fechar')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex gap-2 border-b border-slate-200 px-5 pt-3 sm:px-6">
        <button type="button" onClick={() => setTab('submit')} className={`border-b-2 px-2 pb-3 text-sm font-medium ${tab === 'submit' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500'}`}>{t('Enviar feedback')}</button>
        {canReview && <button type="button" onClick={() => setTab('inbox')} className={`border-b-2 px-2 pb-3 text-sm font-medium ${tab === 'inbox' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500'}`}>{t('Feedback recebido')}</button>}
      </div>
      {localPreview && <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-6">{t('Prévia local: os dados ficam apenas neste navegador e não são enviados ao servidor.')}</p>}
      {tab === 'submit' ? <form onSubmit={submit} className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
        {saved && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{t('Obrigado por contribuir com a melhoria do sistema.')}</div>}
        <label className="block text-sm font-medium text-slate-700">{t('Tipo de feedback')}<span className="relative mt-1.5 block"><select value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)} className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-9 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /></span></label>
        <label className="block text-sm font-medium text-slate-700">{t('Título')}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('Resuma a ideia ou problema')} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /></label>
        <label className="block text-sm font-medium text-slate-700">{t('Descrição')}<textarea required maxLength={3000} rows={5} value={description} onChange={event => setDescription(event.target.value)} placeholder={t('Conte o que aconteceu ou como essa melhoria ajudaria no trabalho.')} className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100" /><span className="mt-1 block text-right text-xs text-slate-400">{description.length}/3000</span></label>
        <div className="flex justify-end"><button type="submit" disabled={submitting || !title.trim() || !description.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#151C25] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t('Enviar')}</button></div>
      </form> : <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />{t('Carregando feedback…')}</div>
          : loadError ? <p className="py-10 text-center text-sm text-slate-500">{t('Não foi possível carregar as sugestões. Tente novamente.')}</p>
            : items.length === 0 ? <div className="py-12 text-center text-slate-500"><MessageSquareText className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-700">{t('Nenhum feedback recebido ainda')}</p><p className="mt-1 text-xs">{t('As sugestões enviadas aparecerão aqui para triagem.')}</p></div>
              : items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t(categoryLabels[item.category])}</span><h3 className="mt-1 font-semibold text-slate-900">{item.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.description}</p></div><label className="shrink-0 text-xs text-slate-500"><span className="sr-only">{t('Situação')}</span><select aria-label={`${t('Situação')}: ${item.title}`} value={item.status} onChange={event => void changeStatus(item, event.target.value as FeedbackStatus)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">{statuses.map(status => <option key={status} value={status}>{t(statusLabels[status])}</option>)}</select></label></div><p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">{item.submitterName} · {new Date(item.createdAt).toLocaleString()}</p></article>)}
      </div>}
    </section>
  </div>;
};
