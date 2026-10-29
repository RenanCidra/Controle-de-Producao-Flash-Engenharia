import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileCode,
  RefreshCw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  TrendingUp,
  XCircle,
  Building,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api.ts';
import { TraceabilityDetailModal } from './TraceabilityDetailModal.tsx';
import { getIntlLocale } from '../../i18n/index.ts';

interface TraceabilityViewProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  initialNumeroOp?: string | null;
  onManageOccurrences: (numeroOp: string) => void;
}

export const TraceabilityView: React.FC<TraceabilityViewProps> = ({
  onSuccess,
  onError,
  initialNumeroOp,
  onManageOccurrences,
}) => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [numeroPv, setNumeroPv] = useState('');
  const [numeroOp, setNumeroOp] = useState('');
  const [cliente, setCliente] = useState('');
  const [codigoProduto, setCodigoProduto] = useState('');
  const [statusOp, setStatusOp] = useState('');
  const [statusPv, setStatusPv] = useState('');
  const [postoTrabalho, setPostoTrabalho] = useState('');
  const [apenasAtrasadas, setApenasAtrasadas] = useState(false);
  const [apenasComRefugo, setApenasComRefugo] = useState(false);
  const [semVinculoPv, setSemVinculoPv] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);

  // Data state
  const [items, setItems] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    totalOps: number;
    totalPvs: number;
    opsEmAndamento: number;
    opsConcluidas: number;
    opsAtrasadas: number;
    opsComRefugo: number;
    taxaEntregaPrazoPercentual: number | null;
  } | null>(null);

  // Modal inspection
  const [selectedOpDetail, setSelectedOpDetail] = useState<any | null>(null);
  const [selectedOpOccurrences, setSelectedOpOccurrences] = useState<any[]>([]);
  const [occurrencesError, setOccurrencesError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Advanced filters expansion
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const loadData = async (opOverride?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [matrixRes, metricsRes] = await Promise.all([
        api.getTraceabilityMatrix({
          search: opOverride ? undefined : search.trim() || undefined,
          numeroPv: numeroPv.trim() || undefined,
          numeroOp: opOverride || numeroOp.trim() || undefined,
          cliente: cliente.trim() || undefined,
          codigoProduto: codigoProduto.trim() || undefined,
          statusOp: statusOp || undefined,
          statusPv: statusPv || undefined,
          postoTrabalho: postoTrabalho.trim() || undefined,
          apenasAtrasadas: apenasAtrasadas || undefined,
          apenasComRefugo: apenasComRefugo || undefined,
          semVinculoPv: semVinculoPv || undefined,
          page,
          limit,
        }),
        api.getTraceabilityMetrics(),
      ]);

      setItems(matrixRes.items);
      setTotal(matrixRes.total);
      setMetrics(metricsRes);
    } catch (err: any) {
      const message = err.message || 'Erro ao carregar dados de rastreabilidade';
      setItems([]);
      setTotal(0);
      setMetrics(null);
      setLoadError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialNumeroOp) return;
    loadData();
  }, [page, limit, apenasAtrasadas, apenasComRefugo, semVinculoPv, statusOp, statusPv]);

  useEffect(() => {
    if (!initialNumeroOp) return;
    setNumeroOp(initialNumeroOp);
    setSearch('');
    setPage(1);
    void loadData(initialNumeroOp);
  }, [initialNumeroOp]);

  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleResetFilters = () => {
    setSearch('');
    setNumeroPv('');
    setNumeroOp('');
    setCliente('');
    setCodigoProduto('');
    setStatusOp('');
    setStatusPv('');
    setPostoTrabalho('');
    setApenasAtrasadas(false);
    setApenasComRefugo(false);
    setSemVinculoPv(false);
    setPage(1);
    setTimeout(() => {
      loadData();
    }, 50);
  };

  const handleExportCsv = async () => {
    setExporting('csv');
    try {
      await api.downloadTraceabilityCsv({
        search: search.trim() || undefined,
        numeroPv: numeroPv.trim() || undefined,
        numeroOp: numeroOp.trim() || undefined,
        cliente: cliente.trim() || undefined,
        codigoProduto: codigoProduto.trim() || undefined,
        statusOp: statusOp || undefined,
        statusPv: statusPv || undefined,
        postoTrabalho: postoTrabalho.trim() || undefined,
        apenasAtrasadas: apenasAtrasadas || undefined,
        apenasComRefugo: apenasComRefugo || undefined,
        semVinculoPv: semVinculoPv || undefined,
      });
      onSuccess('Arquivo CSV gerado e exportado com sucesso.');
    } catch (err: any) {
      onError(err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportJson = async () => {
    setExporting('json');
    try {
      await api.downloadTraceabilityJson({
        search: search.trim() || undefined,
        numeroPv: numeroPv.trim() || undefined,
        numeroOp: numeroOp.trim() || undefined,
        cliente: cliente.trim() || undefined,
        codigoProduto: codigoProduto.trim() || undefined,
        statusOp: statusOp || undefined,
        statusPv: statusPv || undefined,
        postoTrabalho: postoTrabalho.trim() || undefined,
        apenasAtrasadas: apenasAtrasadas || undefined,
        apenasComRefugo: apenasComRefugo || undefined,
        semVinculoPv: semVinculoPv || undefined,
      });
      onSuccess('Arquivo JSON estruturado gerado com sucesso.');
    } catch (err: any) {
      onError(err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleOpenOpDetail = async (numeroOp: string) => {
    setDetailLoading(true);
    setOccurrencesError(null);
    try {
      const detail = await api.getTraceabilityOpDetail(numeroOp);
      const occurrenceRows = await api.getOccurrencesForOp(numeroOp).catch((error: any) => {
        setOccurrencesError(error?.message || 'Não foi possível consultar as ocorrências desta OP.');
        return [];
      });
      setSelectedOpOccurrences(occurrenceRows);
      setSelectedOpDetail(detail);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const metricCards = [
    { label: 'Ordens (OP)', value: metrics?.totalOps ?? '—', caption: 'Cadastradas no Protheus', icon: Layers, color: '#1E293B' },
    { label: 'Pedidos (PV)', value: metrics?.totalPvs ?? '—', caption: 'Pedidos vinculáveis', icon: Building, color: '#C27803' },
    { label: 'Em Andamento', value: metrics?.opsEmAndamento ?? '—', caption: 'Com saldo aberto', icon: TrendingUp, color: '#0284C7' },
    { label: 'Concluídas', value: metrics?.opsConcluidas ?? '—', caption: 'Status finalizado', icon: CheckCircle2, color: '#159B72' },
    { label: 'Atrasadas', value: metrics?.opsAtrasadas ?? '—', caption: 'Passaram do prazo', icon: AlertTriangle, color: '#D64545' },
    { label: 'Entrega no Prazo', value: metrics?.taxaEntregaPrazoPercentual == null ? '—' : `${metrics.taxaEntregaPrazoPercentual}%`, caption: metrics?.taxaEntregaPrazoPercentual == null ? 'Sem conclusões com datas válidas' : 'OPs concluídas com prazo conhecido', icon: Clock, color: '#159B72' },
  ];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#263548] tracking-tight">
              Motor de Rastreabilidade Avançada PV ↔ OP
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA] font-bold">
              Módulo 2
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Cruzamento bidirecional de Pedidos de Venda (SC5/6), Ordens de Produção (SC2), Roteiros (SG2) e Apontamentos (SH6).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exporting !== null}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#E8F7F2] hover:bg-[#d1f2e6] text-[#159B72] border border-[#A7F3D0] text-xs font-semibold transition disabled:opacity-50"
            title="Exportar CSV formatado com delimitador ';' e UTF-8 BOM para Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting === 'csv' ? 'Gerando...' : 'Exportar CSV'}
          </button>
          <button
            onClick={handleExportJson}
            disabled={exporting !== null}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F0F4FF] hover:bg-[#e0e9ff] text-[#2684D9] border border-[#C7D9FB] text-xs font-semibold transition disabled:opacity-50"
            title="Exportar dump estruturado em formato JSON"
          >
            <FileCode className="h-4 w-4" />
            {exporting === 'json' ? 'Gerando...' : 'Exportar JSON'}
          </button>
          <button
            onClick={() => loadData()}
            className="p-2 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-[#DCE3EB] transition shadow-xs"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#FFAA00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Rastreabilidade KPIs styled consistently with the general dashboard */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map(({ label, value, caption, icon: Icon, color }) => (
          <div key={label} className="flex items-center rounded-lg border border-l-4 border-[#DCE3EB] bg-white p-4 text-left shadow-xs" style={{ borderLeftColor: color }}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-xs" style={{ backgroundColor: color }}><Icon className="h-5 w-5" /></span>
              <span>
                <span className="block text-[11px] font-medium leading-tight text-[#64748B]">{label}</span>
                <span className="mt-1 block font-mono text-xl font-bold leading-none text-[#263548]">{typeof value === 'number' ? value.toLocaleString(getIntlLocale()) : value}</span>
                <span className="mt-1 block text-[10px] text-[#64748B]">{caption}</span>
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Filter Toolbar Card */}
      <div className="p-4 rounded-xl bg-[#151C25] border border-[#202936] space-y-3 shadow-sm">
        <form onSubmit={handleApplyFilter} className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por OP, PV, Código ou Descrição do Produto..."
              className="w-full pl-9 pr-4 py-2 bg-[#1C2532] border border-[#263342] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FFAA00]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Filtrar Cliente (Razão / CNPJ)"
              className="px-3 py-2 bg-[#1C2532] border border-[#263342] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FFAA00] w-44"
            />

            <select
              value={statusOp}
              onChange={(e) => setStatusOp(e.target.value)}
              className="px-3 py-2 bg-[#1C2532] border border-[#263342] rounded-lg text-xs text-white focus:outline-none focus:border-[#FFAA00]"
            >
              <option value="">Status OP (Todos)</option>
              <option value="A">Aberto / Em Processo</option>
              <option value="F">Firme / Liberada</option>
              <option value="E">Encerrada</option>
            </select>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                showAdvancedFilters || postoTrabalho || numeroPv || numeroOp || codigoProduto || statusPv
                  ? 'bg-[#2A2316] border-[#FFAA00] text-[#FFAA00]'
                  : 'bg-[#1C2532] border-[#263342] text-slate-300 hover:text-white hover:bg-[#253242]'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros Avançados
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold text-xs transition shadow-xs"
            >
              Filtrar
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              className="p-2 rounded-lg bg-[#1C2532] hover:bg-[#253242] text-slate-400 hover:text-white border border-[#263342] text-xs transition shadow-xs"
              title="Limpar todos os filtros"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Advanced Filters Expandable Row */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-[#202936] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Número OP Específico</label>
              <input
                type="text"
                value={numeroOp}
                onChange={(e) => setNumeroOp(e.target.value)}
                placeholder="Ex: 00010101001"
                className="w-full px-3 py-1.5 bg-[#1C2532] border border-[#263342] rounded text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Número PV Específico</label>
              <input
                type="text"
                value={numeroPv}
                onChange={(e) => setNumeroPv(e.target.value)}
                placeholder="Ex: 001234"
                className="w-full px-3 py-1.5 bg-[#1C2532] border border-[#263342] rounded text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Código do Produto</label>
              <input
                type="text"
                value={codigoProduto}
                onChange={(e) => setCodigoProduto(e.target.value)}
                placeholder="Ex: PA-001"
                className="w-full px-3 py-1.5 bg-[#1C2532] border border-[#263342] rounded text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Posto de Trabalho / Recurso</label>
              <input
                type="text"
                value={postoTrabalho}
                onChange={(e) => setPostoTrabalho(e.target.value)}
                placeholder="Ex: USINAGEM-01"
                className="w-full px-3 py-1.5 bg-[#1C2532] border border-[#263342] rounded text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>
          </div>
        )}

        {/* Quick boolean tag toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Filtros rápidos:</span>
          <button
            type="button"
            onClick={() => setApenasAtrasadas(!apenasAtrasadas)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
              apenasAtrasadas
                ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                : 'bg-[#1C2532] text-slate-300 border-[#263342] hover:bg-[#253242]'
            }`}
          >
            Apenas OPs Atrasadas
          </button>
          <button
            type="button"
            onClick={() => setApenasComRefugo(!apenasComRefugo)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
              apenasComRefugo
                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                : 'bg-[#1C2532] text-slate-300 border-[#263342] hover:bg-[#253242]'
            }`}
          >
            Apenas com Refugo / Sucata
          </button>
          <button
            type="button"
            onClick={() => setSemVinculoPv(!semVinculoPv)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
              semVinculoPv
                ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                : 'bg-[#1C2532] text-slate-300 border-[#263342] hover:bg-[#253242]'
            }`}
          >
            OPs para Estoque (Sem PV)
          </button>
        </div>
      </div>

      {/* Traceability Matrix Table Card Container */}
      <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
        {loadError ? (
          <div role="alert" className="p-8 text-center">
            <h3 className="text-base font-bold text-rose-300">Falha ao carregar rastreabilidade</h3>
            <p className="mt-2 text-xs text-slate-300">{loadError}</p>
            <button onClick={() => void loadData(initialNumeroOp || undefined)} className="mt-4 rounded-lg border border-[#263342] bg-[#1C2532] px-4 py-2 text-xs font-semibold text-white">Tentar novamente</button>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">Carregando dados de produção…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-xl bg-[#1C2532] border border-[#263342] flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white">Nenhum registro de produção localizado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Não foram encontradas ordens de produção ou pedidos de venda correspondentes aos critérios de busca ativos.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {(search || numeroPv || numeroOp || cliente || statusOp || apenasAtrasadas || apenasComRefugo || semVinculoPv) ? (
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-lg bg-[#1C2532] hover:bg-[#253242] text-white font-semibold text-xs border border-[#263342] transition shadow-xs"
                >
                  Limpar Filtros de Busca
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#121820] text-slate-400 font-semibold uppercase tracking-wider border-b border-[#202936]">
                <tr>
                  <th className="py-3 px-3.5">OP / Status</th>
                  <th className="py-3 px-3.5">Produto Fabricado</th>
                  <th className="py-3 px-3.5">Vínculo Pedido de Venda (PV)</th>
                  <th className="py-3 px-3.5">Etapa Atual / Recurso</th>
                  <th className="py-3 px-3.5 text-right">Planejado / Produzido</th>
                  <th className="py-3 px-3.5 text-right">Saldo / Refugo</th>
                  <th className="py-3 px-3.5">Progresso Físico</th>
                  <th className="py-3 px-3.5">Prazo & Previsão</th>
                  <th className="py-3 px-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202936] font-sans">
                {items.map((row) => (
                  <tr
                    key={row.idOp}
                    className="hover:bg-[#1C2532] transition group"
                  >
                    {/* OP Number & Status */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#FFAA00] text-xs">
                          {row.numeroOp}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C2532] text-slate-300 border border-[#263342]">
                          {row.statusProtheusOp}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        Emissão: {row.dataEmissaoOp}
                      </span>
                      {row.possuiDivergencia && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#D64545] mt-0.5 font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {row.motivoDivergencia}
                        </span>
                      )}
                    </td>

                    {/* Product */}
                    <td className="py-3 px-3.5 max-w-xs">
                      <span className="font-mono font-semibold text-white block truncate">
                        {row.codigoProduto}
                      </span>
                      <p className="text-slate-400 text-[11px] truncate" title={row.descricaoProduto}>
                        {row.descricaoProduto}
                      </p>
                    </td>

                    {/* PV Link */}
                    <td className="py-3 px-3.5 max-w-xs">
                      {row.temVinculoPv ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#FFAA00]">
                              PV {row.numeroPv}
                            </span>
                            {row.itemPv && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                (Item {row.itemPv})
                              </span>
                            )}
                          </div>
                          <p className="text-slate-200 text-[11px] font-medium truncate" title={row.clienteNome || ''}>
                            {row.clienteNome || 'Cliente cadastrado'}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            Entrega PV: {row.dataEntregaPv || '-'}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[11px] text-slate-500 italic">
                            Sem PV direto (Ordem de Estoque)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Stage & Workstation */}
                    <td className="py-3 px-3.5">
                      <span className="text-white font-medium block">
                        {row.etapaAtual}
                      </span>
                      {row.postoTrabalhoAtual && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Recurso: {row.postoTrabalhoAtual}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono block">
                        Apontamentos: {row.totalApontamentosCount}
                      </span>
                    </td>

                    {/* Planned vs Produced */}
                    <td className="py-3 px-3.5 text-right font-mono">
                      <span className="text-slate-400 text-[11px] block">
                        Planejado: <strong className="text-white">{row.quantidadePlanejada.toLocaleString(getIntlLocale())}</strong>
                      </span>
                      <span className="text-[#159B72] font-bold block">
                        Produzido: {row.quantidadeProduzida.toLocaleString(getIntlLocale())}
                      </span>
                    </td>

                    {/* Saldo vs Scrap */}
                    <td className="py-3 px-3.5 text-right font-mono">
                      <span className="text-[#FFAA00] font-medium block">
                        Saldo: {row.saldoAProduzir.toLocaleString(getIntlLocale())}
                      </span>
                      {row.quantidadeRefugo > 0 ? (
                        <span className="text-[#D64545] text-[11px] font-bold block">
                          Perda: {row.quantidadeRefugo.toLocaleString(getIntlLocale())}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px] block">Sem perda</span>
                      )}
                    </td>

                    {/* Physical Progress */}
                    <td className="py-3 px-3.5 min-w-[130px]">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono font-bold text-white">{row.percentualConclusao == null ? '—' : `${row.percentualConclusao}%`}</span>
                      </div>
                      {row.percentualConclusao != null && <div className="w-full h-1.5 bg-[#1C2532] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${row.percentualConclusao === 100 ? 'bg-[#159B72]' : row.percentualConclusao > 0 ? 'bg-[#FFAA00]' : 'bg-slate-700'}`} style={{ width: `${row.percentualConclusao}%` }} />
                      </div>}
                    </td>

                    {/* Deadline Status */}
                    <td className="py-3 px-3.5">
                      {row.statusPrazo === 'CONCLUIDO' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#159B72] bg-[#132B25] px-2 py-0.5 rounded border border-[#159B72]/30">
                          <CheckCircle2 className="h-3 w-3" /> Concluída
                        </span>
                      ) : row.statusPrazo === 'ATRASADO' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                            <XCircle className="h-3 w-3" /> Atrasado ({Math.abs(row.diasAtrasoOuFolga || 0)}d)
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Prev: {row.dataPrevisaoFimOp}
                          </span>
                        </div>
                      ) : row.statusPrazo === 'RISCO_ATRASO' ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FFAA00] bg-[#2A2316] px-2 py-0.5 rounded border border-[#FFAA00]/40">
                            <AlertTriangle className="h-3 w-3" /> Risco ({row.diasAtrasoOuFolga}d)
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Prev: {row.dataPrevisaoFimOp}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2684D9] bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800">
                            <Clock className="h-3 w-3" /> No Prazo ({row.diasAtrasoOuFolga}d)
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Prev: {row.dataPrevisaoFimOp}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 text-center">
                      <button
                        onClick={() => handleOpenOpDetail(row.numeroOp)}
                        disabled={detailLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-[#1C2532] hover:bg-[#FFAA00] hover:text-[#151C25] text-white font-semibold text-xs border border-[#263342] transition flex items-center gap-1.5 mx-auto shadow-xs"
                        title="Ver Ficha de Rastreabilidade 360°"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        360°
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {total > 0 && (
          <div className="p-4 border-t border-[#202936] bg-[#121820] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Exibindo <strong className="text-white">{(page - 1) * limit + 1}</strong> a{' '}
              <strong className="text-white">{Math.min(page * limit, total)}</strong> de{' '}
              <strong className="text-white">{total}</strong> ordens rastreadas
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 bg-[#1C2532] border border-[#263342] rounded text-xs text-white"
              >
                <option value={10}>10 por página</option>
                <option value={25}>25 por página</option>
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
              </select>

              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 bg-[#1C2532] border border-[#263342] rounded text-slate-300 hover:text-white hover:bg-[#253242] disabled:opacity-40 transition shadow-xs"
              >
                Anterior
              </button>
              <span className="font-mono font-medium text-white">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 bg-[#1C2532] border border-[#263342] rounded text-slate-300 hover:text-white hover:bg-[#253242] disabled:opacity-40 transition shadow-xs"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 360-degree Detail Modal */}
      {selectedOpDetail && (
        <TraceabilityDetailModal
          detail={selectedOpDetail}
          occurrences={selectedOpOccurrences}
          occurrencesError={occurrencesError}
          canCreateOccurrence={api.getUser()?.role !== 'AUDITOR'}
          onManageOccurrences={() => onManageOccurrences(selectedOpDetail.op.numeroOp)}
          onClose={() => { setSelectedOpDetail(null); setSelectedOpOccurrences([]); }}
        />
      )}
    </div>
  );
};

