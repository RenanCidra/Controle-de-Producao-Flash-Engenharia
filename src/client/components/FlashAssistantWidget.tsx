import React, { useState, useRef, useEffect } from 'react';
import {
  Zap,
  X,
  Send,
  Mic,
  MicOff,
  Sparkles,
  Bot,
  User,
  ArrowRight,
  RefreshCw,
  Trash2,
  Minimize2,
  ChevronRight,
  Clock,
  AlertTriangle,
  Package,
  Layers,
} from 'lucide-react';
import { api, AuthUser } from '../api.ts';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: Array<{
    type: string;
    target: string;
    label: string;
  }>;
}

interface FlashAssistantWidgetProps {
  currentUser: AuthUser | null;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (tab: string, options?: { op?: string; subTab?: string }) => void;
}

export const FlashAssistantWidget: React.FC<FlashAssistantWidgetProps> = ({
  currentUser,
  isOpen,
  onToggle,
  onNavigate,
}) => {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: `⚡ **Olá${currentUser?.name ? `, ${currentUser.name}` : ''}!** Sou o **Assistente Flash**, seu copiloto de chão de fábrica e "Mago do PCP".\n\nPosso monitorar ordens de produção (OPs), ocorrências, insumos críticos, apontamentos e dados integrados ao TOTVS Protheus.\n\nComo posso acelerar sua operação agora?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [quickPills] = useState([
    { label: '⚡ Resumo do Turno', prompt: 'Resumo do turno e briefing operacional' },
    { label: '⚠️ OPs Atrasadas', prompt: 'Quais ordens de produção estão atrasadas ou paradas?' },
    { label: '📋 Ocorrências Abertas', prompt: 'Quais ocorrências estão em aberto no chão de fábrica?' },
    { label: '📦 Estoque Crítico', prompt: 'Quais insumos estão com estoque crítico ou abaixo do mínimo?' },
    { label: '🔄 Status Protheus', prompt: 'Qual o status da última sincronização com o Protheus?' },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Rolagem suave até a última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen, messages]);

  // Suporte a ditado por voz (Web Speech API)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'pt-BR';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        speechRecognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechRecognitionRef.current) return;
    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Falha ao iniciar reconhecimento de voz:', err);
        setIsListening(false);
      }
    }
  };

  // Enviar mensagem
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await api.sendCopilotMessage(text);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: response.actions,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `assistant-err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Não foi possível completar a consulta no momento:** ${err?.message || 'Erro de comunicação.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Disparar Briefing de Turno direto
  const handleQuickBriefing = async () => {
    setLoading(true);
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: '⚡ Gerar Briefing Operacional do Turno',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await api.getCopilotBriefing();
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: response.actions,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ Falha ao gerar briefing: ${err?.message || 'Serviço temporariamente indisponível.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (target: string) => {
    // Ex: "traceability?op=000101" ou "occurrences" ou "inventory"
    const [tab, queryString] = target.split('?');
    const params = new URLSearchParams(queryString || '');
    const op = params.get('op') || undefined;
    const subTab = params.get('sub') || undefined;

    onNavigate(tab, { op, subTab });
  };

  const clearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: `⚡ Histórico limpo. Como posso ajudar agora?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Formatador simples de markdown para texto do assistente
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Itens de lista
      if (line.startsWith('* ') || line.startsWith('- ')) {
        const itemContent = line.slice(2);
        return (
          <li key={idx} className="ml-4 list-disc text-xs leading-relaxed text-slate-200">
            {renderInlineMarkdown(itemContent)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs leading-relaxed text-slate-100">
          {renderInlineMarkdown(line)}
        </p>
      );
    });
  };

  const renderInlineMarkdown = (content: string) => {
    // Processa **negrito** e `código`
    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-amber-300">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[11px] text-amber-200"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <>
      {/* Botão flutuante de acionamento (canto inferior direito) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          title="Abrir Assistente Flash (Ctrl + K)"
          aria-label="Abrir Assistente Flash"
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-[#1E293B] py-2.5 pl-3.5 pr-4 text-white shadow-xl shadow-amber-950/20 ring-1 ring-[#FFAA00]/40 transition-all duration-200 hover:scale-105 hover:bg-[#0F172A] hover:ring-[#FFAA00] active:scale-95"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#FFAA00] to-amber-300 text-slate-950 shadow-sm">
            <Zap className="h-4 w-4 fill-slate-950 text-slate-950" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
          </div>

          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-white">Assistente Flash</span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-400">
                PCP
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Copiloto Inteligente • Ctrl+K</span>
          </div>
        </button>
      )}

      {/* Janela Drawer do Assistente */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 flex h-[620px] max-h-[calc(100vh-32px)] w-[440px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-[#182232] via-[#0F172A] to-[#0B0F19] text-white shadow-2xl shadow-black/60 ring-1 ring-white/10"
          role="dialog"
          aria-label="Janela do Assistente Flash"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 bg-[#1E293B]/80 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FFAA00] to-amber-300 text-slate-950 shadow-md shadow-amber-500/20">
                <Zap className="h-5 w-5 fill-slate-950 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-tight text-white">Assistente Flash</h2>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Mago do PCP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Inteligência Industrial & Rastreabilidade Protheus
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                title="Limpar conversa"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={onToggle}
                title="Fechar"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Barra de ação rápida no topo (Briefing em 1 clique) */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Ações Rápidas:</span>
            </div>
            <button
              onClick={handleQuickBriefing}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/25 active:scale-95 disabled:opacity-50"
            >
              <Zap className="h-3 w-3 fill-amber-300" />
              <span>Resumo do Turno</span>
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-amber-500/40 text-amber-400 shadow-sm">
                    <Zap className="h-3.5 w-3.5 fill-amber-400" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-2`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 shadow-sm text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-xs'
                        : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-tl-xs'
                    }`}
                  >
                    {msg.sender === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="space-y-1">{renderFormattedText(msg.text)}</div>
                    )}
                  </div>

                  {/* Ações interativas / botões de navegação sugeridos pelo assistente */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.actions.map((act, aIdx) => (
                        <button
                          key={aIdx}
                          onClick={() => handleActionClick(act.target)}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-amber-300 shadow-xs transition hover:bg-amber-500 hover:text-slate-950 active:scale-95"
                        >
                          <span>{act.label}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}

                  <span
                    className={`block text-[10px] text-slate-500 ${
                      msg.sender === 'user' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {msg.sender === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-600/30 ring-1 ring-amber-500/50 text-amber-300">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Indicador de carregamento */}
            {loading && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-amber-500/40 text-amber-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                </div>
                <div className="rounded-2xl rounded-tl-xs border border-slate-700/60 bg-slate-800/90 px-3.5 py-2.5 shadow-sm text-xs text-slate-300 flex items-center gap-2">
                  <span className="flex space-x-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Consultando chão de fábrica...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sugestões rápidas (Chips industriais) */}
          {messages.length <= 3 && (
            <div className="shrink-0 border-t border-slate-800/80 bg-slate-900/40 px-3 py-2">
              <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Perguntas Frequentes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickPills.map((pill, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(pill.prompt)}
                    className="rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-300 transition hover:border-amber-500/60 hover:bg-slate-700 hover:text-white active:scale-95"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Barra de Entrada / Input */}
          <div className="shrink-0 border-t border-slate-700/60 bg-[#1E293B]/90 p-3 backdrop-blur-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-1.5"
            >
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  title={isListening ? 'Ouvindo... Clique para parar' : 'Ditar pergunta por voz'}
                  className={`rounded-xl p-2 transition ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse ring-2 ring-rose-400'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-amber-400'
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  isListening
                    ? 'Ouvindo... Fale agora'
                    : 'Pergunte sobre OPs, ocorrências, insumos...'
                }
                disabled={loading}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs text-white placeholder-slate-400 shadow-inner focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!inputValue.trim() || loading}
                title="Enviar mensagem"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FFAA00] to-amber-300 text-slate-950 shadow-sm transition hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
