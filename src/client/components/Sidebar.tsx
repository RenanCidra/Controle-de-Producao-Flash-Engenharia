import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  GitBranch,
  Activity,
  Link2,
  ClipboardList,
  CalendarDays,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  User as UserIcon,
  LogOut,
  LogIn,
  LucideIcon,
  Zap,
} from 'lucide-react';
import { api, AuthUser } from '../api.ts';

export type ActiveTab =
  | 'dashboard'
  | 'traceability'
  | 'production-orders'
  | 'production-lines'
  | 'quality'
  | 'inventory'
  | 'integrations'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenSettings?: (subTab?: any) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}) => {
  const navItems: { id?: ActiveTab; label: string; icon: LucideIcon; badge?: string; planned?: boolean }[] = [
    { id: 'dashboard', label: 'Painel Geral', icon: Home },
    { id: 'traceability', label: 'Pedidos e OPs', icon: GitBranch },
    { label: 'Gestão de ocorrências', icon: ClipboardList, badge: 'Planejado', planned: true },
    { label: 'PMP · Mestre da Produção', icon: CalendarDays, badge: 'Planejado', planned: true },
  ];

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const checkApiStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const health = await api.getHealth();
        if (!disposed) setApiStatus(health.status === 'online' ? 'connected' : 'disconnected');
      } catch {
        if (!disposed) setApiStatus('disconnected');
      } finally {
        checking = false;
      }
    };
    void checkApiStatus();
    const interval = window.setInterval(() => void checkApiStatus(), 30_000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        cardRef.current &&
        !cardRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const initials = currentUser?.name
    ? currentUser.name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'RC';
  const apiStatusText = apiStatus === 'connected' ? 'Online' : apiStatus === 'disconnected' ? 'Offline' : 'Verificando';
  const apiStatusColor = apiStatus === 'connected' ? 'text-emerald-400' : apiStatus === 'disconnected' ? 'text-rose-400' : 'text-amber-400';
  const apiStatusDot = apiStatus === 'connected' ? 'bg-emerald-400' : apiStatus === 'disconnected' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse';

  return (
    <>
    {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={onCloseMobile} className="fixed inset-0 z-30 bg-black/55 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-72 shrink-0 flex-col border-r border-[#202936] bg-[#151C25] text-slate-300 transition-[width,transform] duration-200 md:relative md:z-20 md:translate-x-0 ${collapsed ? 'md:w-[76px]' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      {/* Brand Header */}
      <div className={`h-16 border-b border-[#202936] flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`} title={collapsed ? 'Flash Engenharia' : undefined}>
          <div className="h-8 w-8 rounded-md bg-[#FFAA00] flex items-center justify-center text-[#151C25] shadow-sm">
            <Zap className="h-5 w-5 fill-[#151C25]" />
          </div>
          {!collapsed && <div className="flex flex-col">
            <span className="text-lg font-black tracking-wider text-white leading-none">
              FLASH
            </span>
            <span className="text-[9px] font-bold tracking-[0.28em] text-[#FFAA00] uppercase mt-0.5 leading-none">
              ENGENHARIA
            </span>
          </div>}
        </div>
        {collapsed ? <button type="button" onClick={onToggleCollapse} title="Expandir menu" aria-label="Expandir menu" className="absolute right-[-13px] top-5 hidden h-7 w-7 items-center justify-center rounded-full border border-[#334155] bg-[#202936] text-slate-300 shadow-md hover:text-white md:flex"><PanelLeftOpen className="h-3.5 w-3.5" /></button> : <button type="button" onClick={onToggleCollapse} title="Recolher menu" aria-label="Recolher menu" className="hidden rounded-md p-1.5 text-slate-400 hover:bg-[#1C2532] hover:text-white md:block"><PanelLeftClose className="h-4 w-4" /></button>}
        {mobileOpen && <button type="button" onClick={onCloseMobile} title="Fechar menu" aria-label="Fechar menu" className="rounded-md p-1.5 text-slate-400 hover:bg-[#1C2532] hover:text-white md:hidden"><X className="h-4 w-4" /></button>}
      </div>

      {/* Internal backend reachability and Protheus source integration state */}
      <div className={collapsed ? 'px-0 py-2.5' : 'px-4 py-2.5'}>
        <div title={collapsed ? `Backend local: ${apiStatusText} · Protheus: leitura automática não configurada` : undefined} aria-live="polite" className={`rounded-xl border border-[#263342] bg-[#1B232E] text-xs ${collapsed ? 'mx-auto flex h-[68px] w-9 flex-col items-center justify-center gap-2' : 'space-y-2 px-3 py-2.5'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <span className={`flex items-center gap-1.5 font-medium text-[11px] ${apiStatusColor}`}>
              <Activity className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && 'Backend local'}
            </span>
            {!collapsed && <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${apiStatusColor}`}>
              <span className={`h-2 w-2 rounded-full ${apiStatusDot}`}></span>
              {apiStatusText}
            </span>}
          </div>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between border-t border-[#263342] pt-2'}`}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && 'Protheus'}
            </span>
            {!collapsed && <span className="text-right text-[10px] font-semibold leading-tight text-amber-300">Leitura não configurada</span>}
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className={`flex-1 overflow-y-auto py-1 ${collapsed ? 'px-2' : 'px-3'} space-y-1`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id !== undefined && activeTab === item.id;
          return (
            <button
              key={item.id || item.label}
              disabled={item.planned}
              title={item.planned ? `${item.label} · planejado para uma próxima etapa` : item.label}
              onClick={() => { if (item.id) setActiveTab(item.id); onCloseMobile(); }}
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${item.planned ? 'cursor-not-allowed text-slate-500 border border-transparent' : ''} ${
                isActive
                  ? 'bg-[#2A2316] text-[#FFAA00] border border-[#FFAA00]/70 shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#1C2532] border border-transparent'
              }`}
            >
              <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive
                      ? 'text-[#FFAA00]'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!collapsed && item.badge !== undefined && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center ${
                    isActive
                      ? 'bg-[#FFAA00] text-[#151C25]'
                      : item.planned ? 'bg-[#263342] text-slate-500' : 'bg-[#263342] text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>


      {/* Floating User Menu Popover (matches image_5945a1a0.png) */}
      {userMenuOpen && (
        <div
          ref={menuRef}
          className={`absolute bottom-18 z-50 w-64 bg-[#1A222D] border border-[#2B3747] rounded-2xl shadow-2xl overflow-hidden p-2 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150 select-none backdrop-blur-md ${collapsed && !mobileOpen ? 'left-[calc(100%+8px)]' : 'left-2'}`}
          style={{ boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' }}
        >
          {/* Top User Info Row with chevron */}
          <div
            onClick={() => {
              setUserMenuOpen(false);
              onOpenAuth();
            }}
            className="p-2.5 rounded-xl hover:bg-[#232E3D] transition cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 truncate">
              <div className="h-9 w-9 rounded-full bg-[#273547] border border-[#3E4F63] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0 group-hover:border-[#FFAA00]/70 transition">
                {initials}
              </div>
              <div className="truncate text-left">
                <p className="font-semibold text-white truncate text-xs">
                  {currentUser?.name || 'Renan Cidra'}
                </p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {currentUser?.role || 'Acesso Operacional'} • Flash
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[#FFAA00] transition shrink-0 ml-2" />
          </div>

          <div className="h-px bg-[#263342] my-1" />

          {/* Adapted actions for Flash Engenharia */}
          <div className="space-y-0.5">
            <button
              onClick={() => {
                setUserMenuOpen(false);
                onOpenAuth();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#232E3D] transition text-left"
            >
              <UserIcon className="h-4 w-4 text-slate-400" />
              <span className="font-medium">Perfil & Credenciais</span>
            </button>

            <button
              onClick={() => {
                setUserMenuOpen(false);
                onCloseMobile();
                if (onOpenSettings) onOpenSettings('general');
                else setActiveTab('settings');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#232E3D] transition text-left"
            >
              <Settings className="h-4 w-4 text-[#FFAA00]" />
              <span className="font-medium">Configurações</span>
            </button>
          </div>

          <div className="h-px bg-[#263342] my-1" />

          {/* Database & System info */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${apiStatusDot}`}></span>
              Backend local {apiStatusText.toLowerCase()}
            </span>
            <span className="font-mono text-slate-500">/api/health</span>
          </div>
          <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-amber-300">
            <span className="flex items-center gap-1.5 font-medium"><Link2 className="h-3 w-3" />Protheus</span>
            <span>Leitura automática não configurada</span>
          </div>

          {/* Logout / Switch User */}
          {currentUser ? (
            <button
              onClick={() => {
                setUserMenuOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 transition text-left mt-0.5"
            >
              <LogOut className="h-4 w-4 text-slate-400 group-hover:text-rose-400" />
              <span className="font-medium">Sair</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setUserMenuOpen(false);
                onOpenAuth();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#FFAA00] hover:bg-[#FFAA00]/10 transition text-left mt-0.5 font-bold"
            >
              <LogIn className="h-4 w-4" />
              <span>Entrar no Sistema</span>
            </button>
          )}
        </div>
      )}

      {/* User Profile Footer Card (triggers popover on click) */}
      <div className={`border-t border-[#202936] mt-2 bg-[#121820] ${collapsed ? 'p-2' : 'p-3'}`}>
        <div
          ref={cardRef}
          onClick={() => setUserMenuOpen((prev) => !prev)}
          className={`flex items-center rounded-xl cursor-pointer transition group ${collapsed ? 'justify-center px-0 py-1.5' : 'justify-between px-2 py-1.5'} ${
            userMenuOpen ? 'bg-[#1C2532] ring-1 ring-[#FFAA00]/40' : 'hover:bg-[#1C2532]'
          }`}
          title={collapsed ? `Opções do usuário · ${currentUser?.name || 'Conta'}` : 'Opções do Usuário'}
        >
          <div className={`flex min-w-0 items-center overflow-hidden ${collapsed ? '' : 'gap-2.5'}`}>
            <div className="h-8 w-8 rounded-full bg-[#1E293B] border border-[#334155] text-slate-200 flex items-center justify-center font-bold text-xs uppercase shrink-0 group-hover:border-[#FFAA00]/70 transition">
              {initials}
            </div>
            {!collapsed && <div className="truncate text-left">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                {currentUser?.name || 'Renan Cidra'}
              </p>
              <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                {currentUser?.role || 'Acesso Operacional'}
              </p>
            </div>}
          </div>

          {!collapsed && <ChevronDown
            className={`h-4 w-4 text-slate-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
              userMenuOpen ? 'rotate-180 text-[#FFAA00]' : ''
            }`}
          />}
        </div>
      </div>
    </aside>
    </>
  );
};

