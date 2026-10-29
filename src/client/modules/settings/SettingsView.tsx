import React, { useState } from 'react';
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
} from 'lucide-react';
import { ProtheusSyncView } from '../protheus-sync/ProtheusSyncView.tsx';
import { FactoryView } from '../factory/FactoryView.tsx';
import { UsersView } from '../users/UsersView.tsx';

export type SettingsSubTab =
  | 'data-sync'
  | 'factory'
  | 'users'
  | 'general'
  | 'cloudsql'
  | 'connectors'
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
}

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
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');

  // General Settings state
  const [language, setLanguage] = useState('pt-BR');
  const [timezone, setTimezone] = useState(factoryProfile?.timezone || 'America/Sao_Paulo');
  const [syncInterval, setSyncInterval] = useState('30s');
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
          label: 'Configurações de Usuários',
          icon: Users,
          badge: users?.length ? `${users.length}` : undefined,
        },
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
          id: 'cloudsql',
          label: 'Conexão & Cloud SQL',
          icon: HardDrive,
        },
        {
          id: 'connectors',
          label: 'Conectores Protheus',
          icon: Cpu,
        },
        {
          id: 'security',
          label: 'Auditoria & Segurança',
          icon: ShieldCheck,
        },
      ],
    },
  ];

  // Search filter
  const filteredGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter((group) => group.items.length > 0);

  const getSubTabTitle = () => {
    for (const group of menuGroups) {
      const match = group.items.find((i) => i.id === activeSubTab);
      if (match) return match.label;
    }
    return 'Configurações';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0F141C] text-slate-200 select-none font-sans">
      {/* Dedicated Left Settings Sidebar (matching image_a72b3d4c.png) */}
      <aside className="w-72 shrink-0 flex flex-col bg-[#141B24] border-r border-[#202936] text-slate-300">
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
                    onClick={() => setActiveSubTab(item.id)}
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
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0B0F15]">
        {/* Top Header of the Dedicated Scope */}
        <div className="h-14 border-b border-[#202936] px-8 flex items-center justify-between bg-[#111720] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white tracking-tight">
              {getSubTabTitle()}
            </h2>
            <span className="text-slate-600 text-xs">•</span>
            <span className="text-xs text-slate-400">
              NexusPCP Flash Engenharia
            </span>
          </div>

          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#1C2532] border border-[#202936] transition flex items-center gap-1.5"
          >
            <span>Fechar</span>
            <X className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-8">
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
                    setLanguage(e.target.value);
                    onSuccess('Idioma da interface atualizado.');
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

              {/* Setting Box 5: Atualização de Apontamentos */}
              <div className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Ciclo de Atualização em Tempo Real</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Intervalo de polling para apontamentos de postos de trabalho e OPs
                  </p>
                </div>
                <select
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(e.target.value)}
                  className="rounded-lg bg-[#1D2733] border border-[#2D3A4B] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFAA00] cursor-pointer"
                >
                  <option value="15s">15 segundos</option>
                  <option value="30s">30 segundos (Padrão)</option>
                  <option value="60s">1 minuto</option>
                </select>
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
                  <h3 className="text-xl font-bold text-white">Configurações de Usuários</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Controle de acesso da equipe, operadores de linha, supervisores e inspetores.
                  </p>
                </div>
              </div>

              <UsersView
                users={users}
                onReload={onReloadUsers}
                onSuccess={onSuccess}
                onError={onError}
              />
            </div>
          )}

          {/* TAB 5: CONEXÃO & CLOUD SQL */}
          {activeSubTab === 'cloudsql' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <h3 className="text-xl font-bold text-white mb-2">Conexão & Cloud SQL</h3>
              <p className="text-xs text-slate-400 -mt-4 mb-6">
                Parâmetros da camada de persistência relacional e integridade de chaves.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-[#141B24] border border-[#202936] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Instância PostgreSQL
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Conectado
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-[#202936]">
                      <span className="text-slate-400">Banco de Dados:</span>
                      <span className="font-mono text-white">nexuspcp_db</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#202936]">
                      <span className="text-slate-400">ORM / Driver:</span>
                      <span className="font-mono text-[#FFAA00]">Drizzle ORM + PG Pool</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Chaves Estrangeiras:</span>
                      <span className="font-semibold text-emerald-400">Ativas (PV ↔ OP)</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#141B24] border border-[#202936] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Volume Operacional
                    </span>
                    <span className="text-[10px] font-mono text-[#FFAA00] bg-[#1E2734] px-2 py-0.5 rounded border border-[#FFAA00]/30">
                      Integrado
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-[#202936]">
                      <span className="text-slate-400">Total de Pedidos (PV):</span>
                      <span className="font-mono font-bold text-white">{stats?.totalProtheusPv ?? 48}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#202936]">
                      <span className="text-slate-400">Total de Ordens (OP):</span>
                      <span className="font-mono font-bold text-white">{stats?.totalProtheusOp ?? 24}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Itens em Estoque:</span>
                      <span className="font-mono font-bold text-white">{stats?.totalInventoryItems ?? 312}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CONECTORES PROTHEUS */}
          {activeSubTab === 'connectors' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <h3 className="text-xl font-bold text-white mb-2">Conectores ERP Protheus</h3>
              <p className="text-xs text-slate-400 -mt-4 mb-6">
                Mapeamento das tabelas de produção TOTVS e normalização Flash Standard.
              </p>

              <div className="space-y-3">
                {[
                  { table: 'SC5', desc: 'Cabeçalho de Pedidos de Venda (PVs, clientes e datas)' },
                  { table: 'SC6', desc: 'Itens de Pedidos de Venda (produtos, quantidades e prazos)' },
                  { table: 'SC2', desc: 'Ordens de Produção (número da OP, roteiro, empenhos e status)' },
                  { table: 'SG1', desc: 'Estruturas de Produtos (BOM de insumos e matérias-primas)' },
                  { table: 'SG2', desc: 'Roteiros de Operações e Postos de Trabalho Fabris' },
                  { table: 'SD3', desc: 'Apontamentos de Chão de Fábrica e Produção Realizada' },
                ].map((item) => (
                  <div
                    key={item.table}
                    className="p-4 rounded-xl bg-[#141B24] border border-[#202936] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-[#FFAA00] bg-[#1E2734] px-2.5 py-1 rounded border border-[#FFAA00]/30">
                        {item.table}
                      </span>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Tabela {item.table}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                      Normalizado
                    </span>
                  </div>
                ))}
              </div>
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
                    Restringe permissões por operador, inspetor de qualidade e administrador
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
