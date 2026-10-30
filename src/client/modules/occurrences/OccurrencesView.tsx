import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Clock3, Filter, Layers3, Plus, RefreshCw, Search, Send,
  Table2, X,
} from 'lucide-react';
import { api } from '../../api.ts';
import { getIntlLocale, translateText } from '../../i18n/index.ts';

type OccurrencePage = 'analysis' | 'records' | 'new';
type OccurrenceFilters = { search: string; status: string; occurrenceType: string; from: string; to: string };
const blankFilters: OccurrenceFilters = { search: '', status: '', occurrenceType: '', from: '', to: '' };
const statusLabels: Record<string, string> = { OPEN: 'Aberta', IN_PROGRESS: 'Em tratamento', CLOSED: 'Encerrada' };
const statusColors: Record<string, string> = {
  OPEN: 'border-orange-200 bg-orange-50 text-orange-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-800',
  CLOSED: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-700',
};
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—';

interface OccurrencesViewProps {
  initialNumeroOp?: string | null;
  onOpenOp: (numeroOp: string) => void;
  onSuccess: (message: string) => void;
}

export const OccurrencesView: React.FC<OccurrencesViewProps> = ({ initialNumeroOp, onOpenOp, onSuccess }) => {
  const [page, setPage] = useState<OccurrencePage>(initialNumeroOp ? 'new' : 'analysis');
  const [recordsLayout, setRecordsLayout] = useState<'groups' | 'table'>('groups');
  const [draft, setDraft] = useState<OccurrenceFilters>({ ...blankFilters, search: initialNumeroOp || '' });
  const [applied, setApplied] = useState<OccurrenceFilters>({ ...blankFilters, search: initialNumeroOp || '' });
  const [pageNumber, setPageNumber] = useState(1);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOp, setSelectedOp] = useState<any | null>(null);
  const [opSearch, setOpSearch] = useState(initialNumeroOp || '');
  const [opMatches, setOpMatches] = useState<any[]>([]);
  const [opSearchError, setOpSearchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ occurrenceType: '', description: '', operation: '', workstation: '', immediateAction: '' });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [eventMessage, setEventMessage] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const role = api.getUser()?.role;
  const canManage = role === 'ADMIN' || role === 'SUPERVISOR';
  const canComment = role !== 'AUDITOR';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getOccurrences({ ...applied, page: pageNumber, pageSize: 10 })
      .then((result) => { if (active) setData(result); })
      .catch((err: any) => { if (active) { setData(null); setError(err?.message || 'Não foi possível consultar as ocorrências.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, pageNumber]);

  useEffect(() => {
    if (opSearch.trim().length < 2) { setOpMatches([]); setOpSearchError(null); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      api.searchOccurrenceOrders(opSearch.trim())
        .then((rows) => { if (active) { setOpMatches(rows); setOpSearchError(null); } })
        .catch((err: any) => { if (active) { setOpMatches([]); setOpSearchError(err?.message || 'Falha na busca de OP.'); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [opSearch]);

  useEffect(() => {
    if (!initialNumeroOp) return;
    setPage('new');
    setDraft((current) => ({ ...current, search: initialNumeroOp }));
    setApplied((current) => ({ ...current, search: initialNumeroOp }));
    setOpSearch(initialNumeroOp);
  }, [initialNumeroOp]);

  const summary = data?.summary;
  const occurrenceRows = useMemo(() => (data?.items || []).flatMap((group: any) => (group.ops || []).flatMap((op: any) =>
    (op.occurrences || []).map((occurrence: any) => ({ ...occurrence, op, numeroPv: group.numeroPv, clienteNome: group.clienteNome })),
  )), [data]);
  const maxWeekly = Math.max(1, ...(summary?.weekly || []).map((item: any) => Number(item.total)));
  const maxType = Math.max(1, ...(summary?.byType || []).map((item: any) => Number(item.total)));
  const cards = useMemo(() => [
    { label: 'Ocorrências', note: 'Registros no período', value: summary?.totalOccurrences, icon: ClipboardList, color: 'text-amber-800', accent: 'border-l-amber-300/60' },
    { label: 'OPs afetadas', note: 'Ordens distintas', value: summary?.impactedOps, icon: Activity, color: 'text-[#475569]', accent: 'border-l-slate-500/70' },
    { label: 'PVs afetados', note: 'Pedidos distintos', value: summary?.impactedPvs, icon: AlertTriangle, color: 'text-[#475569]', accent: 'border-l-slate-500/70' },
    { label: 'Abertas', note: 'Aguardam tratativa', value: summary?.open, icon: AlertCircle, color: 'text-orange-800', accent: 'border-l-orange-300/60' },
    { label: 'Em tratamento', note: 'Com ação em andamento', value: summary?.inProgress, icon: Clock3, color: 'text-amber-800', accent: 'border-l-amber-200/60' },
    { label: 'Encerradas', note: 'Tratativa concluída', value: summary?.closed, icon: CheckCircle2, color: 'text-emerald-700', accent: 'border-l-emerald-300/60' },
  ], [summary]);

  const applyFilters = (event?: React.FormEvent) => { event?.preventDefault(); setPageNumber(1); setApplied({ ...draft }); };
  const clearFilters = () => { setDraft(blankFilters); setApplied({ ...blankFilters }); setPageNumber(1); };
  const refresh = () => {
    setLoading(true);
    api.getOccurrences({ ...applied, page: pageNumber, pageSize: 10 })
      .then(setData).catch((err: any) => setError(err?.message || 'Falha ao atualizar'))
      .finally(() => setLoading(false));
  };
  const selectOrder = (order: any) => { setSelectedOp(order); setOpSearchError(null); setOpSearch(order.numeroOp); setOpMatches([]); };

  const submitOccurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOp) { setOpSearchError('Selecione uma OP existente no espelho do Protheus.'); return; }
    setFormError(null);
    setSaving(true);
    try {
      await api.createOccurrence({ numeroOp: selectedOp.numeroOp, ...form });
      onSuccess('Ocorrência registrada e vinculada à OP.');
      setSelectedOp(null);
      setOpSearch('');
      setForm({ occurrenceType: '', description: '', operation: '', workstation: '', immediateAction: '' });
      const nextFilters = { ...applied, search: selectedOp.numeroOp };
      setDraft(nextFilters); setApplied(nextFilters); setPageNumber(1);
      setPage('records'); setRecordsLayout('groups');
    } catch (err: any) { setFormError(err?.message || 'Não foi possível registrar a ocorrência.'); }
    finally { setSaving(false); }
  };

  const toggleDetails = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id); setDetail(null); setEventMessage(''); setNextStatus('');
    try { setDetail(await api.getOccurrence(id)); }
    catch (err: any) { setError(err?.message || 'Não foi possível carregar o histórico da ocorrência.'); }
  };

  const saveFollowUp = async (id: number) => {
    if (!eventMessage.trim()) return;
    setEventSaving(true);
    try {
      if (canManage && nextStatus) await api.changeOccurrenceStatus(id, nextStatus, eventMessage.trim());
      else await api.addOccurrenceEvent(id, eventMessage.trim());
      setDetail(await api.getOccurrence(id)); setEventMessage(''); setNextStatus('');
      const result = await api.getOccurrences({ ...applied, page: pageNumber, pageSize: 10 }); setData(result);
    } catch (err: any) { setError(err?.message || 'Não foi possível salvar a atualização.'); }
    finally { setEventSaving(false); }
  };

  const pages = [
    { id: 'analysis' as const, label: 'Análise de dados', icon: BarChart3 },
    { id: 'records' as const, label: 'Registros', icon: ClipboardList },
    ...(role === 'AUDITOR' ? [] : [{ id: 'new' as const, label: 'Nova ocorrência', icon: Plus }]),
  ];

  return (
    <div className="mx-auto max-w-[1520px] overflow-hidden rounded-xl border border-[#DCE3EB] bg-[#F8FAFC] text-[#263548] shadow-sm">
      <header className="flex flex-col gap-3 border-b border-[#DCE3EB] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">Flash Engenharia · Produção</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#263548]">Gestão de ocorrências</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#64748B]">Registre fatos da operação e acompanhe ocorrências vinculadas às OPs e aos PVs.</p>
        </div>
      </header>

      <nav aria-label={translateText('Páginas de ocorrências')} className="flex gap-1 overflow-x-auto border-b border-[#DCE3EB] bg-white px-3 sm:px-5">
        {pages.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors sm:px-4 ${page === id ? 'border-amber-300 text-amber-800' : 'border-transparent text-[#64748B] hover:text-[#475569]'}`}><Icon className="h-4 w-4" />{translateText(label)}</button>)}
      </nav>

      {error && <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:mx-5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label={translateText('Fechar')} className="text-rose-700/70 hover:text-rose-800"><X className="h-4 w-4" /></button></div>}

      <main className="min-h-[540px] min-w-0 bg-[#F8FAFC] p-4 sm:p-5 lg:p-6">
          {page === 'analysis' && <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Visão geral')}</p><h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Análise de dados')}</h2><p className="mt-1 text-xs text-[#64748B]">{translateText('Os indicadores refletem os registros reais no período consultado.')}</p></div><button type="button" onClick={() => setPage('records')} className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2 text-[11px] font-medium text-[#475569] hover:border-amber-300/30 hover:text-amber-800"><Filter className="h-3.5 w-3.5" />{translateText('Ajustar filtros')}</button></div>
            {(applied.search || applied.status || applied.occurrenceType || applied.from || applied.to) && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#DCE3EB] bg-white px-3 py-2 text-[10px] text-[#64748B]"><span>{translateText('Filtros aplicados')}:</span>{applied.search && <span className="rounded bg-slate-100 px-2 py-1">{applied.search}</span>}{applied.status && <span className="rounded bg-slate-100 px-2 py-1">{translateText(statusLabels[applied.status])}</span>}{applied.occurrenceType && <span className="rounded bg-slate-100 px-2 py-1">{applied.occurrenceType}</span>}{(applied.from || applied.to) && <span className="rounded bg-slate-100 px-2 py-1">{applied.from || '…'} – {applied.to || '…'}</span>}<button type="button" onClick={clearFilters} className="ml-auto text-amber-800 hover:text-amber-800">{translateText('Limpar filtros')}</button></div>}

            <section aria-label={translateText('Indicadores de ocorrências')} className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-[#475569]">{translateText('Resumo do período')}</h3><span className="text-[10px] text-[#64748B]">{loading ? translateText('Atualizando…') : translateText('Dados registrados')}</span></div><div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
              {cards.map(({ label, note, value, icon: Icon, color, accent }) => <article key={label} className={`min-w-0 rounded-lg border border-[#DCE3EB] border-l-2 ${accent} bg-white px-3 py-3 transition-colors hover:bg-slate-50`}><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-medium text-[#64748B]">{translateText(label)}</span><Icon className={`h-3.5 w-3.5 shrink-0 ${color} opacity-80`} /></div><strong className="mt-2 block font-mono text-xl font-semibold tracking-tight text-[#263548]">{value === undefined ? '—' : Number(value).toLocaleString()}</strong><span className="mt-1 block truncate text-[9px] text-[#64748B]">{translateText(note)}</span></article>)}
            </div></section>

            <section className="grid gap-3 xl:grid-cols-[1.35fr_1fr]"><article className="rounded-lg border border-[#DCE3EB] bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-[#263548]">{translateText('Evolução semanal')}</h3><p className="mt-1 text-[10px] text-[#64748B]">{translateText('Contagem de registros no período filtrado')}</p></div><Activity className="h-4 w-4 text-[#64748B]" /></div>
              {summary?.weekly?.length ? <div className="mt-5 flex h-36 items-end gap-2 border-b border-l border-[#CBD5E1] px-2">{summary.weekly.slice(-10).map((item: any) => <div key={item.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] text-[#64748B]">{item.total}</span><div title={`${item.week}: ${item.total}`} className="w-full max-w-10 rounded-t bg-amber-300/65" style={{ height: `${Math.max(4, Number(item.total) / maxWeekly * 78)}%` }} /><span className="pb-1 text-[8px] text-[#64748B]">{item.week.slice(5)}</span></div>)}</div> : <div className="mt-4 flex h-36 items-center justify-center rounded border border-dashed border-[#CBD5E1] text-center text-[11px] text-[#64748B]">{translateText('Sem registros no período selecionado.')}</div>}
            </article><article className="rounded-lg border border-[#DCE3EB] bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold text-[#263548]">{translateText('Ocorrências por assunto')}</h3><p className="mt-1 text-[10px] text-[#64748B]">{translateText('Agrupamento pelo texto cadastrado')}</p></div><Layers3 className="h-4 w-4 text-[#64748B]" /></div>
              {summary?.byType?.length ? <div className="mt-4 space-y-3">{summary.byType.map((item: any) => <div key={item.type}><div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate text-[#475569]">{item.type}</span><span className="shrink-0 text-[#64748B]">{item.total}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#FFF7E6]"><div className="h-full rounded-full bg-amber-300/65" style={{ width: `${Number(item.total) / maxType * 100}%` }} /></div></div>)}</div> : <div className="mt-4 flex h-36 items-center justify-center rounded border border-dashed border-[#CBD5E1] text-center text-[11px] text-[#64748B]">{translateText('Sem registros para consolidar.')}</div>}
              <p className="mt-4 border-t border-[#DCE3EB] pt-3 text-[10px] leading-relaxed text-[#64748B]">{translateText('Indicadores por setor, quantidade afetada e tempo parado ficam pendentes até a importação histórica e a validação desses campos.')}</p>
            </article></section>
          </div>}

          {page === 'records' && <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Consulta operacional')}</p><h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Registros de ocorrências')}</h2><p className="mt-1 text-xs text-[#64748B]">{translateText('Consulte cada fato ou acompanhe os problemas agrupados por pedido e ordem.')}</p></div><div className="flex items-center gap-2"><div className="inline-flex rounded-md border border-[#CBD5E1] bg-white p-1"><button type="button" onClick={() => setRecordsLayout('groups')} aria-pressed={recordsLayout === 'groups'} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-semibold ${recordsLayout === 'groups' ? 'bg-[#FFF7E6] text-[#263548]' : 'text-[#64748B] hover:text-[#475569]'}`}><Layers3 className="h-3.5 w-3.5" />{translateText('Agrupados')}</button><button type="button" onClick={() => setRecordsLayout('table')} aria-pressed={recordsLayout === 'table'} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-semibold ${recordsLayout === 'table' ? 'bg-[#FFF7E6] text-[#263548]' : 'text-[#64748B] hover:text-[#475569]'}`}><Table2 className="h-3.5 w-3.5" />{translateText('Tabela')}</button></div><button type="button" onClick={refresh} disabled={loading} aria-label={translateText('Atualizar')} className="inline-flex items-center gap-2 rounded-md border border-[#CBD5E1] px-3 py-2 text-[11px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{translateText('Atualizar')}</button></div></div>

            <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 rounded-lg border border-[#DCE3EB] bg-white p-3 sm:grid-cols-2 xl:grid-cols-6">
              <label className="text-[10px] font-medium text-[#64748B] sm:col-span-2 xl:col-span-2">{translateText('Busca por OP, PV, cliente ou conteúdo')}<div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#64748B]" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} className="w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs text-[#263548] outline-none focus:border-amber-300/50" placeholder={translateText('Digite para localizar')} /></div></label>
              <label className="text-[10px] font-medium text-[#64748B]">{translateText('Situação')}<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"><option value="">{translateText('Todas')}</option><option value="OPEN">{translateText('Aberta')}</option><option value="IN_PROGRESS">{translateText('Em tratamento')}</option><option value="CLOSED">{translateText('Encerrada')}</option></select></label>
              <label className="text-[10px] font-medium text-[#64748B]">{translateText('Tipo/assunto')}<input value={draft.occurrenceType} onChange={(e) => setDraft({ ...draft, occurrenceType: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548] outline-none focus:border-amber-300/50" /></label>
              <label className="text-[10px] font-medium text-[#64748B]">{translateText('Registrada de')}<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]" /></label>
              <label className="text-[10px] font-medium text-[#64748B]">{translateText('Registrada até')}<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]" /></label>
              <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-6"><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2 text-[10px] text-[#475569]"><X className="h-3.5 w-3.5" />{translateText('Limpar')}</button><button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-amber-300 px-3 py-2 text-[10px] font-bold text-[#19150b] hover:bg-amber-200"><Filter className="h-3.5 w-3.5" />{translateText('Aplicar filtros')}</button></div>
            </form>

            {recordsLayout === 'groups' && <div className="space-y-3">
              {loading && !data && <div className="rounded-lg border border-[#DCE3EB] bg-white p-8 text-center text-xs text-[#64748B]">{translateText('Carregando ocorrências...')}</div>}
              {!loading && !error && data?.items?.length === 0 && <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-white px-4 py-10 text-center"><ClipboardList className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-2 text-sm font-semibold text-[#475569]">{translateText('Nenhuma ocorrência encontrada')}</p><p className="mt-1 text-xs text-[#64748B]">{translateText('Ajuste os filtros ou registre uma nova ocorrência vinculada a uma OP existente.')}</p></div>}
              {data?.items?.map((pvGroup: any) => {
                const ops = pvGroup.ops as any[];
                const occurrenceCount = ops.reduce((sum, op) => sum + op.occurrences.length, 0);
                return <article key={pvGroup.numeroPv || ops[0]?.numeroOp} className="overflow-hidden rounded-lg border border-[#DCE3EB] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE3EB] px-4 py-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded border border-amber-300/40 bg-amber-300/10 px-2 py-1 font-mono text-xs font-semibold text-amber-800">{pvGroup.numeroPv ? `PV ${pvGroup.numeroPv}` : translateText('Sem PV vinculado')}</span><span className="text-xs font-medium text-[#475569]">{pvGroup.clienteNome || translateText(pvGroup.clienteAmbiguo ? 'Clientes divergentes no espelho' : 'Cliente não identificado no espelho')}</span></div><p className="mt-1 text-[10px] text-[#64748B]">{ops.length} {translateText('OPs')} · {occurrenceCount} {translateText('ocorrências registradas')}</p></div><ChevronDown className="h-4 w-4 text-[#64748B]" /></div>
                  <div className="divide-y divide-[#E2E8F0]">{ops.map((op) => <div key={op.numeroOp} className="p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-sm font-semibold text-[#263548]">OP {op.numeroOp}</span><span className="ml-2 text-xs text-[#64748B]">{op.codigoProduto} · {op.descricaoProduto || translateText('Descrição não informada')}</span></div><button type="button" onClick={() => onOpenOp(op.numeroOp)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:text-amber-800">{translateText('Abrir OP')}<ArrowRight className="h-3 w-3" /></button></div><div className="space-y-2">
                    {op.occurrences.map((occurrence: any) => <div key={occurrence.id} className="rounded-md border border-[#DCE3EB] bg-[#F8FAFC]"><button type="button" onClick={() => void toggleDetails(occurrence.id)} aria-expanded={expandedId === occurrence.id} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 text-left"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColors[occurrence.status] || 'border-slate-600 text-[#475569]'}`}>{translateText(statusLabels[occurrence.status] || occurrence.status)}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#263548]">{occurrence.occurrenceType}</span><span className="text-[10px] text-[#64748B]">{formatDate(occurrence.createdAt)}</span><span className="text-[10px] text-[#64748B]">{occurrence.createdByName}</span>{expandedId === occurrence.id ? <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#64748B]" />}</button><p className="px-3 pb-3 text-xs leading-relaxed text-[#475569]">{occurrence.description}</p>
                      {expandedId === occurrence.id && <div className="space-y-3 border-t border-[#DCE3EB] p-3">{detail?.id === occurrence.id ? <><div className="grid gap-2 text-[10px] text-[#64748B] sm:grid-cols-3"><span>{translateText('Operação')}: <strong className="text-[#475569]">{detail.operation || '—'}</strong></span><span>{translateText('Posto/recurso')}: <strong className="text-[#475569]">{detail.workstation || '—'}</strong></span><span>{translateText('Ação imediata')}: <strong className="text-[#475569]">{detail.immediateAction || '—'}</strong></span></div><div className="space-y-2 border-l border-[#3a4652] pl-3">{detail.events?.map((item: any) => <div key={item.id} className="relative"><span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-amber-300/80" /><p className="text-xs text-[#475569]">{item.message}</p><p className="mt-0.5 text-[10px] text-[#64748B]">{item.authorName} · {formatDate(item.createdAt)}{item.newStatus ? ` · ${translateText(statusLabels[item.newStatus] || item.newStatus)}` : ''}</p></div>)}</div>
                        {canComment && detail.status !== 'CLOSED' ? <div className="flex flex-col gap-2 sm:flex-row"><input value={eventMessage} onChange={(e) => setEventMessage(e.target.value)} maxLength={1500} placeholder={translateText(canManage ? 'Atualização ou motivo da mudança de situação' : 'Adicionar atualização ao histórico')} className="min-w-0 flex-1 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548] outline-none focus:border-amber-300/50" />{canManage && <select aria-label={translateText('Nova situação')} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-2 text-xs text-[#263548]"><option value="">{translateText('Adicionar nota')}</option><option value="OPEN">{translateText('Aberta')}</option><option value="IN_PROGRESS">{translateText('Em tratamento')}</option><option value="CLOSED">{translateText('Encerrada')}</option></select>}<button type="button" onClick={() => void saveFollowUp(occurrence.id)} disabled={eventSaving || !eventMessage.trim()} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#FFF7E6] px-3 py-2 text-xs font-semibold text-[#263548] disabled:opacity-50"><Send className="h-3.5 w-3.5" />{translateText('Salvar')}</button></div> : canComment && canManage ? <div className="flex flex-col gap-2 sm:flex-row"><p className="flex-1 text-[10px] text-[#64748B]">{translateText('Ocorrência encerrada; para atualizar, selecione uma situação para reabrir.')}</p><select aria-label={translateText('Reabrir ocorrência')} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-2 text-xs text-[#263548]"><option value="">{translateText('Selecione uma situação')}</option><option value="OPEN">{translateText('Reabrir como aberta')}</option><option value="IN_PROGRESS">{translateText('Reabrir em tratamento')}</option></select><input value={eventMessage} onChange={(e) => setEventMessage(e.target.value)} maxLength={1500} placeholder={translateText('Motivo da reabertura')} className="min-w-0 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]" /><button type="button" onClick={() => void saveFollowUp(occurrence.id)} disabled={eventSaving || !eventMessage.trim() || !nextStatus} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#FFF7E6] px-3 py-2 text-xs font-semibold text-[#263548] disabled:opacity-50"><Send className="h-3.5 w-3.5" />{translateText('Salvar')}</button></div> : <p className="text-[10px] text-[#64748B]">{translateText(canComment ? 'Ocorrência encerrada; histórico somente para leitura.' : 'Perfil de consulta: histórico somente para leitura.')}</p>}</> : <div className="py-2 text-xs text-[#64748B]">{translateText('Carregando histórico…')}</div>}</div>}
                    </div>)}
                  </div></div>)}</div>
                </article>;
              })}
            </div>}

            {recordsLayout === 'table' && <div className="overflow-x-auto rounded-lg border border-[#DCE3EB] bg-white"><table className="w-full min-w-[1050px] border-collapse text-left text-[10px]"><thead><tr className="border-b border-[#CBD5E1] bg-[#F8FAFC] text-[9px] uppercase tracking-wide text-[#64748B]">{['Data / hora', 'OP', 'PV', 'Produto', 'Assunto', 'Situação', 'Registrada por', 'Descrição', 'Ação'].map((heading) => <th key={heading} className="px-3 py-3">{translateText(heading)}</th>)}</tr></thead><tbody className="divide-y divide-[#E2E8F0]">{occurrenceRows.map((row: any) => <tr key={row.id} className="align-top text-[#475569] hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3 text-[#64748B]">{formatDate(row.createdAt)}</td><td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-[#263548]">{row.op.numeroOp}</td><td className="whitespace-nowrap px-3 py-3">{row.numeroPv || '—'}</td><td className="max-w-52 px-3 py-3"><span className="block font-mono text-[#64748B]">{row.op.codigoProduto || '—'}</span><span className="line-clamp-2">{row.op.descricaoProduto || '—'}</span></td><td className="max-w-44 px-3 py-3">{row.occurrenceType}</td><td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] ${statusColors[row.status] || 'border-slate-600 text-[#475569]'}`}>{translateText(statusLabels[row.status] || row.status)}</span></td><td className="whitespace-nowrap px-3 py-3">{row.createdByName}</td><td className="max-w-72 px-3 py-3"><span className="line-clamp-2">{row.description}</span></td><td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={() => onOpenOp(row.op.numeroOp)} className="text-amber-800 hover:text-amber-800">{translateText('Abrir OP')} <ArrowRight className="inline h-3 w-3" /></button></td></tr>)}</tbody></table>{occurrenceRows.length === 0 && <div className="py-10 text-center text-xs text-[#64748B]">{translateText('Nenhuma ocorrência encontrada para os filtros informados.')}</div>}</div>}
            {data?.totalPages > 1 && <div className="flex items-center justify-between border-t border-[#DCE3EB] pt-3 text-[10px] text-[#64748B]"><span>{data.totalGroups} {translateText('grupos de PV/OP')} · {data.summary?.totalOccurrences || 0} {translateText('ocorrências')}</span><div className="flex items-center gap-3"><button type="button" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber(pageNumber - 1)} className="disabled:opacity-30">{translateText('Anterior')}</button><span>{pageNumber} / {data.totalPages}</span><button type="button" disabled={pageNumber >= data.totalPages || loading} onClick={() => setPageNumber(pageNumber + 1)} className="disabled:opacity-30">{translateText('Próxima')}</button></div></div>}
          </div>}

          {page === 'new' && role !== 'AUDITOR' && <section className="mx-auto max-w-3xl space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Registro operacional')}</p><h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Nova ocorrência')}</h2><p className="mt-1 text-xs text-[#64748B]">{translateText('Registre o que foi observado; evite conclusões sem confirmação.')}</p></div>
            <form onSubmit={submitOccurrence} className="space-y-4 rounded-lg border border-[#DCE3EB] bg-white p-4 sm:p-5"><label className="block text-[11px] font-semibold text-[#475569]">{translateText('Ordem de produção (OP) *')}<div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input required value={opSearch} onChange={(e) => { setOpSearch(e.target.value); setSelectedOp(null); }} placeholder={translateText('Digite número da OP, PV ou produto')} className="w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] py-2.5 pl-9 pr-3 text-sm text-[#263548] outline-none focus:border-amber-300/50" /></div>{opSearchError && <span role="alert" className="mt-1 block text-[10px] text-rose-700">{translateText(opSearchError)}</span>}{opMatches.length > 0 && !selectedOp && <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-[#CBD5E1] bg-[#F8FAFC]">{opMatches.map((order: any) => <button key={order.numeroOp} type="button" onClick={() => selectOrder(order)} className="block w-full border-b border-[#DCE3EB] px-3 py-2 text-left last:border-0 hover:bg-slate-50"><span className="block font-mono text-xs font-semibold text-amber-800">OP {order.numeroOp}{order.numeroPv ? ` · PV ${order.numeroPv}` : ` · ${translateText('sem PV')}`}</span><span className="text-[10px] text-[#64748B]">{order.codigoProduto} · {order.descricaoProduto || translateText('Descrição não informada')}</span></button>)}</div>}{selectedOp && <span className="mt-1 block text-[10px] text-emerald-700">OP {selectedOp.numeroOp} · {translateText('Vínculo confirmado no espelho.')}</span>}</label>
              {formError && <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">{translateText('Tipo/assunto')} *<input required value={form.occurrenceType} maxLength={80} onChange={(e) => setForm({ ...form, occurrenceType: e.target.value })} placeholder={translateText('Informe o assunto com termos usados na fábrica')} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#263548] outline-none focus:border-amber-300/50" /></label><label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">{translateText('O que aconteceu? *')}<textarea required value={form.description} maxLength={1500} rows={4} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={translateText('Descreva o fato observado, sem suposições.')} className="mt-1 w-full resize-y rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#263548] outline-none focus:border-amber-300/50" /></label><label className="text-[11px] font-semibold text-[#475569]">{translateText('Operação (opcional)')}<input value={form.operation} maxLength={120} onChange={(e) => setForm({ ...form, operation: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-sm text-[#263548]" /></label><label className="text-[11px] font-semibold text-[#475569]">{translateText('Posto/recurso (opcional)')}<input value={form.workstation} maxLength={120} onChange={(e) => setForm({ ...form, workstation: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-sm text-[#263548]" /></label><label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">{translateText('Ação imediata, se realizada (opcional)')}<textarea value={form.immediateAction} maxLength={1000} rows={3} onChange={(e) => setForm({ ...form, immediateAction: e.target.value })} className="mt-1 w-full resize-y rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-sm text-[#263548]" /></label></div>
              <div className="flex flex-col-reverse gap-2 border-t border-[#DCE3EB] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPage('records')} className="rounded-md border border-[#CBD5E1] px-4 py-2 text-[11px] font-semibold text-[#475569]">{translateText('Cancelar')}</button><button type="submit" disabled={saving || !selectedOp} className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-[11px] font-bold text-[#19150b] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{translateText('Registrar ocorrência')}</button></div>
            </form>
          </section>}
      </main>
    </div>
  );
};

