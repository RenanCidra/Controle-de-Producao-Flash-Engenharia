import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

type Props = { children: React.ReactNode; onReturn: () => void };
type State = { failed: boolean };

export class ModuleErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Module render failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-[#263548]">
      <AlertTriangle className="h-8 w-8 text-[#A66300]"/>
      <h2 className="text-base font-semibold">{translateText('Não foi possível abrir este módulo')}</h2>
      <p className="max-w-md text-sm text-slate-500">{translateText('O restante do sistema continua disponível. Tente abrir o módulo novamente ou volte ao painel inicial.')}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"><RefreshCw size={14}/>{translateText('Recarregar sistema')}</button>
        <button type="button" onClick={this.props.onReturn} className="rounded-lg bg-[#151C25] px-3 py-2 text-xs font-semibold text-white hover:bg-[#263548]">{translateText('Voltar ao painel')}</button>
      </div>
    </div>;
  }
}
