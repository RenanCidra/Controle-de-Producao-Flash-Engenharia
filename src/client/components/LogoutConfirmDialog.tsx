import React, { useEffect } from 'react';
import { LogOut, X } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  userName?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const LogoutConfirmDialog: React.FC<LogoutConfirmDialogProps> = ({ isOpen, userName, busy = false, onCancel, onConfirm }) => {
  const t = translateText;
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#080D13]/65 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description" className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#334155] bg-[#151C25] text-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[#2B3747] px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#263548] text-[#FFAA00]"><LogOut size={17}/></span>
          <div className="min-w-0 flex-1"><h2 id="logout-confirm-title" className="text-sm font-semibold">{t('Deseja sair da sua conta?')}</h2><p id="logout-confirm-description" className="mt-1 text-xs text-slate-400">{userName ? t('A sessão de {{nome}} será encerrada neste dispositivo.').replace('{{nome}}', userName) : t('Sua sessão será encerrada neste dispositivo.')}</p></div>
          <button type="button" disabled={busy} onClick={onCancel} aria-label={t('Fechar confirmação')} className="rounded-lg p-1.5 text-slate-400 hover:bg-[#263548] hover:text-white disabled:opacity-40"><X size={16}/></button>
        </header>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" autoFocus disabled={busy} onClick={onCancel} className="rounded-lg border border-[#465365] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#202B39] disabled:opacity-50">{t('Continuar conectado')}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-3.5 py-2 text-xs font-bold text-[#151C25] transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"><LogOut size={14}/>{t(busy ? 'Encerrando…' : 'Sair da conta')}</button>
        </div>
      </section>
    </div>
  );
};
