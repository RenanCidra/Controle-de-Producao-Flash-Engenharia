import React from 'react';
import { Activity, ArrowRight, ClipboardList, Database, GitBranch, ShieldCheck } from 'lucide-react';
import { ActiveTab } from '../../components/Sidebar.tsx';
import { translateText } from '../../i18n/index.ts';

interface WelcomeViewProps {
  stats: { totalProtheusOp: number; totalProtheusPv: number; totalProtheusBatches: number; latestProtheusImport?: { createdAt: string | null; entityType: string; recordsCount: number } | null } | null;
  loading: boolean;
  error: string | null;
  onNavigate: (tab: ActiveTab) => void;
  onOpenConnectors: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ stats, loading, error, onNavigate, onOpenConnectors }) => {
  const features = [
    { title: 'Rastreabilidade de pedidos e OPs', text: 'Consulte vínculos e andamento usando os registros existentes no espelho Protheus.', icon: GitBranch, action: 'traceability' as const, label: 'Abrir rastreabilidade' },
    { title: 'Gestão de ocorrências', text: 'Registre fatos por OP, acompanhe atualizações e visualize ocorrências consolidadas por PV.', icon: ClipboardList, action: 'occurrences' as const, label: 'Abrir ocorrências' },
    { title: 'Indicadores da produção', text: 'Explore quantidades, prazos e filtros calculados sobre os dados disponíveis no sistema.', icon: Activity, action: 'dashboard' as const, label: 'Ver painel geral' },
  ];

  return (
    <div className="mx-auto max-w-[1520px] space-y-5 pb-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-[#202936] bg-[#111923] shadow-sm">
        <div className="absolute inset-0 z-0 bg-cover bg-right bg-no-repeat opacity-55" style={{ backgroundImage: "url('/assets/industrial_banner.png')" }} />
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-[#111923] via-[#111923]/95 to-[#111923]/55" />
        <div className="relative z-10 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.35fr_.65fr] lg:items-end lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold text-amber-200"><Database className="h-3.5 w-3.5" />{translateText('Controle de produção industrial')}</div>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{translateText('Da ordem à entrega, com clareza em cada etapa.')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{translateText('Uma visão integrada para consultar a produção, acompanhar ocorrências e trabalhar com dados rastreáveis.')}</p>
            <button type="button" onClick={() => onNavigate('dashboard')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2.5 text-xs font-bold text-[#151C25] shadow-sm transition hover:bg-[#e69900]">{translateText('Abrir painel geral')}<ArrowRight className="h-4 w-4" /></button>
          </div>
          <aside className="rounded-xl border border-white/10 bg-black/25 p-4 text-white backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${error ? 'bg-rose-400' : loading ? 'animate-pulse bg-amber-300' : stats ? 'bg-emerald-400' : 'bg-slate-400'}`} />{translateText('Espelho operacional do Protheus')}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{error ? translateText('Não foi possível consultar o espelho neste momento.') : stats ? translateText('Resumo baseado nas cargas e registros disponíveis no banco da aplicação.') : translateText('A consulta usa os dados recebidos no espelho; não representa uma conexão ativa ao Protheus.')}</p>
            {stats && <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white/5 p-2.5"><span className="block text-[10px] text-slate-400">{translateText('OPs no espelho')}</span><strong className="mt-1 block text-lg">{stats.totalProtheusOp.toLocaleString()}</strong></div><div className="rounded-lg bg-white/5 p-2.5"><span className="block text-[10px] text-slate-400">{translateText('Pedidos no espelho')}</span><strong className="mt-1 block text-lg">{stats.totalProtheusPv.toLocaleString()}</strong></div></div>}
            <button type="button" onClick={onOpenConnectors} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200 hover:text-amber-100">{translateText('Ver conectores e cargas') }<ArrowRight className="h-3.5 w-3.5" /></button>
          </aside>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C27803]">{translateText('Por onde começar')}</p><h2 className="mt-1 text-lg font-bold text-[#263548]">{translateText('Ferramentas para acompanhar a operação')}</h2></div><span className="text-xs text-[#64748B]">{stats ? `${stats.totalProtheusBatches.toLocaleString()} ${translateText('cargas registradas')}` : translateText('Os dados refletem as cargas disponíveis')}</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ title, text, icon: Icon, action, label }) => <article key={action} className="group flex min-h-44 flex-col rounded-xl border border-[#DCE3EB] bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF7E6] text-[#B96A00]"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-bold text-[#263548]">{translateText(title)}</h3><p className="mt-1 flex-1 text-xs leading-relaxed text-[#64748B]">{translateText(text)}</p><button type="button" onClick={() => onNavigate(action)} className="mt-4 inline-flex items-center gap-1 self-start text-xs font-semibold text-[#9A5B00] hover:text-[#704200]">{translateText(label)}<ArrowRight className="h-3.5 w-3.5" /></button></article>)}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-[#DCE3EB] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-xs font-bold text-[#263548]">{translateText('Dados com origem identificada')}</h3><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#64748B]">{translateText('A aplicação consulta o espelho normalizado alimentado por cargas. A integração direta com o Protheus ainda precisa ser configurada e validada com a equipe de TI.')}</p></div></div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-600">{stats?.latestProtheusImport?.createdAt ? `${translateText('Última carga')}: ${new Date(stats.latestProtheusImport.createdAt).toLocaleString()}` : translateText('Aguardando carga de dados')}</span>
      </section>
    </div>
  );
};
