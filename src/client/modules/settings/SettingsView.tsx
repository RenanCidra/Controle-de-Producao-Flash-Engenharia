import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Search,
  X,
  Settings,
  Database,
  Building,
  Users,
  HardDrive,
  Cpu,
  ShieldCheck,
  Globe,
  Clock,
  MapPin,
  Palette,
  CheckCircle2,
  RefreshCw,
  Server,
  Layers,
  ChevronRight,
  Shield,
  FileText,
  Menu,
  Activity,
  Link2,
} from 'lucide-react';
import { ProtheusSyncView } from '../protheus-sync/ProtheusSyncView.tsx';
import { ProtheusTableBrowser } from '../protheus-sync/ProtheusTableBrowser.tsx';
import { ProductionLinesView } from '../production-lines/ProductionLinesView.tsx';
import { IntegrationsView } from '../integrations/IntegrationsView.tsx';
import { FactoryView } from '../factory/FactoryView.tsx';
import { UsersView } from '../users/UsersView.tsx';
import { AuditView } from '../audit/AuditView.tsx';
import { api } from '../../api.ts';
import { getAppLanguage, getIntlLocale, setAppLanguage, translateText } from '../../i18n/index.ts';

export type SettingsSubTab =
  | 'data-sync'
  | 'factory'
  | 'users'
  | 'general'
  | 'connections'
  | 'connectors'
  | 'production-lines'
  | 'integrations'
  | 'security';

interface SettingsViewProps {
  initialSubTab?: SettingsSubTab;
  onBack: () => void;
  stats: any;
  factoryProfile: any;
  users: any[];
  currentUser: any;
  onReloadFactory: () => void;
  onReloadUsers: () => void;
  onRefreshStats: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  auditLogs: any[];
  onReloadAudit: () => void;
  lines: any[];
  integrations: any[];
  onReloadLines: () => void;
  onReloadIntegrations: () => void;
}

type ServiceState = 'checking' | 'online' | 'offline' | 'timeout' | 'unknown';

const serviceStatePresentation: Record<ServiceState, { label: string; text: string; dot: string }> = {
  checking: { label: 'Verificando', text: 'text-amber-300', dot: 'bg-amber-400' },
  online: { label: 'Online', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  offline: { label: 'Sem conexão', text: 'text-rose-300', dot: 'bg-rose-400' },
  timeout: { label: 'Sem resposta no prazo', text: 'text-amber-300', dot: 'bg-amber-400' },
  unknown: { label: 'Não informado', text: 'text-slate-300', dot: 'bg-slate-400' },
};

const statusLabel = (state: ServiceState) => translateText(serviceStatePresentation[state].label);
const normalizeServiceState = (state: unknown): ServiceState =>
  state === 'online' || state === 'offline' || state === 'timeout' ? state : 'unknown';

const ConnectionStatusPanel: React.FC = () => {
  const [backendState, setBackendState] = useState<ServiceState>('checking');
  const [databaseState, setDatabaseState] = useState<ServiceState>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const checkConnections = async () => {
    setChecking(true);
    try {
      const health = await api.getHealth();
      setBackendState(health.status === 'online' ? 'online' : 'offline');
      setDatabaseState(normalizeServiceState(health.databaseStatus));
      setError(health.databaseStatus ? '' : translateText('A API respondeu, mas não informou o estado do banco. Reinicie o backend para atualizar esta verificação.'));
    } catch (err: any) {
      setBackendState('offline');
      setDatabaseState('unknown');
      setError(err.message || translateText('Não foi possível consultar o estado dos serviços.'));
    } finally {
      setLastChecked(new Date());
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkConnections();
    const interval = window.setInterval(() => void checkConnections(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const services = [
    { title: translateText('Backend da aplicação'), icon: Server, state: backendState, description: translateText('Processo que atende as telas e rotas do sistema.') },
    { title: translateText('Banco de dados PostgreSQL'), icon: Database, state: databaseState, description: translateText('Verificado por uma consulta simples ao banco configurado.') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Conexões e Saúde do Sistema</h3>
          <p className="mt-1 text-xs text-slate-400">Estado do backend e do banco. A verificação ocorre ao abrir esta tela e a cada 30 segundos.</p>
        </div>
        <button onClick={() => void checkConnections()} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2D3A4B] bg-[#1D2733] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#253242] disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
          {translateText(checking ? 'Verificando…' : 'Verificar agora')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {services.map(({ title, icon: Icon, state, description }) => (
          <article key={title} aria-live="polite" className="rounded-xl border border-[#202936] bg-[#141B24] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2D3A4B] bg-[#1D2733] text-[#FFAA00]"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0"><h4 className="text-sm font-semibold text-white">{title}</h4><p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p></div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded border border-current/20 px-2 py-1 text-[10px] font-bold ${serviceStatePresentation[state].text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${serviceStatePresentation[state].dot} ${state === 'checking' ? 'animate-pulse' : ''}`} />
                {statusLabel(state)}
              </span>
            </div>
          </article>
        ))}
        <article className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 md:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300"><Link2 className="h-5 w-5" /></span>
            <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-white">Integração de leitura com o Protheus</h4><span className="rounded border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">Não configurada</span></div><p className="mt-1 text-xs leading-relaxed text-slate-400">O sistema ainda não consulta o Protheus automaticamente. O endpoint REST disponível recebe cargas enviadas ao sistema; ele não confirma uma conexão ativa com o ERP.</p></div>
          </div>
        </article>
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-[#202936] bg-[#111720] px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>{error ? `${translateText('Última verificação com erro:')} ${error}` : 'Verificação concluída sem alterar dados.'}</span>
        <span>Última checagem: {lastChecked ? lastChecked.toLocaleTimeString(getIntlLocale()) : translateText('aguardando')}</span>
      </div>
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubTab = 'general',
  onBack,
  stats,
  factoryProfile,
  users,
  currentUser,
  onReloadFactory,
  onReloadUsers,
  onRefreshStats,
  onSuccess,
  onError,
  auditLogs,
  onReloadAudit,
  lines,
  integrations,
  onReloadLines,
  onReloadIntegrations,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAuditEvents, setShowAuditEvents] = useState(false);
  const [selectedProtheusTable, setSelectedProtheusTable] = useState<{ entity: string; table: string } | null>(null);
  const [mobileSettingsNavOpen, setMobileSettingsNavOpen] = useState(false);

  // General Settings state
  const [language, setLanguage] = useState(getAppLanguage());
  const [timezone, setTimezone] = useState(factoryProfile?.timezone || 'America/Sao_Paulo');
  const [autoSaveAudit, setAutoSaveAudit] = useState(true);

  interface MenuItem {
    id: SettingsSubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  interface MenuGroup {
    title: string;
    items: MenuItem[];
  }

  const menuGroups: MenuGroup[] = [
    {
      title: 'Operacional & Dados',
      items: [
        {
          id: 'data-sync',
          label: 'Inserção de Dados',
          icon: Database,
          badge: stats?.totalProtheusPv ? `${stats.totalProtheusPv} PVs` : undefined,
        },
        {
          id: 'factory',
          label: 'Configurações de Plantas',
          icon: Building,
          badge: factoryProfile?.plantCode || 'PLANTA-01',
        },
        {
          id: 'users',
          label: 'Contas de acesso',
          icon: Users,
          badge: users?.length ? `${users.length}` : undefined,
        },
        { id: 'production-lines', label: 'Setores e postos', icon: Layers },
      ],
    },
    {
      title: 'Sistema & Parâmetros',
      items: [
        {
          id: 'general',
          label: 'Geral',
          icon: Settings,
        },
        {
          id: 'connections',
          label: 'Conexões e Saúde do Sistema',
          icon: HardDrive,
        },
        {
          id: 'connectors',
          label: 'Conectores Protheus',
          icon: Cpu,
        },
        { id: 'integrations', label: 'Sensores e APIs', icon: Cpu },
        {
          id: 'security',
          label: 'Auditoria & Segurança',
          icon: ShieldCheck,
        },
      ],
    },
  ];

  // Search filter
  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.id === 'users' || item.id === 'connections') return currentUser?.role === 'ADMIN';
        if (['data-sync', 'production-lines', 'integrations'].includes(item.id)) return ['ADMIN', 'SUPERVISOR'].includes(currentUser?.role);
        if (item.id === 'connectors' || item.id === 'security') return ['ADMIN', 'SUPERVISOR', 'AUDITOR'].includes(currentUser?.role);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const filteredGroups = visibleGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter((group) => group.items.length > 0);

  const getSubTabTitle = () => {
    for (const group of visibleGroups) {
      const match = group.items.find((i) => i.id === activeSubTab);
      if (match) return match.label;
    }
    return 'Configurações';
  };

  return (
    <div className="relative flex h-[100dvh] w-full min-w-0 overflow-hidden bg-[#0F141C] font-sans text-slate-200 select-none">
      {mobileSettingsNavOpen && <button type="button" aria-label="Fechar navegação de configurações" onClick={() => setMobileSettingsNavOpen(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden" />}
      {/* Dedicated Left Settings Sidebar (matching image_a72b3d4c.png) */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-72 shrink-0 flex-col border-r border-[#202936] bg-[#141B24] text-slate-300 transition-transform duration-200 md:relative md:z-20 md:translate-x-0 ${mobileSettingsNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Top return to app button */}
        <div className="p-4 border-b border-[#202936]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1E2734] px-3 py-2 rounded-lg transition-all w-full group"
          >
            <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-[#FFAA00] group-hover:-translate-x-0.5 transition" />
            <span>Voltar ao aplicativo</span>
          </button>
        </div>

        {/* Search bar inside Settings Sidebar (matching image_a72b3d4c.png) */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar"
              className="w-full rounded-lg bg-[#1B2430] border border-[#263342] pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FFAA00] transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Settings Navigation List (organized by groups) */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                {group.title}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSubTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveSubTab(item.id); setMobileSettingsNavOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-[#222B38] text-white font-semibold border-l-2 border-l-[#FFAA00]'
                        : 'text-slate-400 hover:text-white hover:bg-[#1B232E]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#FFAA00]' : 'text-slate-400 group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isActive
                            ? 'bg-[#FFAA00]/20 text-[#FFAA00]'
                            : 'bg-[#222E3D] text-slate-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              Nenhuma configuração encontrada para "{searchTerm}".
            </div>
          )}
        </nav>

        {/* Footer info in settings sidebar */}
        <div className="p-3 border-t border-[#202936] text-[11px] text-slate-400 flex items-center justify-between bg-[#111720]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            Flash PCP v2.4
          </span>
          <span className="font-mono text-[10px] text-slate-500">
            {factoryProfile?.plantCode || 'PLANTA-01'}
          </span>
        </div>
      </aside>

      {/* Main Right Content Panel (Dedicated Scope) */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0F15]">
        {/* Top Header of the Dedicated Scope */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#202936] bg-[#111720] px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => setMobileSettingsNavOpen(true)} aria-label="Abrir navegação de configurações" className="rounded-md p-1.5 text-slate-300 hover:bg-[#1C2532] md:hidden"><Menu className="h-5 w-5" /></button>
            <h2 className="max-w-[48vw] truncate text-sm font-bold tracking-tight text-white sm:text-base">
              {getSubTabTitle()}
            </h2>
            <span className="hidden text-xs text-slate-600 sm:inline">•</span>
            <span className="hidden text-xs text-slate-400 sm:inline">
              NexusPCP Flash Engenharia
            </span>
          </div>

          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-[#202936] px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-[#1C2532] hover:text-white sm:px-3"
          >
            <span>Fechar</span>
            <X className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>

        {/* Content Body */}
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 lg:p-8">
          {/* TAB 1: GERAL (Styled exactly like image_a72b3d4c.png) */}
          {activeSubTab === 'general' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <h3 className="text-xl font-bold text-white mb-6">Geral</h3>

              {/* Setting Box 1: Idioma */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Idioma</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Idioma da interface do aplicativo
                  </p>
                </div>
                <select
                  value={language}
                  onChange={(e) => {
                    const nextLanguage = e.target.value as 'pt-BR' | 'en-US' | 'es-ES';
                    setLanguage(nextLanguage);
                    setAppLanguage(nextLanguage);
                    window.sessionStorage.setItem('flash-reopen-settings-after-language-change', 'true');
                    window.location.reload();
                  }}
                  className="rounded-lg bg-[#1D2733] border border-[#2D3A4B] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFAA00] cursor-pointer"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>

              {/* Setting Box 2: Fuso Horário */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Fuso Horário Operacional</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Utilizado para emissão de OPs, apontamentos e timestamps
                  </p>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    onSuccess('Fuso horário ajustado.');
                  }}
                  className="rounded-lg bg-[#1D2733] border border-[#2D3A4B] px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#FFAA00] cursor-pointer"
                >
                  <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-03:00)</option>
                  <option value="America/Manaus">America/Manaus (UTC-04:00)</option>
                  <option value="UTC">UTC (Tempo Universal)</option>
                </select>
              </div>

              {/* Setting Box 3: Unidade Fabril Padrão */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Unidade Fabril Principal</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Planta selecionada para filtro e relatórios automáticos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#FFAA00] bg-[#1E2734] px-2.5 py-1 rounded border border-[#FFAA00]/30">
                    {factoryProfile?.plantCode || 'PLANTA-01'}
                  </span>
                  <button
                    onClick={() => setActiveSubTab('factory')}
                    className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-[#1D2733] hover:bg-[#253242] border border-[#2D3A4B] transition"
                  >
                    Editar Planta
                  </button>
                </div>
              </div>

              {/* Setting Box 4: Identidade Visual Flash */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Identidade Visual Flash Engenharia</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paleta industrial corporativa com destaque âmbar (#FFAA00) e grafite (#151C25)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full bg-[#FFAA00] ring-2 ring-white/20"></span>
                  <span className="text-xs text-slate-300 font-medium">Tema Industrial Ativo</span>
                </div>
              </div>

              {/* Setting Box 5: Consulta do espelho */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Atualização do painel</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Consulta as métricas do espelho local; a busca direta no Protheus ainda não está conectada.
                  </p>
                </div>
                <span className="rounded-lg border border-[#2D3A4B] bg-[#1D2733] px-3 py-1.5 text-xs font-semibold text-[#FFAA00]">A cada 5 minutos</span>
              </div>
            </div>
          )}

          {/* TAB 2: INSERÇÃO DE DADOS */}
          {activeSubTab === 'data-sync' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-[#202936]">
                <div>
                  <h3 className="text-xl font-bold text-white">Inserção e Ingestão de Dados</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Carga e sincronização de dados do ERP TOTVS Protheus (PVs, OPs, Roteiros e Lotes).
                  </p>
                </div>
              </div>

              <ProtheusSyncView
                onSuccess={onSuccess}
                onError={onError}
                onRefreshStats={onRefreshStats}
              />
            </div>
          )}

          {/* TAB 3: CONFIGURAÇÕES DE PLANTAS */}
          {activeSubTab === 'factory' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-[#202936]">
                <div>
                  <h3 className="text-xl font-bold text-white">Configurações de Plantas Industriais</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Parâmetros da unidade fabril, código identificador, CNPJ e localização.
                  </p>
                </div>
              </div>

              <FactoryView
                profile={factoryProfile}
                onReload={onReloadFactory}
                onSuccess={onSuccess}
                onError={onError}
              />
            </div>
          )}

          {/* TAB 4: CONFIGURAÇÕES DE USUÁRIOS */}
          {activeSubTab === 'users' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-[#202936]">
                <div>
                  <h3 className="text-xl font-bold text-white">Contas de acesso</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Contas que autenticam no sistema e recebem perfis de acesso. Colaboradores serão cadastrados separadamente.
                  </p>
                </div>
              </div>

              <UsersView
                users={users}
                currentUser={currentUser}
                onReload={onReloadUsers}
                onSuccess={onSuccess}
                onError={onError}
              />
            </div>
          )}

          {/* TAB 5: CONEXÕES E DISPONIBILIDADE */}
          {activeSubTab === 'connections' && <ConnectionStatusPanel />}

          {/* TAB 6: CONECTORES PROTHEUS */}
          {activeSubTab === 'connectors' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <h3 className="text-xl font-bold text-white mb-2">Conectores ERP Protheus</h3>
              <p className="text-xs text-slate-400 -mt-4 mb-6">
                Mapeamento das tabelas de produção TOTVS e normalização Flash Standard.
              </p>

              {selectedProtheusTable ? (
                <ProtheusTableBrowser
                  entity={selectedProtheusTable.entity}
                  tableLabel={selectedProtheusTable.table}
                  onBack={() => setSelectedProtheusTable(null)}
                />
              ) : (
                <div className="space-y-3">
                  {[
                    { table: 'SC5 / SC6', desc: 'Pedidos de venda e seus itens: cliente, produto, quantidades e prazos.', entity: 'salesOrders' },
                    { table: 'SC2', desc: 'Ordens de produção e vínculo com pedido, produto e roteiro.', entity: 'productionOrders' },
                    { table: 'SB1', desc: 'Cadastro de produtos espelhado.', entity: 'products' },
                    { table: 'SG1', desc: 'Estrutura de produto: relação entre produto pai e componente.', entity: 'structures' },
                    { table: 'SG2', desc: 'Roteiros e operações por produto, com posto/recurso quando fornecido.', entity: 'routings' },
                    { table: 'SH6', desc: 'Apontamentos de operações de produção recebidos do Protheus.', entity: 'appointments' },
                  ].map((item) => (
                    <button key={item.table} onClick={() => setSelectedProtheusTable({ entity: item.entity, table: item.table })} className="flex w-full items-center justify-between rounded-xl border border-[#202936] bg-[#141B24] p-4 text-left transition hover:border-[#FFAA00]/60 hover:bg-[#19222D]">
                      <span className="flex items-center gap-3">
                        <span className="rounded border border-[#FFAA00]/30 bg-[#1E2734] px-2.5 py-1 font-mono text-sm font-bold text-[#FFAA00]">{item.table}</span>
                        <span><span className="block text-xs font-semibold text-white">Consultar dados normalizados</span><span className="mt-0.5 block text-xs text-slate-400">{item.desc}</span></span>
                      </span>
                      <span className="text-xs font-semibold text-[#FFAA00]">Ver dados →</span>
                    </button>
                  ))}
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    {[
                      { label: 'Empenhos entre OPs', detail: 'Aguardando amostra/campos da tabela para identificar OP pai e OP filha.' },
                      { label: 'Recursos e setores', detail: 'Aguardando a relação oficial de recursos/postos com setores e subsetores.' },
                    ].map((item) => <div key={item.label} className="rounded-xl border border-dashed border-[#344154] bg-[#111720] p-4"><h4 className="text-xs font-semibold text-slate-300">{item.label} · pendente</h4><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div>)}
                  </div>
                  <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/80">A consulta exibe os dados normalizados armazenados neste sistema, não uma cópia bruta das tabelas físicas do Protheus. SC5 e SC6 estão consolidadas no mesmo conjunto de pedidos/itens. A API do Protheus ainda não está conectada para buscar registros sob demanda.</p>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'production-lines' && (
            <div className="mx-auto max-w-6xl space-y-5">
                <div><h3 className="text-xl font-bold text-white">Linhas de produção (cadastro local)</h3><p className="mt-1 text-xs text-slate-400">Configuração legada para perfis privilegiados. Ainda não representa o mapeamento oficial de recursos e subsetores do Protheus.</p></div>
              <ProductionLinesView lines={lines} onReload={onReloadLines} onSuccess={onSuccess} onError={onError} />
            </div>
          )}

          {activeSubTab === 'integrations' && (
            <div className="mx-auto max-w-6xl space-y-5">
              <div><h3 className="text-xl font-bold text-white">Sensores e APIs</h3><p className="mt-1 text-xs text-slate-400">Conectores e endpoints são configurações técnicas, restritas a perfis privilegiados.</p></div>
              <IntegrationsView integrations={integrations} onReload={onReloadIntegrations} onSuccess={onSuccess} onError={onError} />
            </div>
          )}

          {/* TAB 7: AUDITORIA & SEGURANÇA */}
          {activeSubTab === 'security' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <h3 className="text-xl font-bold text-white mb-6">Auditoria & Segurança</h3>

              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Registro Imutável de Eventos</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gera trilha de auditoria para inserção de dados, apontamentos e cadastros
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Ativo (Conformidade ISO 9001)
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Políticas de Acesso (RBAC)</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Restringe permissões por operador, supervisor, auditor e administrador
                  </p>
                </div>
                <button
                  onClick={() => setActiveSubTab('users')}
                  className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-[#1D2733] hover:bg-[#253242] border border-[#2D3A4B] transition"
                >
                  Gerenciar Acessos
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Sessão e Autenticação</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tokens JWT seguros com expiração e renovação automática
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-400">HS256 24h</span>
              </div>

              <div className="space-y-4 pt-2">
                <button
                  onClick={() => setShowAuditEvents((visible) => !visible)}
                  aria-expanded={showAuditEvents}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2.5 text-xs font-bold text-[#151C25] transition hover:bg-[#e69900]"
                >
                  <FileText className="h-4 w-4" />
                  {showAuditEvents ? 'Ocultar Eventos' : 'Ver Eventos'}
                </button>

                {showAuditEvents && (
                  <div className="rounded-xl border border-[#202936] bg-[#141B24] p-5">
                    <AuditView logs={auditLogs} onReload={onReloadAudit} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
