import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, Keyboard, Lightbulb, LogIn, LogOut, MessageCircleQuestion, Settings, ShieldCheck, UserRound, WandSparkles } from 'lucide-react';
import type { AuthUser, FeedbackCategory } from '../api.ts';
import { readUserPreferences, subscribeToUserPreferences } from '../modules/auth/user-preferences.ts';
import { translateText } from '../i18n/index.ts';

const t = translateText;
interface PopoverPosition { top: number; left: number }

interface UserAccountMenuProps {
  currentUser: AuthUser | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenFeedback?: (initialTab?: 'submit' | 'inbox', initialCategory?: FeedbackCategory) => void;
  onOpenHelpInfo?: (mode: 'help' | 'release' | 'shortcuts') => void;
  onOpenShortcuts?: () => void;
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
  onOpenFeedback,
  onOpenHelpInfo,
  onOpenShortcuts,
  onOpenAuth,
  onCloseMobile,
  collapsed = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<PopoverPosition | null>(null);
  const [helpPosition, setHelpPosition] = useState<PopoverPosition | null>(null);
  const initials = currentUser?.name?.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'RC';

  useEffect(() => {
    const refresh = () => setAvatarDataUrl(readUserPreferences(currentUser?.uid).avatarDataUrl);
    refresh();
    return subscribeToUserPreferences(refresh);
  }, [currentUser?.uid]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inside = rootRef.current?.contains(target) || mainMenuRef.current?.contains(target) || helpMenuRef.current?.contains(target);
      if (open && !inside) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        if (privacyOpen) setPrivacyOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
    };
  }, [open, helpOpen, privacyOpen]);

  useLayoutEffect(() => {
    if (!open) { setMenuPosition(null); setHelpPosition(null); return; }
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
    const updatePositions = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      const menu = mainMenuRef.current;
      if (!anchor || !menu) return;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      const preferredLeft = compact ? anchor.right - menuWidth : collapsed ? anchor.right + margin : anchor.left;
      const left = clamp(preferredLeft, margin, viewportWidth - menuWidth - margin);
      const below = anchor.bottom + margin;
      const above = anchor.top - menuHeight - margin;
      const preferredTop = compact
        ? below + menuHeight <= viewportHeight - margin ? below : above
        : above >= margin ? above : below;
      const top = clamp(preferredTop, margin, viewportHeight - menuHeight - margin);
      const nextMenu = { top, left };
      setMenuPosition(current => current?.top === nextMenu.top && current.left === nextMenu.left ? current : nextMenu);

      const help = helpMenuRef.current;
      if (!help || compact || !helpOpen) { setHelpPosition(null); return; }
      const helpWidth = help.offsetWidth;
      const helpHeight = help.offsetHeight;
      const rightSide = left + menuWidth + margin;
      const leftSide = left - helpWidth - margin;
      const preferredHelpLeft = rightSide + helpWidth <= viewportWidth - margin
        ? rightSide
        : leftSide >= margin ? leftSide : rightSide;
      const helpLeft = clamp(preferredHelpLeft, margin, viewportWidth - helpWidth - margin);
      const helpTop = clamp(top + menuHeight - helpHeight, margin, viewportHeight - helpHeight - margin);
      const nextHelp = { top: helpTop, left: helpLeft };
      setHelpPosition(current => current?.top === nextHelp.top && current.left === nextHelp.left ? current : nextHelp);
    };

    updatePositions();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePositions) : null;
    if (rootRef.current) observer?.observe(rootRef.current);
    if (mainMenuRef.current) observer?.observe(mainMenuRef.current);
    if (helpMenuRef.current) observer?.observe(helpMenuRef.current);
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);
    window.visualViewport?.addEventListener('resize', updatePositions);
    window.visualViewport?.addEventListener('scroll', updatePositions);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
      window.visualViewport?.removeEventListener('resize', updatePositions);
      window.visualViewport?.removeEventListener('scroll', updatePositions);
    };
  }, [open, helpOpen, privacyOpen, compact, collapsed]);

  const close = () => { setOpen(false); setHelpOpen(false); setPrivacyOpen(false); };
  const privileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR';
  const privacyLinks = [
    ['Termos de serviço', 'https://flashengenharia.com.br/wp-content/uploads/2026/03/009-Termos-De-Uso-1.pdf'],
    ['Política de Privacidade', 'https://flashengenharia.com.br/wp-content/uploads/2026/03/008-Politica-De-Privacidade-1.pdf'],
    ['Política de Cookies', 'https://flashengenharia.com.br/wp-content/uploads/2026/03/010-Politicas-De-Cookies-1.pdf'],
    ['Política de CFTV', 'https://flashengenharia.com.br/wp-content/uploads/2026/03/013-POLITICA-DE-CFTV_v2-2-1.pdf'],
  ];
  const helpContent = <>
    <button type="button" onClick={() => privacyOpen ? setPrivacyOpen(false) : setHelpOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-semibold text-white hover:bg-[#1C2532]"><ChevronLeft className="h-4 w-4" />{t(privacyOpen ? 'Central de privacidade' : 'Ajuda')}</button>
    <div className="my-1 h-px bg-[#263342]" />
    {privacyOpen ? privacyLinks.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" onClick={close} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-slate-300 hover:bg-[#1C2532] hover:text-white"><FileText className="h-4 w-4 text-slate-400" />{t(label)}</a>) : <>
      <button type="button" onClick={() => { close(); onOpenHelpInfo?.('help'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><MessageCircleQuestion className="h-4 w-4 text-slate-400" />{t('Central de Ajuda')}</button>
      <button type="button" onClick={() => setPrivacyOpen(true)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><span className="flex items-center gap-2.5"><ShieldCheck className="h-4 w-4 text-slate-400" />{t('Central de privacidade')}</span><ChevronRight className="h-4 w-4 text-slate-500" /></button>
      <button type="button" onClick={() => { close(); onOpenHelpInfo?.('release'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><WandSparkles className="h-4 w-4 text-slate-400" />{t('Notas de versão')}</button>
      <button type="button" onClick={() => { close(); onOpenShortcuts?.(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><span className="flex items-center gap-2.5"><Keyboard className="h-4 w-4 text-slate-400" />{t('Atalhos de teclado')}</span><kbd className="rounded border border-[#3B4653] px-1.5 py-0.5 text-[10px] text-slate-400">Ctrl+/</kbd></button>
      <div className="my-1 h-px bg-[#263342]" />
      {privacyLinks.slice(0, 2).map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" onClick={close} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-[#1C2532] hover:text-white"><span className="flex items-center gap-2.5"><FileText className="h-4 w-4 text-slate-400" />{t(label)}</span><ExternalLink className="h-3.5 w-3.5 text-slate-500" /></a>)}
      {onOpenFeedback && <button type="button" onClick={() => { close(); onOpenFeedback('submit', 'BUG'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><Lightbulb className="h-4 w-4 text-[#FFAA00]" />{t('Relatar um bug')}</button>}
      {onOpenFeedback && <button type="button" onClick={() => { close(); onOpenFeedback('submit', 'IDEA'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><WandSparkles className="h-4 w-4 text-slate-400" />{t('Enviar sugestão')}</button>}
      {privileged && onOpenFeedback && <button type="button" onClick={() => { close(); onOpenFeedback('inbox'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 hover:bg-[#1C2532] hover:text-white"><ShieldCheck className="h-4 w-4 text-slate-400" />{t('Feedback recebido')}</button>}
      <div className="my-1 h-px bg-[#263342]" />
      <a href="https://flashengenharia.com.br/sobre/" target="_blank" rel="noopener noreferrer" onClick={close} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-[#1C2532] hover:text-white"><span className="flex items-center gap-2.5"><ExternalLink className="h-4 w-4 text-[#FFAA00]" />{t('Sobre a Flash')}</span><ExternalLink className="h-3.5 w-3.5 text-slate-500" /></a>
    </>}
  </>;
  const avatar = (size: 'small' | 'regular' = 'regular') => {
    const imageUrl = avatarDataUrl || currentUser?.avatarUrl;
    return imageUrl
      ? <img src={imageUrl} alt="" className={`${size === 'small' ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 rounded-full border border-[#3E4F63] object-cover`} />
      : <span className={`${size === 'small' ? 'h-8 w-8' : 'h-9 w-9'} flex shrink-0 items-center justify-center rounded-full border border-[#3E4F63] bg-[#273547] text-xs font-bold uppercase text-white`}>{initials}</span>;
  };

  const handleMouseEnter = () => {
    if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
    if (!compact && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setOpen(true);
  };
  const handleMouseLeave = () => {
    if (compact || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    hoverCloseTimerRef.current = window.setTimeout(() => close(), 220);
  };
  const handleHelpMouseEnter = () => {
    if (!compact && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setPrivacyOpen(false);
      setHelpOpen(true);
    }
  };

  return <>
    <div ref={rootRef} data-user-account-menu onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className={`relative ${compact ? 'inline-flex' : 'w-full'}`}>
      <button type="button" onClick={(event) => { if (compact) { if (open) close(); else setOpen(true); } else if (event.detail === 0) setOpen(true); }} onFocus={() => { if (!compact) setOpen(true); }} aria-expanded={open} aria-label="Opções do usuário" title={collapsed ? `Opções do usuário · ${currentUser?.name || 'Conta'}` : 'Opções do usuário'} className={`flex items-center rounded-xl border border-transparent bg-[#151C25] text-left transition hover:border-[#FFAA00]/40 hover:bg-[#1C2532] ${compact ? 'h-10 w-10 justify-center border-[#334155]' : collapsed ? 'w-full justify-center px-0 py-1.5' : 'w-full justify-between px-2 py-1.5'} ${open ? 'border-[#FFAA00]/50 bg-[#1C2532]' : ''}`}>
        <span className={`flex min-w-0 items-center overflow-hidden ${compact || collapsed ? '' : 'gap-2.5'}`}>{avatar('small')}{!compact && !collapsed && <span className="min-w-0 text-left"><b className="block truncate text-xs leading-tight text-white">{currentUser?.name || 'Renan Cidra'}</b><small className="mt-0.5 block truncate text-[10px] leading-tight text-slate-400">{currentUser?.role || 'Acesso Operacional'}</small></span>}</span>
        {!compact && !collapsed && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-[#FFAA00]' : ''}`} />}
      </button>
    </div>
    {open && typeof document !== 'undefined' && createPortal(<>
      <div ref={mainMenuRef} data-user-account-menu-popover onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ position: 'fixed', zIndex: 90, top: menuPosition?.top ?? 8, left: menuPosition?.left ?? 8, visibility: menuPosition ? 'visible' : 'hidden', width: 'min(18rem, calc(100vw - 1rem))', maxHeight: 'calc(100dvh - 1rem)' }} className="overflow-y-auto rounded-2xl border border-[#2B3747] bg-[#151C25] p-2 text-xs text-slate-200 shadow-2xl backdrop-blur-md" >
        {helpOpen && compact ? helpContent : <>
          <button type="button" onClick={() => { close(); onOpenProfile(); }} className="group flex w-full items-center justify-between rounded-xl p-2.5 text-left transition hover:bg-[#1C2532]">
            <span className="flex min-w-0 items-center gap-2.5">{avatar()}<span className="min-w-0"><b className="block truncate text-xs text-white">{currentUser?.name || 'Renan Cidra'}</b><small className="mt-0.5 block truncate text-[10px] text-slate-400">{currentUser?.role || 'Acesso Operacional'} • Flash</small></span></span>
            <ChevronRight className="ml-2 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-[#FFAA00]" />
          </button>
          <div className="my-1 h-px bg-[#263342]" />
          <button type="button" onClick={() => { close(); onOpenProfile(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-[#1C2532] hover:text-white"><UserRound className="h-4 w-4 text-slate-400" /><span className="font-medium">{t('Meu perfil')}</span></button>
          <button type="button" onClick={() => { close(); onCloseMobile?.(); onOpenSettings(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-[#1C2532] hover:text-white"><Settings className="h-4 w-4 text-[#FFAA00]" /><span className="font-medium">{t('Configurações')}</span></button>
          <div className="my-1 h-px bg-[#263342]" />
          <button type="button" onMouseEnter={handleHelpMouseEnter} onClick={() => { setHelpOpen(true); setPrivacyOpen(false); }} aria-haspopup="menu" aria-expanded={helpOpen} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-[#1C2532] hover:text-white ${helpOpen ? 'bg-[#263342] text-white' : 'text-slate-300'}`}><span className="flex items-center gap-2.5"><Lightbulb className="h-4 w-4 text-slate-400" /><span className="font-medium">{t('Ajuda')}</span></span><ChevronRight className="h-4 w-4 text-slate-500" /></button>
          <div className="my-1 h-px bg-[#263342]" />
          {currentUser ? <button type="button" onClick={() => { close(); onLogout(); }} className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300"><LogOut className="h-4 w-4 text-slate-400" /><span className="font-medium">{t('Sair')}</span></button>
            : <button type="button" onClick={() => { close(); onOpenAuth?.(); }} className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-bold text-[#FFAA00] transition hover:bg-[#FFAA00]/10"><LogIn className="h-4 w-4" /><span>{t('Entrar no Sistema')}</span></button>}
        </>}
      </div>
      {!compact && helpOpen && <div ref={helpMenuRef} data-user-account-menu-popover onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ position: 'fixed', zIndex: 90, top: helpPosition?.top ?? 8, left: helpPosition?.left ?? 8, visibility: helpPosition ? 'visible' : 'hidden', width: 'min(16rem, calc(100vw - 1rem))', maxHeight: 'calc(100dvh - 1rem)' }} className="overflow-y-auto rounded-2xl border border-[#2B3747] bg-[#151C25] p-2 text-xs text-slate-200 shadow-2xl backdrop-blur-md">{helpContent}</div>}
    </>, document.body)}
  </>;
};
