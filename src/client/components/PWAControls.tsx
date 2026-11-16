import React, { useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';
import { translateText } from '../i18n/index.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled || (!canInstall && !isIOS)) return null;

  const handleClick = async () => {
    if (isIOS && !canInstall) {
      setShowIOSModal(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title={translateText('Instalar aplicativo NexusPCP neste dispositivo')}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#263548] transition hover:border-[#FFAA00] hover:bg-[#FFF9EB] ${compact ? 'px-2 py-1 text-[11px]' : ''}`}
      >
        <Download className="h-3.5 w-3.5 text-[#D97706]" />
        <span className={compact ? 'hidden sm:inline' : ''}>{translateText('Instalar App')}</span>
      </button>

      {showIOSModal && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={translateText('Instalar NexusPCP no iOS')}
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#DCE3EB] bg-white p-5 text-[#263548] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#D97706]">{translateText('Instalação no iPhone / iPad')}</p>
                <h3 className="mt-1 text-base font-bold text-[#151C25]">{translateText('Adicionar à Tela de Início')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={translateText('Fechar')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-4 space-y-2.5 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#151C25] text-[10px] font-bold text-[#FFAA00]">1</span>
                <span>{translateText('Toque no botão Compartilhar')} <Share className="inline h-3.5 w-3.5 text-sky-600" /> {translateText('na barra do Safari.')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#151C25] text-[10px] font-bold text-[#FFAA00]">2</span>
                <span>{translateText('Role e toque em "Adicionar à Tela de Início".')}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#151C25] text-[10px] font-bold text-[#FFAA00]">3</span>
                <span>{translateText('Confirme tocando em "Adicionar".')}</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-400/50 bg-[#151C25] px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#FFAA00]" />
      <span>{translateText('Sem conexão com a rede. Tentando reconectar…')}</span>
    </div>
  );
};
