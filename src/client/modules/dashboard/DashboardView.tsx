import React from 'react';
import {
  Activity,
  Boxes,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  GitBranch,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { ActiveTab } from '../../components/Sidebar.tsx';

interface DashboardStats {
  totalProtheusPv: number;
  totalProtheusOp: number;
  totalProtheusProducts: number;
  totalProtheusBatches: number;
  totalProtheusStructures: number;
  totalProtheusRoutings: number;
  totalProtheusAppointments: number;
  latestProtheusImport: {
    batchCode: string;
    sourceType: string;
    entityType: string;
    recordsCount: number;
    status: string;
    createdAt: string | null;
  } | null;
}

interface DashboardViewProps {
  stats: DashboardStats | null;
  refreshing: boolean;
  refreshError: string | null;
  statsUpdatedAt: string | null;
  onRefresh: () => void;
  onNavigate: (tab: ActiveTab, subTab?: 'data-sync' | 'factory' | 'users' | 'general') => void;
}

const formatDateTime = (date: string | null | undefined) => {
  if (!date) return 'Data não informada';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? 'Data não informada'
    : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  refreshing,
  refreshError,
  statsUpdatedAt,
  onRefresh,
  onNavigate,
}) => {
  const metrics = [
    { label: 'Pedidos de venda', value: stats?.totalProtheusPv, icon: FileText, color: '#C27803', tab: 'traceability' as ActiveTab },
    { label: 'Ordens de produção', value: stats?.totalProtheusOp, icon: GitBranch, color: '#1E293B', tab: 'traceability' as ActiveTab },
    { label: 'Apontamentos recebidos', value: stats?.totalProtheusAppointments, icon: ClipboardList, color: '#0284C7', tab: 'traceability' as ActiveTab },
    { label: 'Produtos espelhados', value: stats?.totalProtheusProducts, icon: Boxes, color: '#9333EA', tab: 'settings' as ActiveTab, subTab: 'data-sync' as const },
    { label: 'Componentes de estrutura', value: stats?.totalProtheusStructures, icon: Layers, color: '#159B72', tab: 'settings' as ActiveTab, subTab: 'data-sync' as const },
    { label: 'Operações de roteiro', value: stats?.totalProtheusRoutings, icon: Activity, color: '#475569', tab: 'settings' as ActiveTab, subTab: 'data-sync' as const },
  ];
  const latestImport = stats?.latestProtheusImport;

  return (
    <div className="mx-auto max-w-[1520px] space-y-6 select-none">
      <section className="relative overflow-hidden rounded-xl border border-[#DCE3EB] bg-[#151C25] shadow-sm">
        <div className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-50" style={{ backgroundImage: "url('/assets/industrial_banner.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#151C25] via-[#151C25]/95 to-[#151C25]/45" />
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center md:p-8">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded border border-[#FFAA00]/40 bg-[#2D2415] px-2.5 py-1 text-xs font-semibold text-[#FFAA00]">
              <Database className="h-3.5 w-3.5" />
              <span>Espelho operacional do Protheus</span>
            </div>
            <h2 className="text-2xl font-bold leading-snug tracking-tight text-white">Acompanhamento da produção</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300 md:text-sm">
              Consulte pedidos, ordens, apontamentos, produtos e processos recebidos do ERP. Os indicadores abaixo mostram os registros atualmente disponíveis no espelho.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button onClick={() => onNavigate('traceability')} className="inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2.5 text-xs font-bold text-[#151C25] shadow-sm transition hover:bg-[#e69900]">
              <GitBranch className="h-4 w-4" /><span>Rastreabilidade de PV → OP</span><ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => onNavigate('settings', 'data-sync')} className="inline-flex items-center gap-2 rounded-lg border border-[#384656] bg-[#1B232E]/90 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xs transition hover:bg-[#253242]">
              <Database className="h-4 w-4" /><span>Cargas recebidas</span>
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#DCE3EB] bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#263548]">Atualização do espelho</h3>
            <p className="mt-1 text-xs text-[#64748B]">
              Painel consultado {statsUpdatedAt ? `às ${formatDateTime(statsUpdatedAt)}` : 'aguardando a primeira consulta'} · atualização automática a cada 5 minutos.
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Última carga recebida: {latestImport ? `${formatDateTime(latestImport.createdAt)} · ${latestImport.sourceType} · ${latestImport.entityType} · ${latestImport.recordsCount} registros` : 'nenhuma carga registrada'}.
            </p>
          </div>
          <button onClick={onRefresh} disabled={refreshing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#263548] transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando…' : 'Atualizar painel'}
          </button>
        </div>
        {refreshError && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">Falha ao atualizar os dados: {refreshError}</p>}
        {stats && stats.totalProtheusBatches === 0 && !refreshError && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Ainda não há cargas recebidas. Atualizar o painel consulta o espelho local; a entrada de dados do Protheus depende de uma carga ou integração configurada.</p>}
      </section>

      <section aria-label="Indicadores do espelho Protheus" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon, color, tab, subTab }) => (
          <button key={label} type="button" onClick={() => onNavigate(tab, subTab)} className="group flex items-center justify-between rounded-lg border border-l-4 border-[#DCE3EB] bg-white p-4 text-left shadow-xs transition hover:border-slate-300 hover:shadow-md" style={{ borderLeftColor: color }}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-xs" style={{ backgroundColor: color }}><Icon className="h-5 w-5" /></span>
              <span>
                <span className="block text-[11px] font-medium leading-tight text-[#64748B]">{label}</span>
                <span className="mt-1 block font-mono text-xl font-bold leading-none text-[#263548]">{value === undefined ? '—' : value.toLocaleString('pt-BR')}</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#FFAA00]" />
          </button>
        ))}
      </section>
    </div>
  );
};
