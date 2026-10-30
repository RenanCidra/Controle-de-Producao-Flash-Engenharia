import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Briefcase, Coffee, LoaderCircle, Mic, MicOff, Send, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { api } from '../api.ts';
import type { AuthUser } from '../api.ts';
import { getAppLanguage, getIntlLocale, translateText } from '../i18n/index.ts';

export type PersonalityMode = 'direct' | 'casual' | 'formal';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: Array<{ type: string; target: string; label: string }>;
  mode?: 'gemini' | 'data_fallback';
  error?: boolean;
}

interface FlashAssistantWidgetProps {
  currentUser: AuthUser | null;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (tab: string, options?: { op?: string; subTab?: string }) => void;
}

const t = (text: string) => translateText(text);
const currentTime = () => new Date().toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' });

function makeWelcome(name?: string, mode: PersonalityMode = 'casual'): Message {
  let text = '';
  if (mode === 'direct') {
    text = `${name ? `${t('Olá')}, ${name}.` : `${t('Olá')}.`} ${t('Assistente Flash conectado no modo Direto. Pergunte sobre OPs, ocorrências ou estoques para respostas imediatas.')}`;
  } else if (mode === 'formal') {
    text = `${name ? `${t('Prezado(a)')} ${name},` : `${t('Prezado(a)')},`} ${t('Prezado(a), sou o Assistente Flash, copiloto de planejamento e controle da produção industrial. Como posso auxiliá-lo(a) nesta sessão?')}`;
  } else {
    text = `${name ? `${t('Olá')}, ${name}!` : `${t('Olá')}!`} ${t('Sou o Assistente Flash, seu copiloto no PCP e chão de fábrica.')}\n\n${t('Posso tirar dúvidas sobre a produção, analisar o andamento do turno, checar qualquer OP ou te guiar pelo sistema. Como posso te ajudar hoje?')}`;
  }
  return {
    id: 'welcome',
    sender: 'assistant',
    text,
    timestamp: currentTime(),
  };
}

const quickQuestions = [
  { label: 'Resumo do Turno', prompt: 'Resumo do Turno' },
  { label: 'OPs atrasadas', prompt: 'Quais OPs estão atrasadas?' },
  { label: 'Ocorrências abertas', prompt: 'Quais ocorrências estão abertas?' },
  { label: 'Estoque crítico', prompt: 'Quais itens de estoque estão abaixo do mínimo?' },
];

function renderMessageText(text: string): React.ReactNode {
  const renderInline = (value: string, lineIndex: number) => value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, partIndex) => {
    const key = `${lineIndex}-${partIndex}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{part.slice(1, -1)}</code>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });

  return text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div aria-hidden="true" key={`blank-${index}`} className="h-2" />;
    const bullet = trimmed.match(/^(?:[-*])\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      return (
        <p key={`line-${index}`} className="flex gap-2 leading-5">
          <span className="select-none text-amber-600">{bullet ? '•' : `${trimmed.match(/^\d+/)?.[0]}.`}</span>
          <span>{renderInline((bullet || ordered)![1], index)}</span>
        </p>
      );
    }
    const heading = trimmed.replace(/^#{1,3}\s+/, '');
    return <p key={`line-${index}`} className="leading-5">{renderInline(heading, index)}</p>;
  });
}

export const FlashAssistantWidget: React.FC<FlashAssistantWidgetProps> = ({
  currentUser,
  isOpen,
  onToggle,
  onNavigate,
}) => {
  const [personality, setPersonality] = useState<PersonalityMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexus_copilot_personality');
      if (saved === 'direct' || saved === 'formal' || saved === 'casual') return saved;
    }
    return 'casual';
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const initialMode: PersonalityMode =
      typeof window !== 'undefined' &&
      (localStorage.getItem('nexus_copilot_personality') === 'direct' ||
        localStorage.getItem('nexus_copilot_personality') === 'formal')
        ? (localStorage.getItem('nexus_copilot_personality') as PersonalityMode)
        : 'casual';
    return [makeWelcome(currentUser?.name, initialMode)];
  });
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  const handlePersonalityChange = (newMode: PersonalityMode) => {
    setPersonality(newMode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('nexus_copilot_personality', newMode);
      } catch {
        // Storage unavailable
      }
    }
    setMessages((previous) => {
      if (previous.length === 1 && previous[0].id === 'welcome') {
        return [makeWelcome(currentUser?.name, newMode)];
      }
      return previous;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isOpen, messages, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onToggle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = getIntlLocale();
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInputValue((previous) => `${previous}${previous ? ' ' : ''}${transcript}`.slice(0, 2000));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    speechRecognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* Recognition may not have started. */ }
      speechRecognitionRef.current = null;
    };
  }, []);

  const handleSendMessage = async (suggestedText?: string) => {
    const text = (suggestedText ?? inputValue).trim();
    if (!text || loading) return;

    const history = messages
      .filter((item) => item.id !== 'welcome' && !item.error)
      .slice(-10)
      .map((item) => ({ role: item.sender === 'user' ? 'user' as const : 'model' as const, text: item.text }));
    const userMessage: Message = { id: `user-${Date.now()}`, sender: 'user', text, timestamp: currentTime() };
    setMessages((previous) => [...previous, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await api.sendCopilotMessage(text, history, getAppLanguage(), personality);
      setMessages((previous) => [...previous, {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: currentTime(),
        mode: response.mode,
        actions: response.actions,
      }]);
    } catch (error: any) {
      setMessages((previous) => [...previous, {
        id: `assistant-error-${Date.now()}`,
        sender: 'assistant',
        text: error?.message || t('Não foi possível consultar o assistente agora. Verifique a conexão e tente novamente.'),
        timestamp: currentTime(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (target: string) => {
    const [tab, queryString] = target.split('?');
    const validTabs = new Set(['dashboard', 'traceability', 'occurrences', 'inventory', 'production-lines', 'production-orders', 'settings']);
    if (!validTabs.has(tab)) return;
    const params = new URLSearchParams(queryString || '');
    onNavigate(tab, { op: params.get('op') || undefined, subTab: params.get('sub') || undefined });
  };

  const clearHistory = () => {
    setMessages([makeWelcome(currentUser?.name, personality)]);
    setInputValue('');
  };

  const toggleListening = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          title={`${t('Abrir Assistente Flash')} · Ctrl+K`}
          aria-label={`${t('Abrir Assistente Flash')} (Ctrl+K)`}
          className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300 bg-slate-900 shadow-lg shadow-slate-950/20 ring-2 ring-white transition hover:scale-105 hover:bg-slate-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 sm:bottom-5 sm:right-5"
        >
          <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
        </button>
      )}

      {isOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t('Assistente Flash')}
          className="fixed inset-x-3 bottom-3 top-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#DCE3EB] bg-white text-[#263548] shadow-2xl shadow-slate-950/25 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[min(680px,calc(100dvh-32px))] sm:w-[420px]"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-[#E7ECF1] bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 ring-1 ring-amber-300">
                <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-[#263548]">{t('Assistente Flash')}</h2>
                <p className="truncate text-[11px] text-slate-500">{t('Dados disponíveis no sistema')}</p>
              </div>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1">
              <button type="button" onClick={clearHistory} disabled={loading} title={t('Limpar conversa')} aria-label={t('Limpar conversa')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40">
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={onToggle} title={t('Fechar')} aria-label={t('Fechar')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E7ECF1] bg-[#F8FAFC] px-4 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-600">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{t('Consulta operacional')}</span>
            </div>
            <button type="button" onClick={() => void handleSendMessage(t('Resumo do turno'))} disabled={loading} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
              {t('Resumo do turno')}
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-white p-4" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`flex gap-2.5 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.sender === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 ring-1 ring-amber-300">
                    <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                  </div>
                )}
                <div className={`min-w-0 max-w-[88%] space-y-1.5 ${message.sender === 'user' ? 'text-right' : ''}`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm ${message.sender === 'user'
                    ? 'rounded-tr-sm bg-amber-400 text-slate-950'
                    : message.error
                      ? 'rounded-tl-sm border border-rose-200 bg-rose-50 text-rose-900'
                      : 'rounded-tl-sm border border-[#E7ECF1] bg-[#F8FAFC] text-[#263548]'}`}>
                    <div className="space-y-1">{renderMessageText(message.text)}</div>
                  </div>
                  {message.mode === 'gemini' && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      ⚡ {t('Assistente Flash')}
                    </span>
                  )}
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {message.actions.map((action, index) => (
                        <button key={`${message.id}-${index}`} type="button" onClick={() => handleActionClick(action.target)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-950">
                          <span>{action.label}</span><ArrowRight className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                  <time className={`block text-[10px] text-slate-400 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>{message.timestamp}</time>
                </div>
              </article>
            ))}

            {messages.length === 1 && !loading && (
              <div className="space-y-2 pl-10">
                <p className="text-[11px] font-semibold text-slate-500">{t('Sugestões')}</p>
                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((question) => (
                    <button key={question.label} type="button" onClick={() => void handleSendMessage(t(question.prompt))} className="rounded-full border border-[#DCE3EB] bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-900">
                      {t(question.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 pl-10 text-xs text-slate-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                </span>
                <span className="text-[12px] font-medium text-slate-600">{t('Assistente Flash digitando…')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <footer className="shrink-0 border-t border-[#E7ECF1] bg-[#F8FAFC] p-3">
            {speechSupported && (
              <div className="mb-2 text-[10px] text-slate-500" aria-live="polite">{isListening ? t('Ouvindo... Fale agora') : ''}</div>
            )}
            <form onSubmit={(event) => { event.preventDefault(); void handleSendMessage(); }} className="flex items-center gap-2">
              {speechSupported && (
                <button type="button" onClick={toggleListening} disabled={loading} title={t(isListening ? 'Parar ditado' : 'Ditar pergunta por voz')} aria-label={t(isListening ? 'Parar ditado' : 'Ditar pergunta por voz')} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${isListening ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-[#DCE3EB] bg-white text-slate-500 hover:border-amber-300 hover:text-slate-900'}`}>
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value.slice(0, 2000))}
                maxLength={2000}
                placeholder={t('Pergunte sobre OPs, ocorrências, insumos...')}
                disabled={loading}
                aria-label={t('Pergunte sobre OPs, ocorrências, insumos...')}
                className="h-10 min-w-0 flex-1 rounded-xl border border-[#DCE3EB] bg-white px-3 text-[13px] text-[#263548] placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
              />
              <button type="submit" disabled={!inputValue.trim() || loading} title={t('Enviar mensagem')} aria-label={t('Enviar mensagem')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] text-slate-400">{t('Confira informações críticas na tela de origem antes de agir.')}</p>
          </footer>
        </section>
      )}
    </>
  );
};

