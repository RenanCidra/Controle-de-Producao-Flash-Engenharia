import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Boxes, CheckCircle2, ChevronRight, ClipboardList,
  Database, FileText, Filter, GitBranch, Layers, RefreshCw, Search, X,
} from 'lucide-react';
import { ActiveTab } from '../../components/Sidebar.tsx';
import { api } from '../../api.ts';
import { translateText } from '../../i18n/index.ts';

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
}

const formatDateTime = (date: string | null | undefined) => {
  if (!date) return 'Data não informada';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'Data não informada' : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const situationLabels: Record<string, string> = {
  ATRASADO: 'Atrasadas', RISCO_ATRASO: 'Em risco (até 2 dias)', NO_PRAZO: 'No prazo',
  CONCLUIDO: 'Concluídas', SEM_PREVISAO: 'Sem previsão',
};
const situationColors: Record<string, string> = {
  ATRASADO: '#DC2626', RISCO_ATRASO: '#D97706', NO_PRAZO: '#0284C7', CONCLUIDO: '#159B72', SEM_PREVISAO: '#64748B',
};

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, refreshing, refreshError, statsUpdatedAt, onRefresh, onNavigate, onNavigateToConnectors }) => {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const loadProduction = useCallback(async (filters: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTraceabilityMatrix({ ...filters, situacaoPrazo: (filters.situacaoPrazo || undefined) as any, page: 1, limit: 10 });
      setData(result);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Não foi possível carregar os dados de produção.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProduction(applied); }, [applied, loadProduction]);

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

  return (
    <div className="mx-auto max-w-[1520px] space-y-5 select-none">
      <section className="relative overflow-hidden rounded-xl border border-[#DCE3EB] bg-[#151C25] shadow-sm">
        <div className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-50" style={{ backgroundImage: "url('/assets/industrial_banner.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#151C25] via-[#151C25]/95 to-[#151C25]/45" />
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center md:p-8">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded border border-[#FFAA00]/40 bg-[#2D2415] px-2.5 py-1 text-xs font-semibold text-[#FFAA00]"><Database className="h-3.5 w-3.5" /><span>Espelho operacional do Protheus</span></div>
            <h2 className="text-2xl font-bold leading-snug tracking-tight text-white">Situação da produção</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300 md:text-sm">Indicadores calculados a partir das OPs, quantidades e prazos existentes no espelho do Protheus.</p>
          </div>
          <button onClick={() => onNavigate('traceability')} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2.5 text-xs font-bold text-[#151C25] shadow-sm transition hover:bg-[#e69900]"><GitBranch className="h-4 w-4" /><span>Rastreabilidade PV → OP</span><ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#263548]">Atualização do espelho</h3>
            <p className="mt-1 text-xs text-[#64748B]">Painel consultado {statsUpdatedAt ? `às ${formatDateTime(statsUpdatedAt)}` : 'aguardando a primeira consulta'} · atualização automática a cada 5 minutos.</p>
            <p className="mt-1 text-xs text-[#64748B]">Última carga recebida: {stats?.latestProtheusImport ? `${formatDateTime(stats.latestProtheusImport.createdAt)} · ${stats.latestProtheusImport.sourceType} · ${stats.latestProtheusImport.entityType} · ${stats.latestProtheusImport.recordsCount} registros` : 'nenhuma carga registrada'}.</p>
          </div>
          <button onClick={() => { onRefresh(); void loadProduction(applied); }} disabled={refreshing || loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#263548] transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshing || loading ? 'animate-spin' : ''}`} />{refreshing || loading ? 'Atualizando…' : 'Atualizar painel'}</button>
        </div>
        {(refreshError || error) && <div role="alert" className="mt-3 flex flex-col gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold text-rose-800">{translateText('Dados do espelho indisponíveis')}</p><p className="mt-0.5 text-xs text-rose-700">{translateText(error || refreshError || '')}</p></div><button type="button" onClick={onNavigateToConnectors} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 sm:self-auto">{translateText('Ver Conectores Protheus')} <ChevronRight className="h-3.5 w-3.5" /></button></div>}
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
        {metrics.map(({ label, value, icon: Icon, color }) => <div key={label} className="flex items-center rounded-lg border border-l-4 border-[#DCE3EB] bg-white p-4 shadow-xs" style={{ borderLeftColor: color }}><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}><Icon className="h-5 w-5" /></span><span><span className="block text-[11px] font-medium text-[#64748B]">{translateText(label)}</span><span className="mt-1 block font-mono text-xl font-bold leading-none text-[#263548]">{value === undefined ? '—' : typeof value === 'number' ? formatNumber(value) : value}</span></span></span></div>)}
      </section>

      {summary && <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
          <h3 className="text-sm font-semibold text-[#263548]">Situação de prazo <span className="text-xs font-normal text-[#64748B]">· clique para filtrar</span></h3>
          <div className="mt-4 space-y-3">{Object.entries(situationLabels).map(([key, label]) => {
            const count = summary.porSituacao[key] || 0;
            return <button type="button" key={key} onClick={() => setSituationFilter(key)} aria-pressed={applied.situacaoPrazo === key} className={`grid w-full grid-cols-[minmax(100px,150px)_1fr_42px] items-center gap-3 rounded-md text-left text-xs ${applied.situacaoPrazo === key ? 'font-bold' : ''}`}><span className="truncate text-[#475569]">{translateText(label)}</span><span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full transition-all" style={{ width: `${(count / maxStatusCount) * 100}%`, backgroundColor: situationColors[key] }} /></span><span className="text-right font-mono text-[#263548]">{formatNumber(count)}</span></button>;
          })}</div>
        </div>
        <div className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
          <h3 className="text-sm font-semibold text-[#263548]">Produtos com maior quantidade produzida</h3>
          <p className="mt-1 text-[11px] text-[#64748B]">Soma das quantidades informadas nas OPs que atendem aos filtros.</p>
          {summary.principaisProdutos.length ? <div className="mt-4 space-y-3">{summary.principaisProdutos.map((product: any) => <div key={product.codigoProduto} className="grid grid-cols-[minmax(100px,180px)_1fr_70px] items-center gap-3 text-xs"><span className="truncate text-[#475569]" title={`${product.codigoProduto} · ${product.descricaoProduto}`}>{product.codigoProduto} · {product.descricaoProduto}</span><span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#C27803]" style={{ width: `${(product.quantidadeProduzida / maxProductQty) * 100}%` }} /></span><span className="text-right font-mono text-[#263548]">{formatNumber(product.quantidadeProduzida)}</span></div>)}</div> : <p className="mt-5 text-xs text-[#64748B]">Sem dados de produção para os filtros selecionados.</p>}
        </div>
      </section>}

      <section className="overflow-hidden rounded-lg border border-[#DCE3EB] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3"><div><h3 className="text-sm font-semibold text-[#263548]">Ordens correspondentes</h3><p className="text-[11px] text-[#64748B]">{data ? `${formatNumber(data.total)} OPs encontradas · exibindo até 10 nesta lista` : 'Aguardando dados'}</p></div>{loading && <span className="text-xs text-[#64748B]">Consultando espelho…</span>}</div>
        {data?.items?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-[#64748B]"><tr><th className="px-4 py-3">OP / situação</th><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Cliente / PV</th><th className="px-4 py-3 text-right">Planejado</th><th className="px-4 py-3 text-right">Produzido</th><th className="px-4 py-3">Prazo</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{data.items.map((item: any) => <tr key={item.idOp} className="text-[#334155]"><td className="px-4 py-3"><span className="block font-semibold text-[#263548]">{item.numeroOp}</span><span className="text-[10px] text-[#64748B]">{item.statusProtheusOp}</span></td><td className="px-4 py-3"><span className="block font-medium">{item.codigoProduto}</span><span className="text-[10px] text-[#64748B]">{item.descricaoProduto}</span></td><td className="px-4 py-3"><span className="block">{item.clienteNome || translateText('Sem vínculo de PV')}</span><span className="text-[10px] text-[#64748B]">{item.numeroPv || '—'}</span></td><td className="px-4 py-3 text-right font-mono">{formatNumber(item.quantidadePlanejada)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(item.quantidadeProduzida)}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1" style={{ color: situationColors[item.statusPrazo] || '#64748B' }}>{item.statusPrazo === 'CONCLUIDO' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{translateText(situationLabels[item.statusPrazo] || item.statusPrazo)}</span></td></tr>)}</tbody></table></div> : data && <div className="p-8 text-center text-xs text-[#64748B]">Nenhuma OP encontrada com os filtros selecionados.</div>}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Apontamentos (SH6)', stats?.totalProtheusAppointments, ClipboardList], ['Produtos cadastrados', stats?.totalProtheusProducts, Boxes], ['Estruturas (SG1)', stats?.totalProtheusStructures, Layers], ['Operações de roteiro', stats?.totalProtheusRoutings, Activity]].map(([label, value, Icon]: any) => <div key={label} className="flex items-center gap-2 rounded-lg border border-[#DCE3EB] bg-white px-3 py-3 text-xs"><Icon className="h-4 w-4 shrink-0 text-[#64748B]" /><span className="min-w-0"><span className="block truncate text-[#64748B]">{translateText(label)}</span><strong className="text-[#263548]">{value === undefined ? '—' : formatNumber(value)}</strong></span></div>)}
      </section>
    </div>
  );
};

