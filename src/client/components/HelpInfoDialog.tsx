import React, { useEffect } from 'react';
import { ExternalLink, FileText, Keyboard, Lightbulb, MessageCircle, X } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

const t = translateText;
type HelpInfoMode = 'help' | 'release' | 'shortcuts';

const shortcutRows = [
  { action: 'Abrir ou fechar o Assistente Flash', keys: ['Ctrl', 'K'] },
  { action: 'Mostrar atalhos de teclado', keys: ['Ctrl', '/'] },
  { action: 'Fechar menu, janela ou painel aberto', keys: ['Esc'] },
];

export const HelpInfoDialog: React.FC<{ mode: HelpInfoMode; onClose: () => void }> = ({ mode, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const title = mode === 'help' ? 'Central de Ajuda' : mode === 'release' ? 'Notas de versão' : 'Atalhos de teclado';
  const Icon = mode === 'help' ? Lightbulb : mode === 'release' ? FileText : Keyboard;
  return <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="help-info-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon className="h-5 w-5" /></span><h2 id="help-info-title" className="font-semibold text-slate-900">{t(title)}</h2></div><button type="button" onClick={onClose} aria-label={t('Fechar')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      {mode === 'shortcuts' ? <div className="divide-y divide-slate-100 px-5">{shortcutRows.map(row => <div key={row.action} className="flex items-center justify-between gap-4 py-4"><span className="text-sm text-slate-700">{t(row.action)}</span><span className="flex shrink-0 items-center gap-1">{row.keys.map(key => <kbd key={key} className="min-w-8 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-slate-600 shadow-sm">{key === 'Ctrl' && navigator.platform?.includes('Mac') ? '⌘' : key}</kbd>)}</span></div>)}</div>
        : mode === 'release' ? <div className="space-y-3 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('Ajuda e feedback')}</p><ul className="space-y-2 text-sm leading-relaxed text-slate-600"><li>• {t('Menu da conta com acesso aos documentos oficiais e à página Sobre a Flash.')}</li><li>• {t('Formulário de feedback e caixa de triagem para administradores e supervisores.')}</li><li>• {t('Atalhos de teclado para abrir o Assistente e consultar os comandos.')}</li></ul></div>
          : <div className="space-y-4 p-5"><p className="text-sm leading-relaxed text-slate-600">{t('O Nexus ajuda a consultar o andamento da produção espelhado do Protheus e centraliza a comunicação interna.')}</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><FileText className="mb-2 h-4 w-4 text-amber-600" /><b className="block text-sm text-slate-800">{t('Pedidos e OPs')}</b><p className="mt-1 text-xs leading-relaxed text-slate-500">{t('Consulte pedidos, ordens e etapas disponíveis no espelho operacional.')}</p></div><div className="rounded-xl border border-slate-200 p-3"><MessageCircle className="mb-2 h-4 w-4 text-amber-600" /><b className="block text-sm text-slate-800">{t('Central de comunicação')}</b><p className="mt-1 text-xs leading-relaxed text-slate-500">{t('Converse individualmente ou por grupos de setor habilitados.')}</p></div></div><a href="https://flashengenharia.com.br/sobre/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800">{t('Sobre a Flash')}<ExternalLink className="h-3.5 w-3.5" /></a></div>}
    </section>
  </div>;
};

export type { HelpInfoMode };
