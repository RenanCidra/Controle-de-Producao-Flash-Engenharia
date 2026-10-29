import React, { useState, useEffect } from 'react';
import {
  Menu,
  Calendar,
  Bell,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { AuthUser } from '../api.ts';
import { getIntlLocale } from '../i18n/index.ts';

interface HeaderProps {
  plantCode?: string | null;
  currentUser: AuthUser | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  plantCode,
  currentUser,
  loading,
  onRefresh,
  onOpenAuth,
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
    <header className="h-14 border-b border-[#DCE3EB] px-6 flex items-center justify-between bg-white text-[#263548] select-none z-10 shrink-0">
      {/* Left branding and breadcrumb / title */}
      <div className="flex items-center gap-3">
        <button
          className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
          title="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-[#263548] tracking-tight">
            Controle de Produção Industrial
          </h1>
          <span className="text-slate-300 text-xs">•</span>
          <span className="text-xs text-[#64748B] font-medium">
            Flash Engenharia • Operação Interna
          </span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Date and time display */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B] font-mono">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span>{currentDateTime}</span>
        </div>

        {/* Notifications with amber badge */}
        <button
          className="relative p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
          title="Notificações e Alertas"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#FFAA00] ring-2 ring-white"></span>
        </button>

        {/* Current plant context (settings are opened only from the profile menu) */}
        <div title="Planta atual" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DCE3EB] bg-white text-xs font-medium text-[#263548] shadow-xs">
          <MapPin className="h-3.5 w-3.5 text-[#FFAA00]" />
          <span>{plantCode || 'Planta Sorocaba'}</span>
        </div>

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
          <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md border border-emerald-200 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" />
            {currentUser.role}
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

