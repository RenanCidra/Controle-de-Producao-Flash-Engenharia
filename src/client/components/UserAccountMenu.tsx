import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LogIn, LogOut, Settings, UserRound } from 'lucide-react';
import type { AuthUser } from '../api.ts';
import { readUserPreferences, subscribeToUserPreferences } from '../modules/auth/user-preferences.ts';

interface UserAccountMenuProps {
  currentUser: AuthUser | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenAuth?: () => void;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  compact?: boolean;
}

export const UserAccountMenu: React.FC<UserAccountMenuProps> = ({
  currentUser,
  onOpenProfile,
  onOpenSettings,
  onLogout,
  onOpenAuth,
  onCloseMobile,
  collapsed = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = currentUser?.name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'RC';

  useEffect(() => {
    const refresh = () => setAvatarDataUrl(readUserPreferences(currentUser?.uid).avatarDataUrl);
    refresh();
    return subscribeToUserPreferences(refresh);
  }, [currentUser?.uid]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  const avatar = (size: 'small' | 'regular' = 'regular') => avatarDataUrl
    ? <img src={avatarDataUrl} alt="" className={`${size === 'small' ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 rounded-full border border-[#3E4F63] object-cover`} />
    : <span className={`${size === 'small' ? 'h-8 w-8' : 'h-9 w-9'} flex shrink-0 items-center justify-center rounded-full border border-[#3E4F63] bg-[#273547] text-xs font-bold uppercase text-white`}>{initials}</span>;

  return <div ref={rootRef} className={`relative z-[60] ${compact ? 'inline-flex' : 'w-full'}`}>
    {open && <div className={`absolute bottom-[calc(100%+8px)] z-[70] w-64 overflow-hidden rounded-2xl border border-[#2B3747] bg-[#151C25] p-2 text-xs text-slate-200 shadow-2xl backdrop-blur-md ${compact ? 'right-0' : collapsed ? 'left-[calc(100%+8px)]' : 'left-2'}`} style={{ boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)' }}>
      <button type="button" onClick={() => { close(); onOpenProfile(); }} className="group flex w-full items-center justify-between rounded-xl p-2.5 text-left transition hover:bg-[#1C2532]">
        <span className="flex min-w-0 items-center gap-2.5">{avatar()}<span className="min-w-0"><b className="block truncate text-xs text-white">{currentUser?.name || 'Renan Cidra'}</b><small className="mt-0.5 block truncate text-[10px] text-slate-400">{currentUser?.role || 'Acesso Operacional'} • Flash</small></span></span>
        <ChevronRight className="ml-2 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-[#FFAA00]" />
      </button>
      <div className="my-1 h-px bg-[#263342]" />
      <button type="button" onClick={() => { close(); onOpenProfile(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-[#1C2532] hover:text-white"><UserRound className="h-4 w-4 text-slate-400" /><span className="font-medium">Meu perfil</span></button>
      <button type="button" onClick={() => { close(); onCloseMobile?.(); onOpenSettings(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-[#1C2532] hover:text-white"><Settings className="h-4 w-4 text-[#FFAA00]" /><span className="font-medium">Configurações</span></button>
      {currentUser ? <button type="button" onClick={() => { close(); onLogout(); }} className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300"><LogOut className="h-4 w-4 text-slate-400" /><span className="font-medium">Sair</span></button>
        : <button type="button" onClick={() => { close(); onOpenAuth?.(); }} className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold text-[#FFAA00] transition hover:bg-[#FFAA00]/10"><LogIn className="h-4 w-4" /><span>Entrar no Sistema</span></button>}
    </div>}

    <button type="button" onClick={() => setOpen((wasOpen) => !wasOpen)} aria-expanded={open} aria-label="Opções do usuário" title={collapsed ? `Opções do usuário · ${currentUser?.name || 'Conta'}` : 'Opções do usuário'} className={`flex items-center rounded-xl border border-transparent bg-[#151C25] text-left transition hover:border-[#FFAA00]/40 hover:bg-[#1C2532] ${compact ? 'h-10 w-10 justify-center border-[#334155]' : collapsed ? 'w-full justify-center px-0 py-1.5' : 'w-full justify-between px-2 py-1.5'} ${open ? 'border-[#FFAA00]/50 bg-[#1C2532]' : ''}`}>
      <span className={`flex min-w-0 items-center overflow-hidden ${compact || collapsed ? '' : 'gap-2.5'}`}>{avatar('small')}{!compact && !collapsed && <span className="min-w-0 text-left"><b className="block truncate text-xs leading-tight text-white">{currentUser?.name || 'Renan Cidra'}</b><small className="mt-0.5 block truncate text-[10px] leading-tight text-slate-400">{currentUser?.role || 'Acesso Operacional'}</small></span>}</span>
      {!compact && !collapsed && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-[#FFAA00]' : ''}`} />}
    </button>
  </div>;
};
