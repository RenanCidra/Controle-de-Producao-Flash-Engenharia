import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  X,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { api } from '../../api.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { getIntlLocale } from '../../i18n/index.ts';

interface AuditViewProps {
  logs?: any[];
  onReload?: () => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ logs: initialLogs, onReload }) => {
  const [logs, setLogs] = useState<any[]>(initialLogs || []);
  const [total, setTotal] = useState<number>(initialLogs?.length || 0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Detail Modal
  const [activeLog, setActiveLog] = useState<any | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchLogs = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await api.getAuditLogs({
          page: targetPage,
          pageSize: targetPageSize,
          entity: selectedEntity !== 'ALL' ? selectedEntity : undefined,
          action: selectedAction !== 'ALL' ? selectedAction : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
          search: searchQuery.trim() || undefined,
        });

        if (Array.isArray(res)) {
          setLogs(res);
          setTotal(res.length);
          setTotalPages(1);
          setPage(1);
        } else {
          setLogs(res.items || []);
          setTotal(res.total ?? 0);
          setTotalPages(res.totalPages ?? 1);
          setPage(Math.min(res.page ?? targetPage, Math.max(1, res.totalPages ?? 1)));
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
        setLogs([]);
        setTotal(0);
        setTotalPages(1);
        setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar os eventos de auditoria.');
      } finally {
        setLoading(false);
      }
    },
    [pageSize, selectedEntity, selectedAction, selectedStatus, searchQuery]
  );

  useEffect(() => {
    fetchLogs(page, pageSize);
  }, [fetchLogs, page, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setSelectedEntity('ALL');
    setSelectedAction('ALL');
    setSelectedStatus('ALL');
    setPage(1);
  };

  const handleRefresh = async () => {
    if (onReload) onReload();
    await fetchLogs(page, pageSize);
  };

  const handleCopyDetails = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAuditDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data inválida' : date.toLocaleString(getIntlLocale());
  };

  const safeAuditDetails = (details: any): any => {
    let parsed = details;
    if (typeof details === 'string') {
      try { parsed = JSON.parse(details); } catch { return details; }
    }
    const sensitive = /password|senha|secret|token|authorization|credential|api.?key|hash/i;
    const scrub = (value: any): any => {
      if (Array.isArray(value)) return value.map(scrub);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitive.test(key) ? '[REDACTED]' : scrub(nested)]));
    };
    return scrub(parsed);
  };

  const formattedDetails = (details: any, pretty = false) => {
    const safe = safeAuditDetails(details);
    return typeof safe === 'string' ? safe : JSON.stringify(safe, null, pretty ? 2 : undefined);
  };

  const getActionBadgeColor = (action: string) => {
    switch (action?.toUpperCase()) {
      case 'CREATE':
      case 'IMPORT':
      case 'SYNC':
        return 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60';
      case 'UPDATE':
        return 'bg-sky-950/70 text-sky-400 border border-sky-800/60';
      case 'DELETE':
        return 'bg-rose-950/70 text-rose-400 border border-rose-800/60';
      case 'LOGIN':
        return 'bg-indigo-950/70 text-indigo-400 border border-indigo-800/60';
      case 'LOGOUT':
        return 'bg-slate-800/80 text-slate-300 border border-slate-700/60';
      case 'PASSWORD_RESET':
        return 'bg-amber-950/70 text-amber-400 border border-amber-800/60';
      case 'TEST_INTEGRATION':
        return 'bg-purple-950/70 text-purple-400 border border-purple-800/60';
      default:
        return 'bg-[#1C2532] text-slate-300 border border-[#263342]';
    }
  };

  const getActionLabel = (action?: string) => ({
    CREATE: 'Criado', UPDATE: 'Alterado', DELETE: 'Excluído', LOGIN: 'Entrada',
    LOGOUT: 'Saída', PASSWORD_RESET: 'Senha redefinida', IMPORT: 'Importação',
    SYNC: 'Sincronização', TEST_INTEGRATION: 'Teste de integração',
  } as Record<string, string>)[action?.toUpperCase() || ''] || action || 'Evento';

  const getEntityLabel = (entity?: string) => ({
    PRODUCTION_ORDER: 'Ordem de produção', PRODUCTION_ORDERS: 'Ordens de produção',
    SALES_ORDER: 'Pedido de venda', SALES_ORDERS: 'Pedidos de venda',
    PROTHEUS_SYNC: 'Protheus', AUTH: 'Acesso', USER: 'Usuário', QUALITY: 'Qualidade',
    INVENTORY: 'Estoque', PRODUCTION_LINE: 'Posto de trabalho', ORGANIZATION: 'Unidade',
    INTEGRATION: 'Integração', SYSTEM: 'Sistema',
  } as Record<string, string>)[entity?.toUpperCase() || ''] || entity || 'Registro';

  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(total, page * pageSize);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">Eventos e Trilha de Auditoria</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro imutável de mutações, apontamentos, autenticações e operações do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3.5 py-2 bg-[#1C2532] hover:bg-[#253242] disabled:opacity-60 text-slate-200 border border-[#263342] rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#151C25] border border-[#202936] rounded-xl p-3.5 space-y-3 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por termo, usuário, IP ou dados..."
              className="w-full bg-[#10161E] border border-[#263342] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-[#FFAA00]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold text-xs rounded-lg transition"
          >
            Buscar
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Entidade</label>
            <select
              value={selectedEntity}
              onChange={(e) => {
                setSelectedEntity(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#10161E] border border-[#263342] rounded-lg px-2.5 py-1.5 text-white focus:outline-hidden focus:border-[#FFAA00]"
            >
              <option value="ALL">Todas as entidades</option>
              <option value="PRODUCTION_ORDER">Ordens de Produção</option>
              <option value="INVENTORY">Estoque de Insumos</option>
              <option value="PRODUCTION_LINE">Linhas e Postos</option>
              <option value="QUALITY">Controle de Qualidade</option>
              <option value="USER">Contas de Acesso</option>
              <option value="ORGANIZATION">Organização / Planta</option>
              <option value="INTEGRATION">Integrações e Sensores</option>
              <option value="PROTHEUS_SYNC">Sincronização Protheus</option>
              <option value="AUTH">Autenticação e Sessões</option>
              <option value="SYSTEM">Sistema</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Ação</label>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#10161E] border border-[#263342] rounded-lg px-2.5 py-1.5 text-white focus:outline-hidden focus:border-[#FFAA00]"
            >
              <option value="ALL">Todas as ações</option>
              <option value="CREATE">CREATE (Criação)</option>
              <option value="UPDATE">UPDATE (Alteração)</option>
              <option value="DELETE">DELETE (Exclusão)</option>
              <option value="LOGIN">LOGIN (Entrada)</option>
              <option value="LOGOUT">LOGOUT (Saída)</option>
              <option value="PASSWORD_RESET">PASSWORD_RESET (Senha)</option>
              <option value="IMPORT">IMPORT (Importação)</option>
              <option value="SYNC">SYNC (Sincronização)</option>
              <option value="TEST_INTEGRATION">TEST (Teste Conexão)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#10161E] border border-[#263342] rounded-lg px-2.5 py-1.5 text-white focus:outline-hidden focus:border-[#FFAA00]"
            >
              <option value="ALL">Todos os status</option>
              <option value="SUCCESS">Sucesso</option>
              <option value="FAILURE">Falha</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleClearFilters}
              type="button"
              className="w-full px-3 py-1.5 bg-[#1C2532] hover:bg-[#253242] text-slate-300 border border-[#263342] rounded-lg transition font-medium text-center"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-900/70 bg-rose-950/30 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1"><p className="font-semibold">Falha ao carregar auditoria</p><p className="mt-1 text-xs text-rose-200/80">{loadError}</p></div>
          <button onClick={() => fetchLogs(page, pageSize)} className="rounded border border-rose-800 px-3 py-1 text-xs font-semibold hover:bg-rose-900/40">Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-[#202936] bg-[#151C25] px-4 py-8 text-center text-sm text-slate-400">Carregando eventos registrados…</div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum evento registrado."
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#10161E] text-slate-400 uppercase font-semibold border-b border-[#202936]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Data / Hora</th>
                  <th className="py-3 px-4">Evento</th>
                  <th className="py-3 px-4">Registro</th>
                  <th className="py-3 px-4">Autor</th>
                  <th className="py-3 px-4">Resultado</th>
                  <th className="py-3 px-4 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202936]">
                {logs.map((log) => {
                  const isSuccess = log.status === 'SUCCESS';
                  const isFailure = log.status === 'FAILURE';
                  return (
                    <tr key={log.id} className="hover:bg-[#1C2532]/70 transition">
                      <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatAuditDate(log.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2"><span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] font-bold ${getActionBadgeColor(log.action)}`}>{getActionLabel(log.action)}</span><span className="font-semibold text-white">{getEntityLabel(log.entity)}</span></div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">{log.entityId || '—'}</td>
                      <td className="py-3 px-4 font-mono text-slate-300 max-w-[160px] truncate" title={log.userEmail || log.userId || ''}>
                        {log.userEmail || log.userId || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </span>
                        ) : isFailure ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                            <AlertCircle className="h-3 w-3" />
                            Falha
                          </span>
                        ) : <span className="text-slate-400">{log.status || 'Não informado'}</span>}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setActiveLog(log)}
                          className="px-2.5 py-1 bg-[#1C2532] hover:bg-[#253242] border border-[#263342] rounded-md text-[11px] text-slate-200 font-medium inline-flex items-center gap-1 transition"
                        >
                          <Eye className="h-3 w-3 text-slate-400" />
                          Inspecionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="bg-[#10161E] border-t border-[#202936] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span>
                Mostrando <strong className="text-white">{startRecord}</strong> - <strong className="text-white">{endRecord}</strong> de <strong className="text-white">{total}</strong> registros
              </span>
              <div className="flex items-center gap-1.5 pl-2 border-l border-[#263342]">
                <span>Itens:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-[#151C25] border border-[#263342] rounded px-1.5 py-1 text-white text-xs focus:outline-hidden"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 self-center sm:self-auto">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1 || loading}
                title="Primeira Página"
                className="p-1.5 rounded bg-[#151C25] hover:bg-[#1C2532] disabled:opacity-40 disabled:cursor-not-allowed border border-[#263342] text-slate-300"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                title="Página Anterior"
                className="p-1.5 rounded bg-[#151C25] hover:bg-[#1C2532] disabled:opacity-40 disabled:cursor-not-allowed border border-[#263342] text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="px-3 py-1 bg-[#151C25] border border-[#263342] rounded text-white font-mono text-xs">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                title="Próxima Página"
                className="p-1.5 rounded bg-[#151C25] hover:bg-[#1C2532] disabled:opacity-40 disabled:cursor-not-allowed border border-[#263342] text-slate-300"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || loading}
                title="Última Página"
                className="p-1.5 rounded bg-[#151C25] hover:bg-[#1C2532] disabled:opacity-40 disabled:cursor-not-allowed border border-[#263342] text-slate-300"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspector Modal */}
      {activeLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#151C25] border border-[#263342] rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-[#10161E] border-b border-[#202936] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`px-2 py-0.5 rounded-sm text-xs font-bold ${getActionBadgeColor(activeLog.action)}`}>
                  {getActionLabel(activeLog.action)}
                </span>
                <h4 className="text-sm font-bold text-white">
                  {getEntityLabel(activeLog.entity)} {activeLog.entityId ? `#${activeLog.entityId}` : ''}
                </h4>
              </div>
              <button
                onClick={() => setActiveLog(null)}
                className="text-slate-400 hover:text-white transition p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#10161E] p-3 rounded-lg border border-[#202936]">
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">Data / Hora</span>
                  <span className="font-mono text-slate-200">
                    {formatAuditDate(activeLog.createdAt)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">Autor</span>
                  <span className="font-mono text-slate-200 truncate block" title={activeLog.userEmail || activeLog.userId || ''}>
                    {activeLog.userEmail || activeLog.userId || '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">IP</span>
                  <span className="font-mono text-slate-200">{activeLog.ipAddress || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold text-slate-500">Status</span>
                  <span className={activeLog.status === 'FAILURE' ? 'text-rose-400 font-bold' : activeLog.status === 'SUCCESS' ? 'text-emerald-400 font-bold' : 'text-slate-300 font-semibold'}>
                    {activeLog.status || 'Não informado'}
                  </span>
                </div>
              </div>

              {activeLog.userAgent && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-400 mb-1">Agente / Navegador</span>
                  <div className="bg-[#10161E] border border-[#202936] rounded-lg p-2.5 font-mono text-[11px] text-slate-300 break-all">
                    {activeLog.userAgent}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">Conteúdo dos Detalhes</span>
                  <button
                    onClick={() => handleCopyDetails(formattedDetails(activeLog.details))}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copiado' : 'Copiar JSON'}
                  </button>
                </div>
                <pre className="bg-[#10161E] border border-[#202936] rounded-lg p-3 font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                  {(() => {
                    try {
                      return formattedDetails(activeLog.details, true);
                    } catch {
                      return activeLog.details || 'Sem detalhes adicionais.';
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#10161E] border-t border-[#202936] flex justify-end">
              <button
                onClick={() => setActiveLog(null)}
                className="px-4 py-1.5 bg-[#1C2532] hover:bg-[#253242] border border-[#263342] text-slate-200 rounded-lg text-xs font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
