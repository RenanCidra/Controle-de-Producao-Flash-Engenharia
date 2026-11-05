import React from 'react';
import {
  Home,
  GitBranch,
  ClipboardList,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LucideIcon,
} from 'lucide-react';
import type { AuthUser, FeedbackCategory } from '../api.ts';
import { translateText } from '../i18n/index.ts';
import { UserAccountMenu } from './UserAccountMenu.tsx';

export type ActiveTab =
  | 'dashboard'
  | 'home'
  | 'traceability'
  | 'occurrences'
  | 'communications'
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
  onOpenProfile: () => void;
  onOpenFeedback: (initialTab?: 'submit' | 'inbox', initialCategory?: FeedbackCategory) => void;
  onOpenHelpInfo: (mode: 'help' | 'release' | 'shortcuts') => void;
  onOpenShortcuts: () => void;
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
  onOpenProfile,
  onOpenFeedback,
  onOpenHelpInfo,
  onOpenShortcuts,
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
    { id: 'occurrences', label: 'Gestão de ocorrências', icon: ClipboardList },
    { label: 'PMP · Mestre da Produção', icon: CalendarDays, badge: 'Planejado', planned: true },
  ];

  return (
    <>
    {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={onCloseMobile} className="fixed inset-0 z-30 bg-black/55 md:hidden" />}
    <aside data-theme-surface="sidebar" className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-72 shrink-0 flex-col border-r border-[#202936] bg-[#151C25] text-slate-300 transition-[width,transform] duration-200 md:relative md:z-20 md:translate-x-0 ${collapsed ? 'md:w-[76px]' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      {/* Brand Header */}
      <div className={`h-16 border-b border-[#202936] flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        <button type="button" onClick={() => { setActiveTab('home'); onCloseMobile(); }} className={`flex items-center rounded-md focus:outline-none focus:ring-2 focus:ring-[#FFAA00] ${collapsed ? '' : 'gap-3'}`} title={translateText('Início')} aria-label={translateText('Ir para a página inicial')}>
          <img
            src={collapsed ? '/assets/flash-symbol.png' : '/assets/flash-brand.svg'}
            alt="Flash Engenharia"
            className={collapsed ? 'h-9 w-8 object-contain' : 'h-10 w-[150px] object-contain'}
          />
        </button>
        {collapsed ? <button type="button" onClick={onToggleCollapse} title="Expandir menu" aria-label="Expandir menu" className="absolute right-[-13px] top-5 hidden h-7 w-7 items-center justify-center rounded-full border border-[#334155] bg-[#202936] text-slate-300 shadow-md hover:text-white md:flex"><PanelLeftOpen className="h-3.5 w-3.5" /></button> : <button type="button" onClick={onToggleCollapse} title="Recolher menu" aria-label="Recolher menu" className="hidden rounded-md p-1.5 text-slate-400 hover:bg-[#1C2532] hover:text-white md:block"><PanelLeftClose className="h-4 w-4" /></button>}
        {mobileOpen && <button type="button" onClick={onCloseMobile} title="Fechar menu" aria-label="Fechar menu" className="rounded-md p-1.5 text-slate-400 hover:bg-[#1C2532] hover:text-white md:hidden"><X className="h-4 w-4" /></button>}
      </div>

      {/* Main Navigation */}
      <nav className={`flex-1 overflow-y-auto py-1 ${collapsed ? 'px-2' : 'px-3'} space-y-1`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id !== undefined && activeTab === item.id;
          return (
            <button
              key={item.id || item.label}
              data-sidebar-nav-item="true"
              data-active={isActive ? 'true' : 'false'}
              data-planned={item.planned ? 'true' : 'false'}
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
      <div className={`border-t border-[#202936] mt-2 bg-[#151C25] ${collapsed ? 'p-2' : 'p-3'}`}>
        <UserAccountMenu currentUser={currentUser} onOpenProfile={onOpenProfile} onOpenSettings={() => { onCloseMobile(); if (onOpenSettings) onOpenSettings('general'); else setActiveTab('settings'); }} onOpenFeedback={onOpenFeedback} onOpenHelpInfo={onOpenHelpInfo} onOpenShortcuts={onOpenShortcuts} onLogout={onLogout} onOpenAuth={onOpenAuth} onCloseMobile={onCloseMobile} collapsed={collapsed && !mobileOpen} />
      </div>
    </aside>
    </>
  );
};


