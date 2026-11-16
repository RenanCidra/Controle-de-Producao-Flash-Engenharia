import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Boxes, CheckCircle2, ChevronRight, ClipboardList, Clock3,
  Database, FileText, Filter, GitBranch, Layers, RefreshCw, Search, ShieldAlert, X,
} from 'lucide-react';
import { ActiveTab } from '../../components/Sidebar.tsx';
import { api, type MirrorFreshness, type OccurrenceAnalyticsStats } from '../../api.ts';
import { translateText } from '../../i18n/index.ts';
import { DataUnavailableState } from '../../components/DataStatus.tsx';

interface DashboardStats {
  totalProtheusPv: number;
  totalProtheusOp: number;
  totalProtheusProducts: number;
  totalProtheusBatches: number;
  totalProtheusStructures: number;
  totalProtheusRoutings: number;
  totalProtheusAppointments: number;
  latestProtheusImport: {
    batchCode: string; sourceType: string; entityType: string; recordsCount: number; status: string; createdAt: string | null;
  } | null;
  mirrorFreshness?: MirrorFreshness;
}

type Filters = {
  search: string;
  cliente: string;
  codigoProduto: string;
  postoTrabalho: string;
  dataInicio: string;
  dataFim: string;
  situacaoPrazo: string;
  apenasAtrasadas: boolean;
  apenasComRefugo: boolean;
  semVinculoPv: boolean;
};

const emptyFilters: Filters = {
  search: '', cliente: '', codigoProduto: '', postoTrabalho: '', dataInicio: '', dataFim: '',
  situacaoPrazo: '', apenasAtrasadas: false, apenasComRefugo: false, semVinculoPv: false,
};

interface DashboardViewProps {
  stats: DashboardStats | null;
  refreshing: boolean;
  refreshError: string | null;
  statsUpdatedAt: string | null;
  onRefresh: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onNavigateToConnectors: () => void;
  onDataRequestSettled: () => void;
  localPreview: boolean;
}

const formatDateTime = (date: string | null | undefined) => {
  if (!date) return 'Data não informada';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'Data não informada' : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const formatDurationMinutes = (minutes: number | null | undefined) => {
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
const situationLabels: Record<string, string> = {
  ATRASADO: 'Atrasadas', RISCO_ATRASO: 'Em risco (até 2 dias)', NO_PRAZO: 'No prazo',
  CONCLUIDO: 'Concluídas', SEM_PREVISAO: 'Sem previsão',
};
const situationColors: Record<string, string> = {
  ATRASADO: '#DC2626', RISCO_ATRASO: '#D97706', NO_PRAZO: '#0284C7', CONCLUIDO: '#159B72', SEM_PREVISAO: '#64748B',
};

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, refreshing, refreshError, statsUpdatedAt, onRefresh, onNavigate, onNavigateToConnectors, onDataRequestSettled, localPreview }) => {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [occurrenceStats, setOccurrenceStats] = useState<OccurrenceAnalyticsStats | null>(null);
  const [occurrenceStatsError, setOccurrenceStatsError] = useState(false);

  const loadProduction = useCallback(async (filters: Filters) => {
    setLoading(true);
    setError(null);
    try {
      if (localPreview) {
        await new Promise(resolve => window.setTimeout(resolve, 450));
        const items = [
          { idOp: 1001, numeroOp: 'OP-260184', statusProtheusOp: 'Em produção', codigoProduto: 'SINAL-LED-01', descricaoProduto: 'Conjunto sinalizador LED', clienteNome: 'Cliente demonstração', numeroPv: 'PV-00842', quantidadePlanejada: 120, quantidadeProduzida: 78, statusPrazo: 'RISCO_ATRASO' },
          { idOp: 1002, numeroOp: 'OP-260185', statusProtheusOp: 'Liberada', codigoProduto: 'LUM-AUX-04', descricaoProduto: 'Luminária auxiliar', clienteNome: 'Cliente demonstração', numeroPv: 'PV-00843', quantidadePlanejada: 60, quantidadeProduzida: 24, statusPrazo: 'NO_PRAZO' },
          { idOp: 1003, numeroOp: 'OP-260176', statusProtheusOp: 'Em produção', codigoProduto: 'PAINEL-IND-02', descricaoProduto: 'Painel de sinalização industrial', clienteNome: 'Cliente demonstração', numeroPv: 'PV-00821', quantidadePlanejada: 35, quantidadeProduzida: 17, statusPrazo: 'ATRASADO' },
          { idOp: 1004, numeroOp: 'OP-260160', statusProtheusOp: 'Encerrada', codigoProduto: 'SUPORTE-INOX', descricaoProduto: 'Suporte inox', clienteNome: 'Cliente demonstração', numeroPv: 'PV-00805', quantidadePlanejada: 90, quantidadeProduzida: 90, statusPrazo: 'CONCLUIDO' },
        ].filter(item => !filters.search || `${item.numeroOp} ${item.codigoProduto} ${item.descricaoProduto} ${item.numeroPv}`.toLowerCase().includes(filters.search.toLowerCase()));
        setData({
          total: items.length,
          items,
          summary: { totalOps: 4, totalPlanejado: 305, totalProduzido: 209, totalRefugo: 7, percentualProduzido: 68.5, porSituacao: { ATRASADO: 1, RISCO_ATRASO: 1, NO_PRAZO: 1, CONCLUIDO: 1, SEM_PREVISAO: 0 }, principaisProdutos: [{ codigoProduto: 'SINAL-LED-01', descricaoProduto: 'Conjunto sinalizador LED', quantidadeProduzida: 78 }, { codigoProduto: 'LUM-AUX-04', descricaoProduto: 'Luminária auxiliar', quantidadeProduzida: 24 }, { codigoProduto: 'PAINEL-IND-02', descricaoProduto: 'Painel industrial', quantidadeProduzida: 17 }] },
        });
        setOccurrenceStats({
          period: { from: null, to: null, sector: null, type: null },
          summary: { total: 6, open: 2, inProgress: 1, resolved: 3, cancelled: 0, activeBacklog: 3, recurrenceCount: 1, recurrenceRatePercent: 16.7, slaBreachedActive: 1, slaCompliancePercent: 66.7 },
          responseMetrics: { avgFirstResponseMinutes: 18, medianFirstResponseMinutes: 14, firstResponseSampleCount: 5, avgMttrMinutes: 95, medianMttrMinutes: 82, mttrSampleCount: 3 },
          backlogBySector: [
            { sector: 'ALMOX', open: 1, inProgress: 1, totalActive: 2, slaBreached: 1, avgAgeMinutes: 74 },
            { sector: 'PCP', open: 1, inProgress: 0, totalActive: 1, slaBreached: 0, avgAgeMinutes: 35 },
            { sector: 'PRODUCAO', open: 0, inProgress: 0, totalActive: 0, slaBreached: 0, avgAgeMinutes: null },
            { sector: 'QUALIDADE', open: 0, inProgress: 0, totalActive: 0, slaBreached: 0, avgAgeMinutes: null },
          ],
          backlogByPriority: [
            { priority: 'CRITICA', totalActive: 0, slaBreached: 0 },
            { priority: 'ALTA', totalActive: 2, slaBreached: 1 },
            { priority: 'MEDIA', totalActive: 1, slaBreached: 0 },
            { priority: 'BAIXA', totalActive: 0, slaBreached: 0 },
          ],
          byType: [],
          topComponents: [{ componentCode: '11.ETQ.DIVE.00005.00', total: 3, active: 2, recurrences: 1, impactedOps: 2 }],
          topPvs: [{ pvNumber: 'PV-00842', clienteNome: 'Cliente demonstração', total: 2, active: 1, impactedOps: 1 }],
          weeklyTrend: [],
          mirrorFreshness: {
            status: 'FRESH',
            ageMinutes: 5,
            staleThresholdMinutes: 60,
            latestImportAt: new Date().toISOString(),
            latestBatchCode: 'PREVIEW-LOCAL',
            latestEntityType: 'PRODUÇÃO',
            latestSourceType: 'DEMONSTRAÇÃO',
            latestRecordsCount: 214,
          },
        });
        setOccurrenceStatsError(false);
        return;
      }
      const [result, occStats] = await Promise.all([
        api.getTraceabilityMatrix({ ...filters, situacaoPrazo: (filters.situacaoPrazo || undefined) as any, page: 1, limit: 10 }),
        api.getOccurrenceStats().catch(() => null),
      ]);
      setData(result);
      if (occStats) {
        setOccurrenceStats(occStats);
        setOccurrenceStatsError(false);
      } else {
        setOccurrenceStatsError(true);
      }
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Não foi possível carregar os dados de produção.');
    } finally {
      setLoading(false);
    }
  }, [localPreview]);

  useEffect(() => {
    void loadProduction(applied).finally(onDataRequestSettled);
  }, [applied, loadProduction, onDataRequestSettled]);

  const applyFilters = (event?: React.FormEvent) => {
    event?.preventDefault();
    setApplied({ ...draft });
  };
  const clearFilters = () => { setDraft(emptyFilters); setApplied(emptyFilters); };
  const summary = data?.summary;
  const metrics = [
    { label: 'Ordens encontradas', value: summary?.totalOps, icon: GitBranch, color: '#1E293B' },
    { label: 'Quantidade planejada', value: summary ? formatNumber(summary.totalPlanejado) : undefined, icon: FileText, color: '#C27803' },
    { label: 'Quantidade produzida', value: summary ? formatNumber(summary.totalProduzido) : undefined, icon: Activity, color: '#0284C7' },
    { label: 'Refugo registrado', value: summary ? formatNumber(summary.totalRefugo) : undefined, icon: AlertTriangle, color: '#DC2626' },
    { label: 'Avanço sobre o planejado', value: summary?.percentualProduzido == null ? undefined : `${summary.percentualProduzido}%`, icon: CheckCircle2, color: '#159B72' },
    { label: 'Pedidos de venda no espelho', value: stats?.totalProtheusPv, icon: ClipboardList, color: '#9333EA' },
  ];
  const setSituationFilter = (value: string) => {
    const next = { ...applied, situacaoPrazo: applied.situacaoPrazo === value ? '' : value };
    setDraft((previous) => ({ ...previous, situacaoPrazo: next.situacaoPrazo }));
    setApplied(next);
  };
  const maxStatusCount = Math.max(1, ...Object.values(summary?.porSituacao || {}).map(Number));
  const maxProductQty = Math.max(1, ...(summary?.principaisProdutos || []).map((product: any) => product.quantidadeProduzida));

  if (!localPreview && (refreshError || error)) {
    return <div className="mx-auto max-w-[1520px] space-y-5">
      <section className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
        <h3 className="text-sm font-semibold text-[#263548]">Atualização do espelho</h3>
        <p className="mt-1 text-xs text-[#64748B]">Os gráficos e indicadores dependem dos dados consultados no sistema.</p>
      </section>
      <DataUnavailableState
        compact
        title="Dados do painel indisponíveis"
        description="Não foi possível consultar os dados necessários para montar os indicadores. Verifique a conexão do sistema e tente novamente."
        onRetry={() => { onRefresh(); void loadProduction(applied); }}
        retrying={refreshing || loading}
      />
      <div className="text-center"><button type="button" onClick={onNavigateToConnectors} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A5B00] hover:underline">Ver conectores e cargas <ChevronRight className="h-3.5 w-3.5" /></button></div>
    </div>;
  }

  const mirrorFreshness = stats?.mirrorFreshness || occurrenceStats?.mirrorFreshness || null;

  return (
    <div className="mx-auto max-w-[1520px] space-y-5 select-none">
      {localPreview && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Prévia local: indicadores e OPs demonstrativos, sem consulta ao banco.</p>}
      <section className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#263548]">Atualização do espelho</h3>
              {mirrorFreshness && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  mirrorFreshness.status === 'FRESH'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : mirrorFreshness.status === 'STALE'
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}>
                  {mirrorFreshness.status === 'FRESH'
                    ? translateText('Espelho atualizado')
                    : mirrorFreshness.status === 'STALE'
                      ? translateText('Espelho desatualizado')
                      : translateText('Sem cargas no espelho')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[#64748B]">Painel consultado {statsUpdatedAt ? `às ${formatDateTime(statsUpdatedAt)}` : 'aguardando a primeira consulta'} · atualização automática a cada 5 minutos.</p>
            <p className="mt-1 text-xs text-[#64748B]">Última carga recebida: {stats?.latestProtheusImport ? `${formatDateTime(stats.latestProtheusImport.createdAt)} · ${stats.latestProtheusImport.sourceType} · ${stats.latestProtheusImport.entityType} · ${stats.latestProtheusImport.recordsCount} registros` : 'nenhuma carga registrada'}.</p>
          </div>
          <button onClick={() => { onRefresh(); void loadProduction(applied); }} disabled={refreshing || loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#263548] transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshing || loading ? 'animate-spin' : ''}`} />{refreshing || loading ? 'Atualizando…' : 'Atualizar painel'}</button>
        </div>
        {(refreshError || error) && <div role="alert" className="mt-3 flex flex-col gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold text-rose-800">{translateText('Dados do espelho indisponíveis')}</p><p className="mt-0.5 text-xs text-rose-700">{translateText(error || refreshError || '')}</p></div><button type="button" onClick={onNavigateToConnectors} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 sm:self-auto">{translateText('Ver Conectores Protheus')} <ChevronRight className="h-3.5 w-3.5" /></button></div>}
        {mirrorFreshness?.status === 'STALE' && !refreshError && !error && (
          <div role="status" className="mt-3 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900">{translateText('Alerta de frescor do espelho Protheus')}</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {translateText('Última sincronização recebida há')} {formatDurationMinutes(mirrorFreshness.ageMinutes)} ({translateText('limite configurado')}: {formatDurationMinutes(mirrorFreshness.staleThresholdMinutes)}).
                </p>
              </div>
            </div>
            <button type="button" onClick={onNavigateToConnectors} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 sm:self-auto">
              {translateText('Ver Conectores Protheus')} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {stats && stats.totalProtheusBatches === 0 && !refreshError && !error && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Ainda não há cargas recebidas. Os indicadores serão preenchidos quando existirem dados no espelho Protheus.</p>}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#DCE3EB] bg-white shadow-xs">
        <button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#263548]"><Filter className="h-4 w-4 text-[#C27803]" />Filtros avançados</span><span className="text-xs font-medium text-[#64748B]">{showFilters ? 'Recolher' : 'Abrir'}</span>
        </button>
        {showFilters && <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-[#475569]">Busca geral<input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} placeholder="OP, PV, produto" className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Cliente<input value={draft.cliente} onChange={(e) => setDraft({ ...draft, cliente: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Código do produto<input value={draft.codigoProduto} onChange={(e) => setDraft({ ...draft, codigoProduto: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Posto / recurso<input value={draft.postoTrabalho} onChange={(e) => setDraft({ ...draft, postoTrabalho: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Emissão da OP — de<input type="date" value={draft.dataInicio} onChange={(e) => setDraft({ ...draft, dataInicio: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Emissão da OP — até<input type="date" value={draft.dataFim} onChange={(e) => setDraft({ ...draft, dataFim: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /></label>
          <label className="text-xs font-medium text-[#475569]">Situação de prazo<select value={draft.situacaoPrazo} onChange={(e) => setDraft({ ...draft, situacaoPrazo: e.target.value })} className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"><option value="">Todas</option><option value="ATRASADO">Atrasadas</option><option value="RISCO_ATRASO">Em risco</option><option value="NO_PRAZO">No prazo</option><option value="CONCLUIDO">Concluídas</option><option value="SEM_PREVISAO">Sem previsão</option></select></label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#475569] sm:col-span-2 xl:col-span-4">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.apenasAtrasadas} onChange={(e) => setDraft({ ...draft, apenasAtrasadas: e.target.checked })} />Somente atrasadas</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.apenasComRefugo} onChange={(e) => setDraft({ ...draft, apenasComRefugo: e.target.checked })} />Com refugo</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.semVinculoPv} onChange={(e) => setDraft({ ...draft, semVinculoPv: e.target.checked })} />Sem pedido de venda</label>
            <span className="flex-1" />
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 font-semibold"><X className="h-3.5 w-3.5" />Limpar</button>
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-[#151C25] px-3 py-2 font-semibold text-white disabled:opacity-50"><Search className="h-3.5 w-3.5" />Aplicar filtros</button>
          </div>
        </form>}
      </section>

      <section aria-label="Indicadores da produção filtrada" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !data ? (
          <div className="col-span-full flex h-28 items-center justify-center rounded-lg border border-[#DCE3EB] bg-white text-xs text-slate-500">
            {translateText('Carregando indicadores…')}
          </div>
        ) : (
          metrics.map(({ label, value, icon: Icon, color }) => <div key={label} className="flex items-center rounded-lg border border-l-4 border-[#DCE3EB] bg-white p-4 shadow-xs" style={{ borderLeftColor: color }}><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}><Icon className="h-5 w-5" /></span><span><span className="block text-[11px] font-medium text-[#64748B]">{translateText(label)}</span><span className="mt-1 block font-mono text-xl font-bold leading-none text-[#263548]">{value === undefined ? '—' : typeof value === 'number' ? formatNumber(value) : value}</span></span></span></div>)
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#DCE3EB] bg-white shadow-xs">
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C27803]">Painel visual</p><h3 className="mt-1 text-lg font-semibold text-[#263548]">Panorama da produção</h3><p className="mt-1 text-xs text-[#64748B]">Quantidades e prazos consolidados das OPs encontradas · use os filtros para explorar o espelho.</p></div>
          <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-medium text-[#64748B]">Prazo<select value={draft.situacaoPrazo} onChange={(event) => setDraft({ ...draft, situacaoPrazo: event.target.value })} className="mt-1 block rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs text-[#263548]"><option value="">Todos</option><option value="ATRASADO">Atrasadas</option><option value="RISCO_ATRASO">Em risco</option><option value="NO_PRAZO">No prazo</option><option value="CONCLUIDO">Concluídas</option><option value="SEM_PREVISAO">Sem previsão</option></select></label>
            <label className="text-[10px] font-medium text-[#64748B]">Emissão de<input type="date" value={draft.dataInicio} onChange={(event) => setDraft({ ...draft, dataInicio: event.target.value })} className="mt-1 block rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs text-[#263548]" /></label>
            <label className="text-[10px] font-medium text-[#64748B]">Até<input type="date" value={draft.dataFim} onChange={(event) => setDraft({ ...draft, dataFim: event.target.value })} className="mt-1 block rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs text-[#263548]" /></label>
            <button type="submit" disabled={loading} className="rounded-md bg-[#151C25] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Aplicar</button>
          </form>
          </div>
        </div>
        {summary ? <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-[#E2E8F0] p-5 xl:border-b-0 xl:border-r">
            <div className="flex items-end justify-between gap-3"><div><h4 className="text-sm font-semibold text-[#263548]">Planejado × produzido</h4><p className="mt-1 text-[11px] text-[#64748B]">Avanço agregado, calculado com as quantidades das OPs filtradas.</p></div><strong className="font-mono text-2xl text-[#159B72]">{summary.percentualProduzido == null ? '—' : `${summary.percentualProduzido}%`}</strong></div>
            <div className="mt-6 space-y-5">
              <div><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-[#475569]">Produzido</span><span className="font-mono font-semibold text-[#263548]">{formatNumber(summary.totalProduzido)} / {formatNumber(summary.totalPlanejado)}</span></div><div className="h-5 overflow-hidden rounded-md bg-[#EEF2F6]"><div className="h-full rounded-md bg-[#159B72] transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(summary.percentualProduzido || 0)))}%` }} /></div></div>
              <div><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-[#475569]">Refugo registrado</span><span className="font-mono font-semibold text-[#263548]">{formatNumber(summary.totalRefugo)}</span></div><div className="h-3 overflow-hidden rounded-md bg-[#EEF2F6]"><div className="h-full rounded-md bg-[#DC2626] transition-all" style={{ width: `${summary.totalPlanejado > 0 ? Math.min(100, Math.max(summary.totalRefugo > 0 ? 2 : 0, (summary.totalRefugo / summary.totalPlanejado) * 100)) : 0}%` }} /></div></div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[#F8FAFC] p-3"><span className="block text-[10px] text-[#64748B]">OPs encontradas</span><strong className="mt-1 block font-mono text-lg text-[#263548]">{formatNumber(summary.totalOps)}</strong></div><div className="rounded-lg bg-[#F8FAFC] p-3"><span className="block text-[10px] text-[#64748B]">Quantidade planejada</span><strong className="mt-1 block font-mono text-lg text-[#263548]">{formatNumber(summary.totalPlanejado)}</strong></div><div className="col-span-2 rounded-lg bg-[#F8FAFC] p-3 sm:col-span-1"><span className="block text-[10px] text-[#64748B]">Quantidade produzida</span><strong className="mt-1 block font-mono text-lg text-[#159B72]">{formatNumber(summary.totalProduzido)}</strong></div></div>
          </div>
          <div className="p-5">
            <h4 className="text-sm font-semibold text-[#263548]">Situação de prazo <span className="text-[11px] font-normal text-[#64748B]">· clique para filtrar</span></h4>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#EEF2F6]" aria-label="Distribuição das OPs por situação de prazo">{Object.entries(situationLabels).map(([key]) => { const count = Number(summary.porSituacao[key] || 0); return count > 0 ? <button key={key} type="button" title={`${translateText(situationLabels[key])}: ${formatNumber(count)}`} onClick={() => setSituationFilter(key)} className="h-full transition-opacity hover:opacity-70" style={{ width: `${summary.totalOps > 0 ? (count / summary.totalOps) * 100 : 0}%`, backgroundColor: situationColors[key] }} aria-label={`Filtrar ${translateText(situationLabels[key])}`} /> : null; })}</div>
            <div className="mt-4 space-y-2">{Object.entries(situationLabels).map(([key, label]) => { const count = Number(summary.porSituacao[key] || 0); return <button type="button" key={key} onClick={() => setSituationFilter(key)} aria-pressed={applied.situacaoPrazo === key} className={`grid w-full grid-cols-[minmax(105px,145px)_1fr_42px] items-center gap-3 rounded-md py-1 text-left text-xs ${applied.situacaoPrazo === key ? 'font-bold' : ''}`}><span className="truncate text-[#475569]">{translateText(label)}</span><span className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full transition-all" style={{ width: `${(count / maxStatusCount) * 100}%`, backgroundColor: situationColors[key] }} /></span><span className="text-right font-mono text-[#263548]">{formatNumber(count)}</span></button>; })}</div>
            <div className="mt-6 border-t border-[#E2E8F0] pt-4"><h4 className="text-xs font-semibold text-[#263548]">Produtos por quantidade produzida</h4><p className="mt-1 text-[10px] text-[#64748B]">Principais produtos entre as OPs filtradas.</p>{summary.principaisProdutos.length ? <div className="mt-3 space-y-2.5">{summary.principaisProdutos.map((product: any) => <div key={product.codigoProduto} className="grid grid-cols-[minmax(80px,150px)_1fr_64px] items-center gap-2 text-[10px]"><span className="truncate text-[#475569]" title={`${product.codigoProduto} · ${product.descricaoProduto}`}>{product.codigoProduto} · {product.descricaoProduto}</span><span className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#C27803]" style={{ width: `${(product.quantidadeProduzida / maxProductQty) * 100}%` }} /></span><span className="text-right font-mono text-[#263548]">{formatNumber(product.quantidadeProduzida)}</span></div>)}</div> : <p className="mt-3 text-[11px] text-[#64748B]">Sem dados para os filtros selecionados.</p>}</div>
          </div>
        </div> : <div className="grid min-h-[300px] place-items-center bg-[#F8FAFC] p-6">
          <div className="w-full max-w-xl rounded-xl border border-dashed border-[#CBD5E1] bg-white px-6 py-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#F1F5F9] text-[#64748B]"><Database className="h-5 w-5" /></div>
            <h4 className="mt-3 text-sm font-semibold text-[#263548]">{loading ? 'Carregando dados da produção…' : 'Aguardando dados reais para montar o gráfico'}</h4>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[#64748B]">{error ? 'A consulta ao espelho não foi concluída. Verifique a conexão do banco e dos conectores Protheus; nenhum valor foi estimado.' : 'Assim que a consulta retornar OPs, o painel exibirá quantidades planejadas, produzidas, refugo e situação de prazo.'}</p>
            {error && <button type="button" onClick={onNavigateToConnectors} className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#263548] hover:bg-slate-50">Ver Conectores Protheus <ChevronRight className="h-3.5 w-3.5" /></button>}
          </div>
        </div>}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#DCE3EB] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3"><div><h3 className="text-sm font-semibold text-[#263548]">Ordens correspondentes</h3><p className="text-[11px] text-[#64748B]">{data ? `${formatNumber(data.total)} OPs encontradas · exibindo até 10 nesta lista` : 'Aguardando dados'}</p></div>{loading && <span className="text-xs text-[#64748B]">Consultando espelho…</span>}</div>
        {data?.items?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-[#64748B]"><tr><th className="px-4 py-3">OP / situação</th><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Cliente / PV</th><th className="px-4 py-3 text-right">Planejado</th><th className="px-4 py-3 text-right">Produzido</th><th className="px-4 py-3">Prazo</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{data.items.map((item: any) => <tr key={item.idOp} className="text-[#334155]"><td className="px-4 py-3"><span className="block font-semibold text-[#263548]">{item.numeroOp}</span><span className="text-[10px] text-[#64748B]">{item.statusProtheusOp}</span></td><td className="px-4 py-3"><span className="block font-medium">{item.codigoProduto}</span><span className="text-[10px] text-[#64748B]">{item.descricaoProduto}</span></td><td className="px-4 py-3"><span className="block">{item.clienteNome || translateText('Sem vínculo de PV')}</span><span className="text-[10px] text-[#64748B]">{item.numeroPv || '—'}</span></td><td className="px-4 py-3 text-right font-mono">{formatNumber(item.quantidadePlanejada)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(item.quantidadeProduzida)}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1" style={{ color: situationColors[item.statusPrazo] || '#64748B' }}>{item.statusPrazo === 'CONCLUIDO' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{translateText(situationLabels[item.statusPrazo] || item.statusPrazo)}</span></td></tr>)}</tbody></table></div> : data && <div className="p-8 text-center text-xs text-[#64748B]">Nenhuma OP encontrada com os filtros selecionados.</div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#DCE3EB] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C27803]">SLA &amp; Tratativa</p>
            <h3 className="mt-1 text-base font-semibold text-[#263548]">Ocorrências, backlog e tempo de resposta</h3>
            <p className="mt-1 text-xs text-[#64748B]">Métricas calculadas a partir dos atendimentos reais registrados na fábrica.</p>
          </div>
          <button type="button" onClick={() => onNavigate('occurrences')} className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#263548] transition hover:bg-slate-50">
            {translateText('Abrir Gestão de ocorrências')} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {occurrenceStats ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('Backlog ativo')}</span><ClipboardList className="h-3.5 w-3.5 text-amber-700" /></span>
                <strong className="mt-1.5 block font-mono text-xl text-[#263548]">{formatNumber(occurrenceStats.summary.activeBacklog)}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{formatNumber(occurrenceStats.summary.open)} {translateText('abertas')} · {formatNumber(occurrenceStats.summary.inProgress)} {translateText('em atendimento')}</span>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('SLA estourado')}</span><ShieldAlert className="h-3.5 w-3.5 text-rose-600" /></span>
                <strong className={`mt-1.5 block font-mono text-xl ${occurrenceStats.summary.slaBreachedActive > 0 ? 'text-rose-700' : 'text-[#263548]'}`}>{formatNumber(occurrenceStats.summary.slaBreachedActive)}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{translateText('Ocorrências ativas vencidas')}</span>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('1ª resposta (média)')}</span><Clock3 className="h-3.5 w-3.5 text-sky-700" /></span>
                <strong className="mt-1.5 block font-mono text-xl text-[#263548]">{formatDurationMinutes(occurrenceStats.responseMetrics.avgFirstResponseMinutes)}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{translateText('Mediana')}: {formatDurationMinutes(occurrenceStats.responseMetrics.medianFirstResponseMinutes)}</span>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('MTTR médio')}</span><Activity className="h-3.5 w-3.5 text-emerald-700" /></span>
                <strong className="mt-1.5 block font-mono text-xl text-[#263548]">{formatDurationMinutes(occurrenceStats.responseMetrics.avgMttrMinutes)}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{translateText('Mediana')}: {formatDurationMinutes(occurrenceStats.responseMetrics.medianMttrMinutes)}</span>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('Cumprimento SLA')}</span><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" /></span>
                <strong className="mt-1.5 block font-mono text-xl text-[#159B72]">{occurrenceStats.summary.slaCompliancePercent === null ? '—' : `${occurrenceStats.summary.slaCompliancePercent}%`}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{formatNumber(occurrenceStats.summary.resolved)} {translateText('concluídas')}</span>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <span className="flex items-center justify-between text-[11px] text-[#64748B]"><span>{translateText('Reincidências')}</span><AlertTriangle className="h-3.5 w-3.5 text-amber-700" /></span>
                <strong className="mt-1.5 block font-mono text-xl text-[#263548]">{formatNumber(occurrenceStats.summary.recurrenceCount)}</strong>
                <span className="mt-0.5 block text-[10px] text-[#64748B]">{occurrenceStats.summary.recurrenceRatePercent === null ? '—' : `${occurrenceStats.summary.recurrenceRatePercent}%`} {translateText('do total')}</span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-[#E2E8F0] p-3.5">
                <h4 className="text-xs font-semibold text-[#263548]">{translateText('Backlog por setor')}</h4>
                <div className="mt-2.5 space-y-2">
                  {occurrenceStats.backlogBySector.map((item) => (
                    <div key={item.sector} className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-[#334155]">{item.sector}</span>
                      <span className="flex items-center gap-2 font-mono text-[#263548]">
                        <span>{formatNumber(item.totalActive)}</span>
                        {item.slaBreached > 0 && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">{item.slaBreached} SLA</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] p-3.5">
                <h4 className="text-xs font-semibold text-[#263548]">{translateText('Top componentes')}</h4>
                {occurrenceStats.topComponents.length > 0 ? (
                  <div className="mt-2.5 space-y-2">
                    {occurrenceStats.topComponents.slice(0, 4).map((item) => (
                      <div key={item.componentCode} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-mono text-[#334155]" title={item.componentCode}>{item.componentCode}</span>
                        <span className="shrink-0 font-mono text-[11px] text-[#263548]">
                          {item.active} {translateText('ativas')} / {item.total}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2.5 text-[11px] text-[#64748B]">{translateText('Nenhum componente vinculado ainda.')}</p>
                )}
              </div>

              <div className="rounded-lg border border-[#E2E8F0] p-3.5">
                <h4 className="text-xs font-semibold text-[#263548]">{translateText('Top PVs afetados')}</h4>
                {occurrenceStats.topPvs.length > 0 ? (
                  <div className="mt-2.5 space-y-2">
                    {occurrenceStats.topPvs.slice(0, 4).map((item) => (
                      <div key={item.pvNumber} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-[#334155]" title={item.clienteNome || item.pvNumber}>
                          <strong className="font-mono">{item.pvNumber}</strong>{item.clienteNome ? ` · ${item.clienteNome}` : ''}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-[#263548]">
                          {item.active} {translateText('ativas')} / {item.total}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2.5 text-[11px] text-[#64748B]">{translateText('Nenhum PV vinculado ainda.')}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 text-xs text-[#64748B]">
            {occurrenceStatsError ? translateText('Indicadores de ocorrências indisponíveis no momento.') : translateText('Carregando indicadores de ocorrências…')}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Apontamentos (SH6)', stats?.totalProtheusAppointments, ClipboardList], ['Produtos cadastrados', stats?.totalProtheusProducts, Boxes], ['Estruturas (SG1)', stats?.totalProtheusStructures, Layers], ['Operações de roteiro', stats?.totalProtheusRoutings, Activity]].map(([label, value, Icon]: any) => <div key={label} className="flex items-center gap-2 rounded-lg border border-[#DCE3EB] bg-white px-3 py-3 text-xs"><Icon className="h-4 w-4 shrink-0 text-[#64748B]" /><span className="min-w-0"><span className="block truncate text-[#64748B]">{translateText(label)}</span><strong className="text-[#263548]">{value === undefined ? '—' : formatNumber(value)}</strong></span></div>)}
      </section>
    </div>
  );
};

