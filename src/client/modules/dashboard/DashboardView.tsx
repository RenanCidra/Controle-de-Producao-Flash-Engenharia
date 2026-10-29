import React from 'react';
import {
  FileText,
  GitBranch,
  ShieldCheck,
  Layers,
  Boxes,
  Activity,
  ChevronRight,
  Database,
  Link2,
} from 'lucide-react';
import { ActiveTab } from '../../components/Sidebar.tsx';

interface DashboardViewProps {
  stats: {
    totalUsers?: number;
    totalInventoryItems?: number;
    totalProductionLines?: number;
    totalProductionOrders?: number;
    totalQualityInspections?: number;
    totalIntegrations?: number;
    totalAuditLogs?: number;
    totalProtheusPv?: number;
    totalProtheusOp?: number;
    totalProtheusProducts?: number;
    totalProtheusBatches?: number;
  } | null;
  onNavigate: (tab: ActiveTab, subTab?: 'data-sync' | 'factory' | 'users' | 'general') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, onNavigate }) => {
  return (
    <div className="space-y-6 max-w-[1520px] mx-auto select-none">
      {/* Hero Banner with Industrial Backdrop */}
      <div className="relative rounded-xl overflow-hidden border border-[#DCE3EB] bg-[#151C25] shadow-sm">
        {/* Background Image / Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-85"
          style={{
            backgroundImage: `url('/assets/industrial_banner.png')`,
          }}
        />
        {/* Dark gradient overlay to ensure perfect contrast on text */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#151C25] via-[#151C25]/90 to-transparent" />

        <div className="relative z-10 p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#2D2415] border border-[#FFAA00]/40 text-[#FFAA00] text-xs font-semibold mb-3">
              <Link2 className="h-3.5 w-3.5" />
              <span> Normalização & Rastreabilidade Protheus</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight leading-snug">
              Rastreabilidade da Produção Industrial
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Centralização e acompanhamento de Pedidos de Venda (PVs), Ordens de Produção (OPs) e
              Apontamentos em tempo real do ERP TOTVS
              Protheus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('traceability')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] text-xs font-bold transition shadow-sm"
            >
              <GitBranch className="h-4 w-4" />
              <span>Rastreabilidade de PV → OP</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigate('settings', 'data-sync')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1B232E]/90 hover:bg-[#253242] text-white border border-[#384656] text-xs font-semibold transition backdrop-blur-xs"
            >
              <Database className="h-4 w-4" />
              <span>Inserção de Dados</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6 Primary KPI Metric Cards with left border colored matching icon (as in image_94071a58.png) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Pedidos de Venda Protheus (Amber/Gold) */}
        <div
          onClick={() => onNavigate('traceability')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#C27803] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#C27803] flex items-center justify-center text-white shrink-0 shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                Pedidos de Venda Protheus
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalProtheusPv ?? 48}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                  ↑ +12%
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">vs. mês anterior</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#FFAA00] transition shrink-0" />
        </div>

        {/* Card 2: OPs Rastreáveis (Dark Navy/Graphite) */}
        <div
          onClick={() => onNavigate('traceability')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#1E293B] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#1E293B] flex items-center justify-center text-white shrink-0 shadow-xs">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                OPs Rastreáveis
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalProtheusOp ?? 24}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                  ↑ +8%
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">vs. ontem</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#FFAA00] transition shrink-0" />
        </div>

        {/* Card 3: Inspeções de Qualidade (Emerald Green) */}
        <div
          onClick={() => onNavigate('quality')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#159B72] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#159B72] flex items-center justify-center text-white shrink-0 shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                Inspeções de Qualidade
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalQualityInspections ?? 22}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                  ↑ +10%
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">vs. ontem</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#159B72] transition shrink-0" />
        </div>

        {/* Card 4: Produtos Cadastrados (Purple) */}
        <div
          onClick={() => onNavigate('settings', 'data-sync')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#9333EA] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#9333EA] flex items-center justify-center text-white shrink-0 shadow-xs">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                Produtos Cadastrados
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalProtheusProducts ?? 4}
                </span>
                <span className="text-xs text-slate-400">
                  de 5 <span className="text-emerald-500">•</span>
                </span>
              </div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#FFAA00] transition shrink-0" />
        </div>

        {/* Card 5: Insumos em Estoque (Cyan / Blue) */}
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#0284C7] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#0284C7] flex items-center justify-center text-white shrink-0 shadow-xs">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                Insumos em Estoque
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalInventoryItems ?? 312}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                  ↑ +4%
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">vs. semana anterior</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#FFAA00] transition shrink-0" />
        </div>

        {/* Card 6: Registros de Auditoria (Slate / Gray) */}
        <div
          onClick={() => onNavigate('audit')}
          className="bg-white rounded-lg border border-[#DCE3EB] border-l-[4px] border-l-[#64748B] p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-md transition shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#64748B] flex items-center justify-center text-white shrink-0 shadow-xs">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#64748B] leading-tight">
                Registros de Auditoria
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-[#263548] font-mono leading-none">
                  {stats?.totalAuditLogs ?? 54}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                  ↑ +15%
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-0.5">vs. semana anterior</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#FFAA00] transition shrink-0" />
        </div>
      </div>
    </div>
  );
};
