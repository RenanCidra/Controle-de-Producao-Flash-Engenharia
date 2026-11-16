import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Clock3, Download, FileSpreadsheet, Filter, Layers3, Plus,
  RefreshCw, Search, ShieldAlert, Table2, Upload, X,
} from 'lucide-react';
import { api, type OccurrenceAnalyticsStats, type OccurrenceImportPreviewResult } from '../../api.ts';
import { getIntlLocale, translateText } from '../../i18n/index.ts';
import {
  OCCURRENCE_STATUS_LABELS,
  OCCURRENCE_TYPE_LABELS,
  computeSlaDisplay,
} from '../../components/OccurrenceContextBar.tsx';
import { OccurrenceThreadPanel } from '../../components/OccurrenceThreadPanel.tsx';

type OccurrencePage = 'analysis' | 'records' | 'new' | 'import';
type OccurrenceFilters = {
  search: string;
  status: string;
  type: string;
  sector: string;
  occurrenceType: string;
  from: string;
  to: string;
};

const blankFilters: OccurrenceFilters = {
  search: '',
  status: '',
  type: '',
  sector: '',
  occurrenceType: '',
  from: '',
  to: '',
};

const ROUTING_RULES: Record<string, { sector: string; slaMinutes: number; priority: string }> = {
  SEM_SALDO: { sector: 'ALMOX', slaMinutes: 120, priority: 'ALTA' },
  EMPENHO: { sector: 'PCP', slaMinutes: 120, priority: 'MEDIA' },
  TRANSFERENCIA: { sector: 'ALMOX', slaMinutes: 60, priority: 'ALTA' },
  BLOQUEIO_OP: { sector: 'PRODUCAO', slaMinutes: 240, priority: 'CRITICA' },
  QUALIDADE: { sector: 'QUALIDADE', slaMinutes: 240, priority: 'ALTA' },
  OUTRO: { sector: 'PCP', slaMinutes: 120, priority: 'MEDIA' },
};

const statusColors: Record<string, string> = {
  OPEN: 'border-orange-200 bg-orange-50 text-orange-800',
  ABERTA: 'border-orange-200 bg-orange-50 text-orange-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-800',
  EM_ATENDIMENTO: 'border-amber-200 bg-amber-50 text-amber-800',
  AGUARDANDO: 'border-sky-200 bg-sky-50 text-sky-800',
  CLOSED: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-700',
  CONCLUIDA: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-700',
  CANCELADA: 'border-slate-300 bg-slate-100 text-slate-600',
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—';

const formatDurationMinutes = (minutes?: number | null) => {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
};

interface OccurrencesViewProps {
  initialNumeroOp?: string | null;
  initialOccurrenceId?: number | null;
  onOpenOp: (numeroOp: string) => void;
  onSuccess: (message: string) => void;
}

export const OccurrencesView: React.FC<OccurrencesViewProps> = ({ initialNumeroOp, initialOccurrenceId, onOpenOp, onSuccess }) => {
  const [page, setPage] = useState<OccurrencePage>(initialOccurrenceId ? 'records' : initialNumeroOp ? 'new' : 'analysis');
  const [recordsLayout, setRecordsLayout] = useState<'groups' | 'table'>('groups');
  const [draft, setDraft] = useState<OccurrenceFilters>({ ...blankFilters, search: initialNumeroOp || '' });
  const [applied, setApplied] = useState<OccurrenceFilters>({ ...blankFilters, search: initialNumeroOp || '' });
  const [pageNumber, setPageNumber] = useState(1);
  const [data, setData] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<OccurrenceAnalyticsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<number | null>(initialOccurrenceId ?? null);

  // Nova ocorrência (OP opcional, roteamento e SLA automáticos)
  const [selectedOp, setSelectedOp] = useState<any | null>(null);
  const [opSearch, setOpSearch] = useState(initialNumeroOp || '');
  const [opMatches, setOpMatches] = useState<any[]>([]);
  const [opSearchError, setOpSearchError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Array<{ id: number; name: string; department: string | null }>>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: 'SEM_SALDO',
    sector: 'ALMOX',
    priority: 'ALTA',
    assigneeId: '',
    pvNumber: '',
    parentProduct: '',
    componentCode: '',
    warehouse: '',
    currentBalance: '',
    occurrenceType: '',
    description: '',
    operation: '',
    workstation: '',
    immediateAction: '',
  });
  const [exportingCsv, setExportingCsv] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<OccurrenceImportPreviewResult | null>(null);
  const [importSkipDuplicates, setImportSkipDuplicates] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const role = api.getUser()?.role;
  const canImportHistorical = role === 'ADMIN' || role === 'SUPERVISOR';

  const fetchOccurrencesList = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      api.getOccurrences({ ...applied, page: pageNumber, pageSize: 10 }),
      api.getOccurrenceStats({
        from: applied.from || undefined,
        to: applied.to || undefined,
        sector: applied.sector || undefined,
        type: applied.type || undefined,
      }).catch(() => null),
    ])
      .then(([result, statsResult]) => {
        setData(result);
        if (statsResult) setAnalytics(statsResult);
      })
      .catch((err: any) => {
        setData(null);
        setError(err?.message || 'Não foi possível consultar as ocorrências.');
      })
      .finally(() => setLoading(false));
  }, [applied, pageNumber]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getOccurrences({ ...applied, page: pageNumber, pageSize: 10 }),
      api.getOccurrenceStats({
        from: applied.from || undefined,
        to: applied.to || undefined,
        sector: applied.sector || undefined,
        type: applied.type || undefined,
      }).catch(() => null),
    ])
      .then(([result, statsResult]) => {
        if (!active) return;
        setData(result);
        if (statsResult) setAnalytics(statsResult);
      })
      .catch((err: any) => {
        if (active) {
          setData(null);
          setError(err?.message || 'Não foi possível consultar as ocorrências.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, pageNumber]);

  useEffect(() => {
    if (role === 'AUDITOR') return;
    api.getOccurrenceAssignees()
      .then((list) => setAssignees(Array.isArray(list) ? list : []))
      .catch(() => setAssignees([]));
  }, [role]);

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

  useEffect(() => {
    if (!initialOccurrenceId) return;
    setPage('records');
    setSelectedOccurrenceId(initialOccurrenceId);
  }, [initialOccurrenceId]);

  const summary = data?.summary;
  const occurrenceRows = useMemo(() => (data?.items || []).flatMap((group: any) => (group.ops || []).flatMap((op: any) =>
    (op.occurrences || []).map((occurrence: any) => ({ ...occurrence, op, numeroPv: group.numeroPv, clienteNome: group.clienteNome })),
  )), [data]);
  const weeklySeries = useMemo<Array<{ week: string; opened: number; resolved: number }>>(() => {
    if (analytics?.weeklyTrend?.length) return analytics.weeklyTrend;
    return (summary?.weekly || []).slice(-10).map((item: any) => ({
      week: String(item.week || ''),
      opened: Number(item.total || 0),
      resolved: 0,
    }));
  }, [analytics, summary]);
  const maxWeekly = Math.max(1, ...weeklySeries.map((item) => Math.max(Number(item.opened || 0), Number(item.resolved || 0))));
  const maxType = Math.max(1, ...(summary?.byType || []).map((item: any) => Number(item.total)));
  const cards = useMemo(() => [
    { label: 'Ocorrências', note: 'Registros no período', value: summary?.totalOccurrences, icon: ClipboardList, color: 'text-amber-800', accent: 'border-l-amber-300/60' },
    { label: 'OPs afetadas', note: 'Ordens distintas', value: summary?.impactedOps, icon: Activity, color: 'text-[#475569]', accent: 'border-l-slate-500/70' },
    { label: 'PVs afetados', note: 'Pedidos distintos', value: summary?.impactedPvs, icon: AlertTriangle, color: 'text-[#475569]', accent: 'border-l-slate-500/70' },
    { label: 'Abertas', note: 'Aguardam tratativa', value: summary?.open, icon: AlertCircle, color: 'text-orange-800', accent: 'border-l-orange-300/60' },
    { label: 'Em atendimento', note: 'Com ação em andamento', value: summary?.inProgress, icon: Clock3, color: 'text-amber-800', accent: 'border-l-amber-200/60' },
    { label: 'Concluídas', note: 'Tratativa concluída', value: summary?.closed, icon: CheckCircle2, color: 'text-emerald-700', accent: 'border-l-emerald-300/60' },
  ], [summary]);

  const applyFilters = (event?: React.FormEvent) => {
    event?.preventDefault();
    setSelectedOccurrenceId(null);
    setPageNumber(1);
    setApplied({ ...draft });
  };
  const clearFilters = () => {
    setSelectedOccurrenceId(null);
    setDraft(blankFilters);
    setApplied({ ...blankFilters });
    setPageNumber(1);
  };
  const refresh = () => {
    void fetchOccurrencesList();
  };

  const selectOrder = (order: any) => {
    setSelectedOp(order);
    setOpSearchError(null);
    setOpSearch(order.numeroOp);
    setOpMatches([]);
    setForm((current) => ({
      ...current,
      pvNumber: order.numeroPv || current.pvNumber,
      parentProduct: order.codigoProduto || current.parentProduct,
    }));
  };

  const handleTypeChange = (nextType: string) => {
    const rule = ROUTING_RULES[nextType] || ROUTING_RULES.OUTRO;
    setForm((current) => ({
      ...current,
      type: nextType,
      sector: rule.sector,
      priority: rule.priority,
    }));
  };

  const submitOccurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const created = await api.createOccurrence({
        opNumber: selectedOp?.numeroOp || opSearch.trim() || undefined,
        pvNumber: form.pvNumber.trim() || undefined,
        parentProduct: form.parentProduct.trim() || undefined,
        componentCode: form.componentCode.trim() || undefined,
        warehouse: form.warehouse.trim() || undefined,
        currentBalance: form.currentBalance.trim() || undefined,
        type: form.type,
        sector: form.sector,
        priority: form.priority,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
        occurrenceType: form.occurrenceType.trim() || undefined,
        description: form.description,
        operation: form.operation.trim() || undefined,
        workstation: form.workstation.trim() || undefined,
        immediateAction: form.immediateAction.trim() || undefined,
      });
      onSuccess('Ocorrência registrada com SLA e roteamento automático.');
      setSelectedOp(null);
      setOpSearch('');
      setForm({
        type: 'SEM_SALDO',
        sector: 'ALMOX',
        priority: 'ALTA',
        assigneeId: '',
        pvNumber: '',
        parentProduct: '',
        componentCode: '',
        warehouse: '',
        currentBalance: '',
        occurrenceType: '',
        description: '',
        operation: '',
        workstation: '',
        immediateAction: '',
      });
      setPage('records');
      setSelectedOccurrenceId(created?.id || null);
      void fetchOccurrencesList();
    } catch (err: any) {
      setFormError(err?.message || 'Não foi possível registrar a ocorrência.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    setError(null);
    try {
      await api.downloadOccurrencesCsv(applied);
      onSuccess(translateText('CSV de ocorrências exportado com sucesso.'));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível exportar o CSV de ocorrências.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleDownloadImportTemplate = () => {
    const template = [
      '\uFEFFOP;PV;Tipo;Setor;Prioridade;Situacao;Componente;Armazem;Saldo;Posto;Operacao;Data_Abertura;Descricao;Resolucao',
      '000101;012841;SEM_SALDO;ALMOX;ALTA;ABERTA;11.ETQ.DIVE.00005.00;50;-13;EST-01;10;2026-11-10;Falta de etiqueta para finalizacao da OP 000101;',
    ].join('\r\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_ocorrencias.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleSelectImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    setImportPreview(null);
    setImportFileName(file.name);
    const text = await file.text();
    setImportContent(text);
  };

  const handlePreviewImport = async () => {
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const result = await api.previewOccurrencesImport(importContent);
      setImportPreview(result);
    } catch (err: any) {
      setImportPreview(null);
      setImportError(err?.message || 'Não foi possível validar o lote para importação.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setImportConfirming(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const result = await api.confirmOccurrencesImport(importContent, importSkipDuplicates);
      setImportSuccess(
        `${result.insertedCount} ${translateText('ocorrência(s) importada(s)')} (${result.skippedDuplicates} ${translateText('duplicada(s) ignorada(s)')}).`,
      );
      setImportPreview(null);
      setImportContent('');
      setImportFileName(null);
      onSuccess(`${result.insertedCount} ${translateText('ocorrência(s) importada(s)')}.`);
      void fetchOccurrencesList();
    } catch (err: any) {
      setImportError(err?.message || 'Não foi possível concluir a importação histórica.');
    } finally {
      setImportConfirming(false);
    }
  };

  const pages = [
    { id: 'analysis' as const, label: 'Análise de dados', icon: BarChart3 },
    { id: 'records' as const, label: 'Registros', icon: ClipboardList },
    ...(role === 'AUDITOR' ? [] : [{ id: 'new' as const, label: 'Nova ocorrência', icon: Plus }]),
    ...(canImportHistorical ? [{ id: 'import' as const, label: 'Importar histórico', icon: FileSpreadsheet }] : []),
  ];

  const activeRule = ROUTING_RULES[form.type] || ROUTING_RULES.OUTRO;
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-[1520px] overflow-hidden rounded-xl border border-[#DCE3EB] bg-[#F8FAFC] text-[#263548] shadow-sm">
      <header className="flex flex-col gap-3 border-b border-[#DCE3EB] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">Flash Engenharia · Produção</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#263548]">{translateText('Gestão de ocorrências')}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#64748B]">
            {translateText('Registre falhas de saldo, empenho, transferência ou bloqueio com roteamento, SLA e tratativa integrada.')}
          </p>
        </div>
      </header>

      <nav aria-label={translateText('Páginas de ocorrências')} className="flex gap-1 overflow-x-auto border-b border-[#DCE3EB] bg-white px-3 sm:px-5">
        {pages.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPage(id);
              if (id !== 'records') setSelectedOccurrenceId(null);
            }}
            aria-current={page === id ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors sm:px-4 ${
              page === id ? 'border-amber-300 text-amber-800' : 'border-transparent text-[#64748B] hover:text-[#475569]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {translateText(label)}
          </button>
        ))}
      </nav>

      {error && (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:mx-5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={translateText('Fechar')} className="text-rose-700/70 hover:text-rose-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <main className="min-h-[540px] min-w-0 bg-[#F8FAFC] p-4 sm:p-5 lg:p-6">
        {page === 'analysis' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Visão geral')}</p>
                <h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Análise de dados')}</h2>
                <p className="mt-1 text-xs text-[#64748B]">{translateText('Os indicadores refletem os registros reais no período consultado.')}</p>
              </div>
              <button
                type="button"
                onClick={() => setPage('records')}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2 text-[11px] font-medium text-[#475569] hover:border-amber-300/30 hover:text-amber-800"
              >
                <Filter className="h-3.5 w-3.5" />
                {translateText('Ajustar filtros')}
              </button>
            </div>

            {(applied.search || applied.status || applied.type || applied.sector || applied.occurrenceType || applied.from || applied.to) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#DCE3EB] bg-white px-3 py-2 text-[10px] text-[#64748B]">
                <span>{translateText('Filtros aplicados')}:</span>
                {applied.search && <span className="rounded bg-slate-100 px-2 py-1">{applied.search}</span>}
                {applied.status && <span className="rounded bg-slate-100 px-2 py-1">{translateText(OCCURRENCE_STATUS_LABELS[applied.status] || applied.status)}</span>}
                {applied.type && <span className="rounded bg-slate-100 px-2 py-1">{translateText(OCCURRENCE_TYPE_LABELS[applied.type] || applied.type)}</span>}
                {applied.sector && <span className="rounded bg-slate-100 px-2 py-1">{applied.sector}</span>}
                {applied.occurrenceType && <span className="rounded bg-slate-100 px-2 py-1">{applied.occurrenceType}</span>}
                {(applied.from || applied.to) && <span className="rounded bg-slate-100 px-2 py-1">{applied.from || '…'} – {applied.to || '…'}</span>}
                <button type="button" onClick={clearFilters} className="ml-auto text-amber-800 hover:underline">{translateText('Limpar filtros')}</button>
              </div>
            )}

            <section aria-label={translateText('Indicadores de ocorrências')} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold text-[#475569]">{translateText('Resumo do período')}</h3>
                <span className="text-[10px] text-[#64748B]">{loading ? translateText('Atualizando…') : translateText('Dados registrados')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
                {cards.map(({ label, note, value, icon: Icon, color, accent }) => (
                  <article key={label} className={`min-w-0 rounded-lg border border-[#DCE3EB] border-l-2 ${accent} bg-white px-3 py-3 transition-colors hover:bg-slate-50`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-[#64748B]">{translateText(label)}</span>
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${color} opacity-80`} />
                    </div>
                    <strong className="mt-2 block font-mono text-xl font-semibold tracking-tight text-[#263548]">
                      {value === undefined ? '—' : Number(value).toLocaleString()}
                    </strong>
                    <span className="mt-1 block truncate text-[9px] text-[#64748B]">{translateText(note)}</span>
                  </article>
                ))}
              </div>
            </section>

            {analytics?.mirrorFreshness?.status === 'STALE' && (
              <div role="status" className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold">{translateText('Alerta de frescor do espelho Protheus')}</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {translateText('Última sincronização recebida há')} {formatDurationMinutes(analytics.mirrorFreshness.ageMinutes)} ({translateText('limite configurado')}: {formatDurationMinutes(analytics.mirrorFreshness.staleThresholdMinutes)}).
                  </p>
                </div>
              </div>
            )}

            {analytics && (
              <section aria-label={translateText('SLA, MTTR e backlog')} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-[#475569]">{translateText('SLA, MTTR e tempo de resposta')}</h3>
                  <span className="text-[10px] text-[#64748B]">{translateText('Indicadores operacionais')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('1ª resposta (média)')}</span>
                      <Clock3 className="h-3.5 w-3.5 text-sky-700" />
                    </span>
                    <strong className="mt-2 block font-mono text-lg font-semibold text-[#263548]">
                      {formatDurationMinutes(analytics.responseMetrics.avgFirstResponseMinutes)}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {translateText('Mediana')}: {formatDurationMinutes(analytics.responseMetrics.medianFirstResponseMinutes)} ({analytics.responseMetrics.firstResponseSampleCount})
                    </span>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('MTTR médio')}</span>
                      <Activity className="h-3.5 w-3.5 text-emerald-700" />
                    </span>
                    <strong className="mt-2 block font-mono text-lg font-semibold text-[#263548]">
                      {formatDurationMinutes(analytics.responseMetrics.avgMttrMinutes)}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {translateText('Mediana')}: {formatDurationMinutes(analytics.responseMetrics.medianMttrMinutes)} ({analytics.responseMetrics.mttrSampleCount})
                    </span>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('Backlog ativo')}</span>
                      <ClipboardList className="h-3.5 w-3.5 text-amber-700" />
                    </span>
                    <strong className="mt-2 block font-mono text-lg font-semibold text-[#263548]">
                      {analytics.summary.activeBacklog.toLocaleString()}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {analytics.summary.open} {translateText('abertas')} · {analytics.summary.inProgress} {translateText('em atendimento')}
                    </span>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('SLA estourado')}</span>
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                    </span>
                    <strong className={`mt-2 block font-mono text-lg font-semibold ${analytics.summary.slaBreachedActive > 0 ? 'text-rose-700' : 'text-[#263548]'}`}>
                      {analytics.summary.slaBreachedActive.toLocaleString()}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {translateText('Ocorrências ativas vencidas')}
                    </span>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('Cumprimento SLA')}</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                    </span>
                    <strong className="mt-2 block font-mono text-lg font-semibold text-[#159B72]">
                      {analytics.summary.slaCompliancePercent === null ? '—' : `${analytics.summary.slaCompliancePercent}%`}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {analytics.summary.resolved.toLocaleString()} {translateText('concluídas')}
                    </span>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-3">
                    <span className="flex items-center justify-between text-[10px] font-medium text-[#64748B]">
                      <span>{translateText('Reincidências')}</span>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    </span>
                    <strong className="mt-2 block font-mono text-lg font-semibold text-[#263548]">
                      {analytics.summary.recurrenceCount.toLocaleString()}
                    </strong>
                    <span className="mt-1 block text-[9px] text-[#64748B]">
                      {analytics.summary.recurrenceRatePercent === null ? '—' : `${analytics.summary.recurrenceRatePercent}%`} {translateText('do total')}
                    </span>
                  </article>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                    <h4 className="text-xs font-semibold text-[#263548]">{translateText('Backlog por setor')}</h4>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">{translateText('Distribuição das ocorrências ativas e idade média em aberto')}</p>
                    <div className="mt-3 space-y-2">
                      {analytics.backlogBySector.map((row) => (
                        <div key={row.sector} className="flex items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs">
                          <div>
                            <span className="font-mono font-semibold text-[#263548]">{row.sector}</span>
                            <span className="ml-2 text-[10px] text-[#64748B]">
                              {row.open} {translateText('abertas')} · {row.inProgress} {translateText('em atendimento')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-[#64748B]">{formatDurationMinutes(row.avgAgeMinutes)}</span>
                            <strong className="text-[#263548]">{row.totalActive}</strong>
                            {row.slaBreached > 0 && (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                {row.slaBreached} SLA
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                    <h4 className="text-xs font-semibold text-[#263548]">{translateText('Backlog por prioridade')}</h4>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">{translateText('Ocorrências em aberto por criticidade')}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      {analytics.backlogByPriority.map((row) => (
                        <div key={row.priority} className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-[#475569]">{row.priority}</span>
                            {row.slaBreached > 0 && (
                              <span className="font-semibold text-rose-700">{row.slaBreached} SLA</span>
                            )}
                          </div>
                          <strong className="mt-1 block font-mono text-lg text-[#263548]">{row.totalActive}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                    <h4 className="text-xs font-semibold text-[#263548]">{translateText('Top componentes críticos')}</h4>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">{translateText('Clique em um componente para filtrar os registros')}</p>
                    {analytics.topComponents.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {analytics.topComponents.map((item) => (
                          <button
                            key={item.componentCode}
                            type="button"
                            onClick={() => {
                              setDraft((curr) => ({ ...curr, search: item.componentCode }));
                              setApplied((curr) => ({ ...curr, search: item.componentCode }));
                              setPageNumber(1);
                              setPage('records');
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-md border border-[#E2E8F0] px-3 py-2 text-left text-xs transition hover:border-amber-300 hover:bg-[#FFFDF6]"
                          >
                            <div className="min-w-0">
                              <span className="block truncate font-mono font-semibold text-[#263548]">{item.componentCode}</span>
                              <span className="text-[10px] text-[#64748B]">
                                {item.impactedOps} {translateText('OPs')} · {item.recurrences} {translateText('reincidências')}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-[#263548]">
                              {item.active} {translateText('ativas')} / {item.total}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-center text-[11px] text-[#64748B]">{translateText('Nenhum componente vinculado ainda.')}</p>
                    )}
                  </article>

                  <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                    <h4 className="text-xs font-semibold text-[#263548]">{translateText('Top PVs impactados')}</h4>
                    <p className="mt-0.5 text-[10px] text-[#64748B]">{translateText('Clique em um PV para filtrar os registros')}</p>
                    {analytics.topPvs.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        {analytics.topPvs.map((item) => (
                          <button
                            key={item.pvNumber}
                            type="button"
                            onClick={() => {
                              setDraft((curr) => ({ ...curr, search: item.pvNumber }));
                              setApplied((curr) => ({ ...curr, search: item.pvNumber }));
                              setPageNumber(1);
                              setPage('records');
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-md border border-[#E2E8F0] px-3 py-2 text-left text-xs transition hover:border-amber-300 hover:bg-[#FFFDF6]"
                          >
                            <div className="min-w-0">
                              <span className="block truncate font-mono font-semibold text-[#263548]">
                                PV {item.pvNumber}{item.clienteNome ? ` · ${item.clienteNome}` : ''}
                              </span>
                              <span className="text-[10px] text-[#64748B]">
                                {item.impactedOps} {translateText('OPs afetadas')}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-[#263548]">
                              {item.active} {translateText('ativas')} / {item.total}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-center text-[11px] text-[#64748B]">{translateText('Nenhum PV vinculado ainda.')}</p>
                    )}
                  </article>
                </div>
              </section>
            )}

            <section className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
              <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-[#263548]">{translateText('Evolução semanal')}</h3>
                    <p className="mt-1 text-[10px] text-[#64748B]">{translateText('Abertas × concluídas no período filtrado')}</p>
                  </div>
                  <Activity className="h-4 w-4 text-[#64748B]" />
                </div>
                {weeklySeries.length ? (
                  <div className="mt-5 flex h-36 items-end gap-2 border-b border-l border-[#CBD5E1] px-2">
                    {weeklySeries.map((item) => (
                      <div key={item.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[9px] text-[#64748B]">{item.opened}/{item.resolved}</span>
                        <div className="flex h-[74%] w-full max-w-12 items-end justify-center gap-1">
                          <div title={`${item.week} · ${translateText('Abertas')}: ${item.opened}`} className="w-1/2 rounded-t bg-amber-300/75" style={{ height: `${Math.max(4, (Number(item.opened || 0) / maxWeekly) * 100)}%` }} />
                          <div title={`${item.week} · ${translateText('Concluídas')}: ${item.resolved}`} className="w-1/2 rounded-t bg-emerald-400/75" style={{ height: `${Math.max(4, (Number(item.resolved || 0) / maxWeekly) * 100)}%` }} />
                        </div>
                        <span className="pb-1 text-[8px] text-[#64748B]">{item.week.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex h-36 items-center justify-center rounded border border-dashed border-[#CBD5E1] text-center text-[11px] text-[#64748B]">
                    {translateText('Sem registros no período selecionado.')}
                  </div>
                )}
              </article>
              <article className="rounded-lg border border-[#DCE3EB] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-[#263548]">{translateText('Ocorrências por assunto')}</h3>
                    <p className="mt-1 text-[10px] text-[#64748B]">{translateText('Agrupamento pelo texto cadastrado')}</p>
                  </div>
                  <Layers3 className="h-4 w-4 text-[#64748B]" />
                </div>
                {summary?.byType?.length ? (
                  <div className="mt-4 space-y-3">
                    {summary.byType.map((item: any) => (
                      <div key={item.type}>
                        <div className="mb-1 flex justify-between gap-3 text-[10px]">
                          <span className="truncate text-[#475569]">{item.type}</span>
                          <span className="shrink-0 text-[#64748B]">{item.total}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#FFF7E6]">
                          <div className="h-full rounded-full bg-amber-300/65" style={{ width: `${Number(item.total) / maxType * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex h-36 items-center justify-center rounded border border-dashed border-[#CBD5E1] text-center text-[11px] text-[#64748B]">
                    {translateText('Sem registros para consolidar.')}
                  </div>
                )}
              </article>
            </section>
          </div>
        )}

        {page === 'records' && selectedOccurrenceId !== null && (
          <div className="h-[calc(100dvh-230px)] min-h-[520px] overflow-hidden rounded-xl border border-[#DCE3EB] bg-white shadow-sm">
            <OccurrenceThreadPanel
              occurrenceId={selectedOccurrenceId}
              onBack={() => setSelectedOccurrenceId(null)}
              onOpenOp={onOpenOp}
              onUpdated={() => {
                void fetchOccurrencesList();
              }}
            />
          </div>
        )}

        {page === 'records' && selectedOccurrenceId === null && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Consulta operacional')}</p>
                <h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Registros de ocorrências')}</h2>
                <p className="mt-1 text-xs text-[#64748B]">{translateText('Clique em qualquer ocorrência para abrir a tratativa, SLA, responsável e chat interno.')}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-[#CBD5E1] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setRecordsLayout('groups')}
                    aria-pressed={recordsLayout === 'groups'}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-semibold ${recordsLayout === 'groups' ? 'bg-[#FFF7E6] text-[#263548]' : 'text-[#64748B] hover:text-[#475569]'}`}
                  >
                    <Layers3 className="h-3.5 w-3.5" />
                    {translateText('Agrupados')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsLayout('table')}
                    aria-pressed={recordsLayout === 'table'}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-semibold ${recordsLayout === 'table' ? 'bg-[#FFF7E6] text-[#263548]' : 'text-[#64748B] hover:text-[#475569]'}`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    {translateText('Tabela')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-[11px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingCsv ? translateText('Exportando…') : translateText('Exportar CSV')}
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  aria-label={translateText('Atualizar')}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-[#CBD5E1] px-3 py-2 text-[11px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {translateText('Atualizar')}
                </button>
              </div>
            </div>

            <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 rounded-lg border border-[#DCE3EB] bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <label className="text-[10px] font-medium text-[#64748B] sm:col-span-2">
                {translateText('Busca por código, OP, PV, componente ou texto')}
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#64748B]" />
                  <input
                    value={draft.search}
                    onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                    className="w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] py-2 pl-9 pr-3 text-xs text-[#263548] outline-none focus:border-amber-300/50"
                    placeholder={translateText('Digite para localizar')}
                  />
                </div>
              </label>
              <label className="text-[10px] font-medium text-[#64748B]">
                {translateText('Situação')}
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                >
                  <option value="">{translateText('Todas')}</option>
                  <option value="ABERTA">{translateText('Aberta')}</option>
                  <option value="EM_ATENDIMENTO">{translateText('Em atendimento')}</option>
                  <option value="AGUARDANDO">{translateText('Aguardando')}</option>
                  <option value="CONCLUIDA">{translateText('Concluída')}</option>
                  <option value="CANCELADA">{translateText('Cancelada')}</option>
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64748B]">
                {translateText('Tipo')}
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                >
                  <option value="">{translateText('Todos')}</option>
                  <option value="SEM_SALDO">{translateText('Sem Saldo')}</option>
                  <option value="EMPENHO">{translateText('Empenho')}</option>
                  <option value="TRANSFERENCIA">{translateText('Transferência')}</option>
                  <option value="BLOQUEIO_OP">{translateText('Bloqueio de OP')}</option>
                  <option value="QUALIDADE">{translateText('Qualidade')}</option>
                  <option value="OUTRO">{translateText('Outro')}</option>
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64748B]">
                {translateText('Setor')}
                <select
                  value={draft.sector}
                  onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                >
                  <option value="">{translateText('Todos')}</option>
                  <option value="ALMOX">ALMOX</option>
                  <option value="PCP">PCP</option>
                  <option value="PRODUCAO">PRODUCAO</option>
                  <option value="QUALIDADE">QUALIDADE</option>
                </select>
              </label>
              <label className="text-[10px] font-medium text-[#64748B]">
                {translateText('De')}
                <input
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                />
              </label>
              <label className="text-[10px] font-medium text-[#64748B]">
                {translateText('Até')}
                <input
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                />
              </label>
              <div className="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-7">
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2 text-[10px] text-[#475569]">
                  <X className="h-3.5 w-3.5" />
                  {translateText('Limpar')}
                </button>
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-amber-300 px-3 py-2 text-[10px] font-bold text-[#19150b] hover:bg-amber-200">
                  <Filter className="h-3.5 w-3.5" />
                  {translateText('Aplicar filtros')}
                </button>
              </div>
            </form>

            {recordsLayout === 'groups' && (
              <div className="space-y-3">
                {loading && !data && (
                  <div className="rounded-lg border border-[#DCE3EB] bg-white p-8 text-center text-xs text-[#64748B]">
                    {translateText('Carregando ocorrências...')}
                  </div>
                )}
                {!loading && !error && data?.items?.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-white px-4 py-10 text-center">
                    <ClipboardList className="mx-auto h-7 w-7 text-slate-600" />
                    <p className="mt-2 text-sm font-semibold text-[#475569]">{translateText('Nenhuma ocorrência encontrada')}</p>
                    <p className="mt-1 text-xs text-[#64748B]">{translateText('Ajuste os filtros ou registre uma nova ocorrência.')}</p>
                  </div>
                )}
                {data?.items?.map((pvGroup: any) => {
                  const ops = pvGroup.ops as any[];
                  const occurrenceCount = ops.reduce((sum, op) => sum + op.occurrences.length, 0);
                  return (
                    <article key={pvGroup.numeroPv || ops[0]?.numeroOp} className="overflow-hidden rounded-lg border border-[#DCE3EB] bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE3EB] px-4 py-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-amber-300/40 bg-amber-300/10 px-2 py-1 font-mono text-xs font-semibold text-amber-800">
                              {pvGroup.numeroPv ? `PV ${pvGroup.numeroPv}` : translateText('Sem PV vinculado')}
                            </span>
                            <span className="text-xs font-medium text-[#475569]">
                              {pvGroup.clienteNome || translateText(pvGroup.clienteAmbiguo ? 'Clientes divergentes no espelho' : 'Cliente não identificado no espelho')}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-[#64748B]">
                            {ops.length} {translateText('OPs')} · {occurrenceCount} {translateText('ocorrências registradas')}
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-[#64748B]" />
                      </div>
                      <div className="divide-y divide-[#E2E8F0]">
                        {ops.map((op) => (
                          <div key={op.numeroOp} className="p-3 sm:p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-mono text-sm font-semibold text-[#263548]">
                                  {op.hasLinkedOp === false ? op.numeroOp : `OP ${op.numeroOp}`}
                                </span>
                                <span className="ml-2 text-xs text-[#64748B]">
                                  {op.codigoProduto || '—'}{op.descricaoProduto ? ` · ${op.descricaoProduto}` : ''}
                                </span>
                              </div>
                              {op.hasLinkedOp !== false && (
                                <button
                                  type="button"
                                  onClick={() => onOpenOp(op.numeroOp)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:underline"
                                >
                                  {translateText('Abrir OP')}
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {op.occurrences.map((occurrence: any) => {
                                const sla = computeSlaDisplay(occurrence, nowMs);
                                return (
                                  <button
                                    key={occurrence.id}
                                    type="button"
                                    onClick={() => setSelectedOccurrenceId(occurrence.id)}
                                    className="block w-full rounded-md border border-[#DCE3EB] bg-[#F8FAFC] p-3 text-left transition hover:border-amber-300 hover:bg-white"
                                  >
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColors[occurrence.status] || 'border-slate-600 text-[#475569]'}`}>
                                        {translateText(OCCURRENCE_STATUS_LABELS[occurrence.status] || occurrence.status)}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#263548]">
                                        {occurrence.code ? `${occurrence.code} · ` : ''}{occurrence.occurrenceType}
                                      </span>
                                      {occurrence.sector && (
                                        <span className="text-[10px] font-semibold text-slate-600">{occurrence.sector}</span>
                                      )}
                                      <span className={`text-[10px] font-semibold ${sla.breached ? 'text-rose-700' : 'text-slate-500'}`}>
                                        {sla.label}
                                      </span>
                                      <span className="text-[10px] text-[#64748B]">{formatDate(occurrence.createdAt)}</span>
                                      <ChevronRight className="h-3.5 w-3.5 text-[#64748B]" />
                                    </div>
                                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#475569]">{occurrence.description}</p>
                                    {(occurrence.componentCode || occurrence.warehouse || occurrence.assigneeName) && (
                                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-slate-500">
                                        {occurrence.componentCode && <span className="font-mono">Comp.: {occurrence.componentCode}</span>}
                                        {occurrence.warehouse && <span className="font-mono">Armazém: {occurrence.warehouse}</span>}
                                        {occurrence.currentBalance !== null && occurrence.currentBalance !== undefined && (
                                          <span className={`font-mono ${Number(occurrence.currentBalance) < 0 ? 'font-semibold text-rose-700' : ''}`}>
                                            Saldo: {occurrence.currentBalance}
                                          </span>
                                        )}
                                        {occurrence.assigneeName && <span>Resp.: {occurrence.assigneeName}</span>}
                                      </p>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {recordsLayout === 'table' && (
              <div className="overflow-x-auto rounded-lg border border-[#DCE3EB] bg-white">
                <table className="w-full min-w-[1150px] border-collapse text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-[#CBD5E1] bg-[#F8FAFC] text-[9px] uppercase tracking-wide text-[#64748B]">
                      {['Código', 'OP / PV', 'Componente', 'Setor', 'SLA', 'Situação', 'Responsável', 'Descrição', 'Ação'].map((heading) => (
                        <th key={heading} className="px-3 py-3">{translateText(heading)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {occurrenceRows.map((row: any) => {
                      const sla = computeSlaDisplay(row, nowMs);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedOccurrenceId(row.id)}
                          className="cursor-pointer align-top text-[#475569] hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className="block font-mono font-semibold text-[#263548]">{row.code || `#${row.id}`}</span>
                            <span className="text-[9px] text-slate-500">{formatDate(row.createdAt)}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono">
                            <span className="block font-semibold text-[#263548]">{row.op.hasLinkedOp === false ? '—' : row.op.numeroOp}</span>
                            <span className="text-slate-500">{row.numeroPv || row.pvNumber || '—'}</span>
                          </td>
                          <td className="max-w-48 px-3 py-3 font-mono">
                            <span className="block truncate text-[#263548]">{row.componentCode || row.op.codigoProduto || '—'}</span>
                            {(row.warehouse || row.currentBalance !== null) && (
                              <span className="text-[9px] text-slate-500">
                                {row.warehouse ? `Arm. ${row.warehouse}` : ''}
                                {row.currentBalance !== null && row.currentBalance !== undefined ? ` · Saldo ${row.currentBalance}` : ''}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold">{row.sector || 'PCP'}</td>
                          <td className={`whitespace-nowrap px-3 py-3 font-semibold ${sla.breached ? 'text-rose-700' : 'text-slate-600'}`}>
                            {sla.label}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-[9px] ${statusColors[row.status] || 'border-slate-600 text-[#475569]'}`}>
                              {translateText(OCCURRENCE_STATUS_LABELS[row.status] || row.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">{row.assigneeName || '—'}</td>
                          <td className="max-w-72 px-3 py-3"><span className="line-clamp-2">{row.description}</span></td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOccurrenceId(row.id);
                              }}
                              className="font-semibold text-amber-800 hover:underline"
                            >
                              {translateText('Abrir')} <ArrowRight className="inline h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {occurrenceRows.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#64748B]">
                    {translateText('Nenhuma ocorrência encontrada para os filtros informados.')}
                  </div>
                )}
              </div>
            )}

            {data?.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#DCE3EB] pt-3 text-[10px] text-[#64748B]">
                <span>{data.totalGroups} {translateText('grupos de PV/OP')} · {data.summary?.totalOccurrences || 0} {translateText('ocorrências')}</span>
                <div className="flex items-center gap-3">
                  <button type="button" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber(pageNumber - 1)} className="disabled:opacity-30">
                    {translateText('Anterior')}
                  </button>
                  <span>{pageNumber} / {data.totalPages}</span>
                  <button type="button" disabled={pageNumber >= data.totalPages || loading} onClick={() => setPageNumber(pageNumber + 1)} className="disabled:opacity-30">
                    {translateText('Próxima')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'new' && role !== 'AUDITOR' && (
          <section className="mx-auto max-w-3xl space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Registro operacional')}</p>
              <h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Nova ocorrência')}</h2>
              <p className="mt-1 text-xs text-[#64748B]">
                {translateText('Vincule uma OP do espelho ou informe diretamente o componente, armazém e saldo observado.')}
              </p>
            </div>

            <form onSubmit={submitOccurrence} className="space-y-4 rounded-lg border border-[#DCE3EB] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-[#FFF9E9] px-3 py-2 text-[11px] text-[#76530B]">
                <span>{translateText('Roteamento sugerido')}: <strong>{form.sector}</strong></span>
                <span>SLA: <strong>{activeRule.slaMinutes} min</strong></span>
              </div>

              <label className="block text-[11px] font-semibold text-[#475569]">
                {translateText('Ordem de produção (OP — opcional)')}
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                  <input
                    value={opSearch}
                    onChange={(e) => { setOpSearch(e.target.value); setSelectedOp(null); }}
                    placeholder={translateText('Digite número da OP, PV ou produto (ou deixe em branco)')}
                    className="w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] py-2.5 pl-9 pr-3 text-sm text-[#263548] outline-none focus:border-amber-300/50"
                  />
                </div>
                {opSearchError && <span role="alert" className="mt-1 block text-[10px] text-rose-700">{translateText(opSearchError)}</span>}
                {opMatches.length > 0 && !selectedOp && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-[#CBD5E1] bg-[#F8FAFC]">
                    {opMatches.map((order: any) => (
                      <button
                        key={order.numeroOp}
                        type="button"
                        onClick={() => selectOrder(order)}
                        className="block w-full border-b border-[#DCE3EB] px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                      >
                        <span className="block font-mono text-xs font-semibold text-amber-800">
                          OP {order.numeroOp}{order.numeroPv ? ` · PV ${order.numeroPv}` : ` · ${translateText('sem PV')}`}
                        </span>
                        <span className="text-[10px] text-[#64748B]">{order.codigoProduto} · {order.descricaoProduto || translateText('Descrição não informada')}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedOp && (
                  <span className="mt-1 block text-[10px] text-emerald-700">
                    OP {selectedOp.numeroOp} · {translateText('Vínculo confirmado no espelho.')}
                  </span>
                )}
              </label>

              {formError && <p role="alert" className="rounded-md border border-rose-400/30 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Tipo *')}
                  <select
                    value={form.type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  >
                    <option value="SEM_SALDO">{translateText('Sem Saldo')}</option>
                    <option value="EMPENHO">{translateText('Empenho')}</option>
                    <option value="TRANSFERENCIA">{translateText('Transferência')}</option>
                    <option value="BLOQUEIO_OP">{translateText('Bloqueio de OP')}</option>
                    <option value="QUALIDADE">{translateText('Qualidade')}</option>
                    <option value="OUTRO">{translateText('Outro')}</option>
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Setor destino')}
                  <select
                    value={form.sector}
                    onChange={(e) => setForm({ ...form, sector: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  >
                    <option value="ALMOX">ALMOX</option>
                    <option value="PCP">PCP</option>
                    <option value="PRODUCAO">PRODUCAO</option>
                    <option value="QUALIDADE">QUALIDADE</option>
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Prioridade')}
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  >
                    <option value="BAIXA">{translateText('Baixa')}</option>
                    <option value="MEDIA">{translateText('Média')}</option>
                    <option value="ALTA">{translateText('Alta')}</option>
                    <option value="CRITICA">{translateText('Crítica')}</option>
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Responsável inicial (opcional)')}
                  <select
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  >
                    <option value="">{translateText('Atribuir depois')}</option>
                    {assignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}{user.department ? ` · ${user.department}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('PV (opcional)')}
                  <input
                    value={form.pvNumber}
                    maxLength={80}
                    onChange={(e) => setForm({ ...form, pvNumber: e.target.value })}
                    placeholder="Ex.: 012841"
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Componente (opcional)')}
                  <input
                    value={form.componentCode}
                    maxLength={80}
                    onChange={(e) => setForm({ ...form, componentCode: e.target.value })}
                    placeholder="Ex.: 11.ETQ.DIVE.00005.00"
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Produto pai (opcional)')}
                  <input
                    value={form.parentProduct}
                    maxLength={80}
                    onChange={(e) => setForm({ ...form, parentProduct: e.target.value })}
                    placeholder="Ex.: 41.SIR.CTRL.00002.00"
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-[#475569]">
                    {translateText('Armazém')}
                    <input
                      value={form.warehouse}
                      maxLength={20}
                      onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                      placeholder="Ex.: 50"
                      className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#475569]">
                    {translateText('Saldo atual')}
                    <input
                      value={form.currentBalance}
                      maxLength={20}
                      onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
                      placeholder="Ex.: -13"
                      className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
                    />
                  </label>
                </div>

                <label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">
                  {translateText('Assunto resumido (opcional)')}
                  <input
                    value={form.occurrenceType}
                    maxLength={80}
                    onChange={(e) => setForm({ ...form, occurrenceType: e.target.value })}
                    placeholder={translateText('Se vazio, usa o rótulo do tipo selecionado')}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548] outline-none focus:border-amber-300/50"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">
                  {translateText('O que aconteceu? *')}
                  <textarea
                    required
                    value={form.description}
                    maxLength={2000}
                    rows={4}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder={translateText('Descreva o fato observado, sem suposições.')}
                    className="mt-1 w-full resize-y rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#263548] outline-none focus:border-amber-300/50"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Operação (opcional)')}
                  <input
                    value={form.operation}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, operation: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569]">
                  {translateText('Posto/recurso (opcional)')}
                  <input
                    value={form.workstation}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, workstation: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-[#475569] sm:col-span-2">
                  {translateText('Ação imediata, se realizada (opcional)')}
                  <textarea
                    value={form.immediateAction}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setForm({ ...form, immediateAction: e.target.value })}
                    className="mt-1 w-full resize-y rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
                  />
                </label>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-[#DCE3EB] pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPage('records')}
                  className="rounded-md border border-[#CBD5E1] px-4 py-2 text-[11px] font-semibold text-[#475569]"
                >
                  {translateText('Cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.description.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-[11px] font-bold text-[#19150b] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {translateText('Registrar ocorrência')}
                </button>
              </div>
            </form>
          </section>
        )}

        {page === 'import' && canImportHistorical && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">{translateText('Carga controlada')}</p>
                <h2 className="mt-1 text-base font-semibold text-[#263548]">{translateText('Importar histórico de ocorrências')}</h2>
                <p className="mt-1 text-xs text-[#64748B]">
                  {translateText('Envie um arquivo CSV ou cole linhas copiadas do Excel. A gravação só ocorre após prévia, verificação de OP e detecção de duplicidades.')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadImportTemplate}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-[11px] font-medium text-[#475569] hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                {translateText('Baixar modelo CSV')}
              </button>
            </div>

            {importError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importSuccess && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                <span className="inline-flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {importSuccess}
                </span>
                <button
                  type="button"
                  onClick={() => setPage('records')}
                  className="font-semibold text-emerald-900 underline"
                >
                  {translateText('Ver registros')}
                </button>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-[#DCE3EB] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#263548] hover:bg-slate-100">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{importFileName || translateText('Selecionar arquivo CSV/TSV')}</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                    onChange={handleSelectImportFile}
                    className="sr-only"
                  />
                </label>
                <span className="text-[11px] text-[#64748B]">
                  {translateText('Coluna obrigatória: Descricao · Máx. 300 linhas por lote')}
                </span>
              </div>

              <label className="block text-[11px] font-semibold text-[#475569]">
                {translateText('Conteúdo CSV ou células coladas do Excel')}
                <textarea
                  value={importContent}
                  onChange={(e) => {
                    setImportContent(e.target.value);
                    setImportPreview(null);
                    setImportError(null);
                  }}
                  rows={7}
                  placeholder={'OP;PV;Tipo;Setor;Prioridade;Situacao;Componente;Data_Abertura;Descricao\n000101;012841;SEM_SALDO;ALMOX;ALTA;ABERTA;11.ETQ.001;10/11/2026;Falta etiqueta na montagem'}
                  className="mt-1 w-full resize-y rounded-md border border-[#CBD5E1] bg-[#F8FAFC] p-3 font-mono text-xs text-[#263548] outline-none focus:border-amber-300"
                />
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {importContent.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportContent('');
                      setImportFileName(null);
                      setImportPreview(null);
                      setImportError(null);
                    }}
                    className="rounded-md border border-[#CBD5E1] px-3 py-2 text-[11px] font-medium text-[#475569] hover:bg-slate-50"
                  >
                    {translateText('Limpar')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={importLoading || !importContent.trim()}
                  onClick={handlePreviewImport}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-amber-300 px-4 py-2 text-[11px] font-bold text-[#19150b] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {translateText('Validar prévia')}
                </button>
              </div>
            </div>

            {importPreview && (
              <div className="space-y-4 rounded-lg border border-[#DCE3EB] bg-white p-4">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                    <span className="text-[10px] text-[#64748B]">{translateText('Total lido')}</span>
                    <strong className="mt-1 block font-mono text-lg tabular-nums text-[#263548]">{importPreview.totalRows}</strong>
                  </div>
                  <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                    <span className="text-[10px] text-[#64748B]">{translateText('Válidas')}</span>
                    <strong className="mt-1 block font-mono text-lg tabular-nums text-emerald-700">{importPreview.validCount}</strong>
                  </div>
                  <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                    <span className="text-[10px] text-[#64748B]">{translateText('Duplicadas')}</span>
                    <strong className="mt-1 block font-mono text-lg tabular-nums text-amber-700">{importPreview.duplicateCount}</strong>
                  </div>
                  <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                    <span className="text-[10px] text-[#64748B]">{translateText('Erros')}</span>
                    <strong className="mt-1 block font-mono text-lg tabular-nums text-rose-700">{importPreview.errorCount}</strong>
                  </div>
                  <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                    <span className="text-[10px] text-[#64748B]">{translateText('OP fora do espelho')}</span>
                    <strong className="mt-1 block font-mono text-lg tabular-nums text-[#475569]">{importPreview.missingOpInMirrorCount}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border border-[#DCE3EB]">
                  <table className="w-full min-w-[820px] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-[#DCE3EB] bg-[#F8FAFC] text-[10px] text-[#64748B]">
                        <th className="px-3 py-2.5 font-semibold">{translateText('Linha')}</th>
                        <th className="px-3 py-2.5 font-semibold">{translateText('Validação')}</th>
                        <th className="px-3 py-2.5 font-semibold">{translateText('OP / Espelho')}</th>
                        <th className="px-3 py-2.5 font-semibold">{translateText('Tipo / Setor')}</th>
                        <th className="px-3 py-2.5 font-semibold">{translateText('Abertura')}</th>
                        <th className="px-3 py-2.5 font-semibold">{translateText('Descrição e alertas')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {importPreview.rows.map((row) => (
                        <tr key={row.rowNumber} className="align-top hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono tabular-nums text-[#475569]">{row.rowNumber}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-semibold">
                            {row.validationStatus === 'VALID' && (
                              <span className="text-emerald-700">{translateText('Válida')}</span>
                            )}
                            {row.validationStatus === 'DUPLICATE' && (
                              <span className="text-amber-700">{translateText('Duplicada')}</span>
                            )}
                            {row.validationStatus === 'ERROR' && (
                              <span className="text-rose-700">{translateText('Erro')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[#263548]">
                            <span>{row.normalized?.numeroOp || '—'}</span>
                            {row.opFoundInMirror === true && (
                              <span className="block text-[10px] font-sans text-emerald-700">
                                {translateText('Confirmada no espelho')}
                                {row.normalized?.pvNumber ? ` · PV ${row.normalized.pvNumber}` : ''}
                              </span>
                            )}
                            {row.opFoundInMirror === false && (
                              <span className="block text-[10px] font-sans text-amber-700">
                                {translateText('OP ausente no espelho')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#475569]">
                            {row.normalized ? (
                              <>
                                <span className="block font-medium text-[#263548]">{row.normalized.type}</span>
                                <span className="text-[10px] text-[#64748B]">{row.normalized.sector} · {row.normalized.priority}</span>
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums text-[#475569]">
                            {row.normalized?.openedAt ? row.normalized.openedAt.slice(0, 10) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[#475569]">
                            {row.normalized?.description && <p className="line-clamp-2 text-[#263548]">{row.normalized.description}</p>}
                            {row.issues.map((issue, idx) => (
                              <p key={idx} className="text-[10px] font-medium text-rose-700">{issue}</p>
                            ))}
                            {row.warnings.map((warn, idx) => (
                              <p key={idx} className="text-[10px] text-amber-700">{warn}</p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DCE3EB] pt-3">
                  <label className="inline-flex items-center gap-2 text-xs text-[#475569]">
                    <input
                      type="checkbox"
                      checked={importSkipDuplicates}
                      onChange={(e) => setImportSkipDuplicates(e.target.checked)}
                      className="rounded border-[#CBD5E1]"
                    />
                    {translateText('Ignorar linhas duplicadas automaticamente')}
                  </label>
                  <button
                    type="button"
                    disabled={
                      importConfirming
                      || importPreview.errorCount > 0
                      || (importSkipDuplicates ? importPreview.validCount === 0 : importPreview.validCount + importPreview.duplicateCount === 0)
                    }
                    onClick={handleConfirmImport}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[#151C25] px-4 py-2 text-[11px] font-bold text-[#FFAA00] hover:bg-[#1e2733] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importConfirming ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {translateText('Confirmar importação')}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};


