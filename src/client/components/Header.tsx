import React, { useState, useEffect } from 'react';
import {
  Menu,
  Calendar,
  Bell,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from 'lucide-react';
import { AuthUser } from '../api.ts';
import { getIntlLocale } from '../i18n/index.ts';

interface HeaderProps {
  plantCode?: string | null;
  currentUser: AuthUser | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenAuth: () => void;
  onOpenAssistant?: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  plantCode,
  currentUser,
  loading,
  onRefresh,
  onOpenAuth,
  onOpenAssistant,
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  const [currentDateTime, setCurrentDateTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentDateTime(
        now.toLocaleString(getIntlLocale(), {
          dateStyle: 'short',
          timeStyle: 'short',
          hour12: getIntlLocale() === 'en-US',
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#DCE3EB] bg-white px-2 text-[#263548] select-none sm:px-4 lg:px-6">
      {/* Left branding and breadcrumb / title */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="-ml-1 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher/abrir menu lateral'}
          aria-label="Abrir ou recolher menu lateral"
        >
          <Menu className="h-5 w-5 md:hidden" />
          {sidebarCollapsed ? <PanelLeftOpen className="hidden h-5 w-5 md:block" /> : <PanelLeftClose className="hidden h-5 w-5 md:block" />}
        </button>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <h1 className="max-w-[42vw] truncate text-xs font-bold tracking-tight text-[#263548] sm:max-w-none sm:text-sm">
            Controle de Produção Industrial
          </h1>
          <span className="hidden text-xs text-slate-300 sm:inline">•</span>
          <span className="hidden text-xs font-medium text-[#64748B] xl:inline">
            Flash Engenharia • Operação Interna
          </span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-4">
        {/* Date and time display */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-[#64748B] font-mono">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span>{currentDateTime}</span>
        </div>

        {/* Notifications with amber badge */}
        <button
          className="relative hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition sm:block"
          title="Notificações e Alertas"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#FFAA00] ring-2 ring-white"></span>
        </button>

        {/* Current plant context (settings are opened only from the profile menu) */}
        <div title="Planta atual" className="hidden items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-white px-3 py-1.5 text-xs font-medium text-[#263548] shadow-xs md:flex">
          <MapPin className="h-3.5 w-3.5 text-[#FFAA00]" />
          <span className="max-w-28 truncate">{plantCode || 'Planta Sorocaba'}</span>
        </div>

        {/* Assistente Flash Button */}
        {onOpenAssistant && (
          <button
            onClick={onOpenAssistant}
            title="Assistente Flash • Mago do PCP (Ctrl + K)"
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 hover:border-amber-400 shadow-xs"
          >
            <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-600" />
            <span className="hidden sm:inline">Assistente Flash</span>
            <kbd className="hidden md:inline-block rounded border border-amber-300 bg-white/80 px-1 text-[9px] text-amber-800 font-mono">
              Ctrl+K
            </kbd>
          </button>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Atualizar dados operacionais"
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md border border-[#DCE3EB] transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#FFAA00]' : ''}`} />
        </button>

        {/* User Badge / Login */}
        {currentUser ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[10px] font-medium text-emerald-700 sm:px-2.5 sm:text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{currentUser.role}</span>
          </span>
        ) : (
          <button
            onClick={onOpenAuth}
            className="inline-flex items-center gap-1.5 text-xs bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold px-3 py-1.5 rounded-lg transition shadow-xs"
          >
            <Lock className="h-3.5 w-3.5" />
            Entrar
          </button>
        )}
      </div>
    </header>
  );
};

