import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Briefcase, Coffee, History, LoaderCircle, Maximize2, MessageSquarePlus, Mic, MicOff, Minimize2, Phone, Send, Settings, Settings2, Sparkles, Trash2, UserRound, X, Zap } from 'lucide-react';
import { api } from '../api.ts';
import type { AuthUser } from '../api.ts';
import { getAppLanguage, getIntlLocale, translateText } from '../i18n/index.ts';

export type PersonalityMode = 'direct' | 'casual' | 'formal';
export type TypingDisplayMode = 'realtime' | 'instant';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: Array<{ type: string; target: string; label: string }>;
  mode?: 'gemini' | 'data_fallback';
  error?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
}

interface FlashAssistantWidgetProps {
  currentUser: AuthUser | null;
  isOpen: boolean;
  onToggle: () => void;
  onOpenProfile: () => void;
  onNavigate: (tab: string, options?: { op?: string; subTab?: string }) => void;
}

const t = (text: string) => translateText(text);
const currentTime = () => new Date().toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' });
const personalityStorageKey = (uid?: string) => `nexus_copilot_personality_${uid || 'guest'}`;
const displayModeStorageKey = (uid?: string) => `nexus_copilot_display_mode_${uid || 'guest'}`;
const conversationStorageKey = (uid?: string) => `nexus_copilot_conversations_${uid || 'guest'}`;
const MAX_SAVED_CONVERSATIONS = 25;
const MAX_SAVED_MESSAGES = 80;

function createConversation(name?: string, mode: PersonalityMode = 'casual'): Conversation {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: t('Nova conversa'),
    updatedAt: new Date().toISOString(),
    messages: [makeWelcome(name, mode)],
  };
}

function loadConversations(uid?: string, name?: string, mode: PersonalityMode = 'casual'): Conversation[] {
  if (typeof window === 'undefined') return [createConversation(name, mode)];
  try {
    const stored = localStorage.getItem(conversationStorageKey(uid));
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((item): item is Conversation => Boolean(
        item && typeof item.id === 'string' && typeof item.title === 'string'
        && typeof item.updatedAt === 'string' && Array.isArray(item.messages)
        && item.messages.every((message: any) => message && typeof message.id === 'string'
          && (message.sender === 'user' || message.sender === 'assistant')
          && typeof message.text === 'string' && typeof message.timestamp === 'string'),
      )).slice(0, MAX_SAVED_CONVERSATIONS).map((item) => ({
        ...item,
        messages: item.messages.slice(-MAX_SAVED_MESSAGES),
      }));
      if (valid.length) return valid;
    }
  } catch {
    // Storage may be unavailable or contain an older invalid value.
  }
  return [createConversation(name, mode)];
}

const personalityOptions: Array<{
  value: PersonalityMode;
  label: string;
  description: string;
  Icon: typeof Zap;
}> = [
  { value: 'direct', label: 'Direto', description: 'Direto: respostas curtas, números e foco prático', Icon: Zap },
  { value: 'casual', label: 'Despojado', description: 'Despojado: tom descontraído, amigável e parceiro de fábrica', Icon: Coffee },
  { value: 'formal', label: 'Formal', description: 'Formal: tom executivo, corporativo e técnico', Icon: Briefcase },
];

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
  onOpenProfile,
  onNavigate,
}) => {
  const [personality, setPersonality] = useState<PersonalityMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(personalityStorageKey(currentUser?.uid));
      if (saved === 'direct' || saved === 'formal' || saved === 'casual') return saved;
    }
    return 'casual';
  });
  const [displayMode, setDisplayMode] = useState<TypingDisplayMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(displayModeStorageKey(currentUser?.uid));
      if (saved === 'realtime' || saved === 'instant') return saved;
    }
    return 'realtime';
  });
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const streamingAbortRef = useRef<(() => void) | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(currentUser?.uid, currentUser?.name, personality),
  );
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id || '');
  const [messages, setMessages] = useState<Message[]>(() => conversations[0]?.messages || [makeWelcome(currentUser?.name, personality)]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Monitor visualViewport so mobile virtual keyboard resizes the container and scrolls text
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const onViewportChange = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
      setViewportHeight(vv.height);
      if (isOpen) {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
      }
    };

    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    return () => {
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
    };
  }, [isOpen]);

  const handleDisplayModeChange = (mode: TypingDisplayMode) => {
    setDisplayMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(displayModeStorageKey(currentUser?.uid), mode);
      } catch {
        // Storage unavailable
      }
    }
  };

  useEffect(() => {
    return () => {
      streamingAbortRef.current?.();
    };
  }, []);

  useEffect(() => {
    setConversations((previous) => {
      const title = messages.find((message) => message.sender === 'user')?.text.trim().slice(0, 64) || t('Nova conversa');
      const existing = previous.some((conversation) => conversation.id === activeConversationId);
      const nextConversation: Conversation = {
        id: activeConversationId,
        title,
        updatedAt: new Date().toISOString(),
        messages: messages.slice(-MAX_SAVED_MESSAGES),
      };
      const updated = existing
        ? previous.map((conversation) => conversation.id === activeConversationId ? nextConversation : conversation)
        : [nextConversation, ...previous];
      return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_SAVED_CONVERSATIONS);
    });
  }, [messages, activeConversationId]);

  useEffect(() => {
    try {
      localStorage.setItem(conversationStorageKey(currentUser?.uid), JSON.stringify(conversations));
    } catch {
      // Keep the conversation usable when browser storage is full or unavailable.
    }
  }, [conversations, currentUser?.uid]);

  const handlePersonalityChange = (newMode: PersonalityMode) => {
    setPersonality(newMode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(personalityStorageKey(currentUser?.uid), newMode);
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

  // Only focus input on desktop upon initial opening (prevent virtual keyboard pop-ups on mobile)
  useEffect(() => {
    if (!isOpen) return;
    const isTouch = typeof window !== 'undefined' && (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
    if (!isTouch) {
      inputRef.current?.focus();
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [isOpen]);

  // Keep latest message smoothly scrolled into view without stealing mobile focus
  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (fullScreen) setFullScreen(false);
        else onToggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, fullScreen, onToggle]);

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

    if (streamingAbortRef.current) {
      streamingAbortRef.current();
      streamingAbortRef.current = null;
    }

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
      const assistantMessageId = `assistant-${Date.now()}`;
      const fullText = response.reply;

      if (displayMode === 'realtime') {
        setMessages((previous) => [...previous, {
          id: assistantMessageId,
          sender: 'assistant',
          text: '',
          timestamp: currentTime(),
          mode: response.mode,
          actions: response.actions,
        }]);
        setLoading(false);
        setStreamingMessageId(assistantMessageId);

        await new Promise<void>((resolve) => {
          let currentIndex = 0;
          const totalLength = fullText.length;
          const stepSize = Math.max(3, Math.ceil(totalLength / 60));
          const interval = setInterval(() => {
            currentIndex = Math.min(totalLength, currentIndex + stepSize);
            const currentSlice = fullText.slice(0, currentIndex);
            setMessages((previous) =>
              previous.map((m) => (m.id === assistantMessageId ? { ...m, text: currentSlice } : m))
            );
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });

            if (currentIndex >= totalLength) {
              clearInterval(interval);
              streamingAbortRef.current = null;
              setStreamingMessageId(null);
              resolve();
            }
          }, 16);

          streamingAbortRef.current = () => {
            clearInterval(interval);
            setMessages((previous) =>
              previous.map((m) => (m.id === assistantMessageId ? { ...m, text: fullText } : m))
            );
            setStreamingMessageId(null);
            resolve();
          };
        });
      } else {
        setMessages((previous) => [...previous, {
          id: assistantMessageId,
          sender: 'assistant',
          text: fullText,
          timestamp: currentTime(),
          mode: response.mode,
          actions: response.actions,
        }]);
      }
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
      setStreamingMessageId(null);
    }
  };

  const handleActionClick = (target: string) => {
    const [tab, queryString] = target.split('?');
    const validTabs = new Set(['dashboard', 'traceability', 'occurrences', 'inventory', 'production-lines', 'production-orders', 'settings']);
    if (!validTabs.has(tab)) return;
    const params = new URLSearchParams(queryString || '');
    onNavigate(tab, { op: params.get('op') || undefined, subTab: params.get('sub') || undefined });
  };

  const startNewConversation = () => {
    const conversation = createConversation(currentUser?.name, personality);
    setConversations((previous) => [conversation, ...previous].slice(0, MAX_SAVED_CONVERSATIONS));
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setHistoryOpen(false);
    setSettingsOpen(false);
    setInputValue('');
  };

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setHistoryOpen(false);
    setSettingsOpen(false);
    setInputValue('');
  };

  const deleteConversation = (conversationId: string) => {
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    if (conversationId === activeConversationId) {
      const next = remaining[0] || createConversation(currentUser?.name, personality);
      setConversations(remaining.length ? remaining : [next]);
      setActiveConversationId(next.id);
      setMessages(next.messages);
      setInputValue('');
    } else {
      setConversations(remaining);
    }
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
        <>
          {['ADMIN', 'SUPERVISOR', 'OPERATOR'].includes(currentUser?.role || '') && <button type="button" onClick={() => onNavigate('communications')} title="Central de comunicação" aria-label="Abrir central de comunicação" className="fixed bottom-[5.25rem] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[#DCE3EB] bg-white text-[#263548] shadow-lg shadow-slate-950/20 ring-2 ring-white transition hover:border-[#FFAA00] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFAA00] sm:bottom-[5.75rem] sm:right-5">
            <Phone className="h-5 w-5" />
          </button>}
          <button
            type="button"
            onClick={onToggle}
            title={`${t('Abrir Assistente Flash')} · Ctrl+K`}
            aria-label={`${t('Abrir Assistente Flash')} (Ctrl+K)`}
            className="flash-assistant-float fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300 bg-slate-900 shadow-lg shadow-slate-950/20 ring-2 ring-white transition-colors hover:bg-slate-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 sm:bottom-5 sm:right-5"
          >
            <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
          </button>
        </>
      )}

      {isOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t('Assistente Flash')}
          style={
            !fullScreen && typeof window !== 'undefined' && window.innerWidth < 640
              ? {
                  bottom: keyboardOffset > 0 ? `${keyboardOffset + 6}px` : undefined,
                  maxHeight: viewportHeight ? `${viewportHeight - 12}px` : undefined,
                }
              : undefined
          }
          className={fullScreen
            ? 'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-[#F1F4F7] text-[#263548] md:flex-row'
            : 'fixed inset-x-2 bottom-2 top-2 z-50 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#DCE3EB] bg-white text-[#263548] shadow-2xl shadow-slate-950/25 transition-[bottom,max-height] duration-150 ease-out sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[min(680px,calc(100dvh-32px))] sm:w-[420px]'}
        >
          {fullScreen && (
            <aside className="hidden w-64 shrink-0 flex-col border-r border-[#263548] bg-[#151C25] text-white md:flex lg:w-72">
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-amber-400/70">
                  <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{t('Assistente Flash')}</p>
                  <p className="truncate text-[11px] text-slate-400">{t('Dados disponíveis no sistema')}</p>
                </div>
              </div>
              <div className="p-4">
                <button type="button" onClick={startNewConversation} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white transition hover:border-amber-400/70 hover:bg-white/10 disabled:opacity-40">
                  <MessageSquarePlus className="h-4 w-4 text-amber-400" />{t('Nova conversa')}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('Histórico de conversas')}</p>
                <div className="space-y-1">
                  {conversations.map((conversation) => (
                    <div key={conversation.id} className={`group flex items-center gap-1 rounded-lg ${conversation.id === activeConversationId ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                      <button type="button" onClick={() => openConversation(conversation)} aria-current={conversation.id === activeConversationId ? 'true' : undefined} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs">
                        {conversation.title}
                      </button>
                      <button type="button" onClick={() => deleteConversation(conversation.id)} disabled={loading} title={t('Excluir conversa')} aria-label={`${t('Excluir conversa')}: ${conversation.title}`} className="mr-1 rounded-md p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${fullScreen ? 'border-[#DCE3EB] bg-white' : 'border-[#E7ECF1] bg-white'}`}>
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
              {fullScreen && <>
                <button type="button" onClick={onOpenProfile} title={t('Meu perfil')} aria-label={t('Meu perfil')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><UserRound className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setFullScreen(false); onNavigate('settings', { subTab: 'general' }); }} title={t('Configurações')} aria-label={t('Configurações')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><Settings className="h-4 w-4" /></button>
              </>}
              <button type="button" onClick={startNewConversation} disabled={loading} title={t('Nova conversa')} aria-label={t('Nova conversa')} className={`rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 ${fullScreen ? 'md:hidden' : ''}`}>
                <MessageSquarePlus className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => { setHistoryOpen((open) => !open); setSettingsOpen(false); }} aria-pressed={historyOpen} title={t('Histórico de conversas')} aria-label={t('Histórico de conversas')} className={`rounded-lg p-2 transition ${fullScreen ? 'md:hidden' : ''} ${historyOpen ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <History className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => { setSettingsOpen((open) => !open); setHistoryOpen(false); }} aria-pressed={settingsOpen} title={t('Configurações do assistente')} aria-label={t('Configurações do assistente')} className={`rounded-lg p-2 transition ${settingsOpen ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Settings2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setFullScreen((expanded) => !expanded)} aria-pressed={fullScreen} title={t(fullScreen ? 'Sair da tela cheia' : 'Expandir para tela cheia')} aria-label={t(fullScreen ? 'Sair da tela cheia' : 'Expandir para tela cheia')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                {fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => { setFullScreen(false); onToggle(); }} title={t('Fechar')} aria-label={t('Fechar')} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 ${fullScreen ? 'border-[#DCE3EB] bg-[#F8FAFC]' : 'border-[#E7ECF1] bg-[#F8FAFC]'}`}>
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-600">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className={`truncate ${fullScreen ? 'text-slate-200' : ''}`}>{t('Consulta operacional')}</span>
            </div>
            <button type="button" onClick={() => void handleSendMessage(t('Resumo do turno'))} disabled={loading} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
              {t('Resumo do turno')}
            </button>
          </div>

          {settingsOpen ? (
            <section className="flex-1 space-y-4 overflow-y-auto bg-white p-4" aria-label={t('Configurações do assistente')}>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{t('Configurações do assistente')}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t('Personalize o jeito como o assistente conversa com você.')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-800">{t('Modo de personalidade')}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{t(personalityOptions.find((option) => option.value === personality)?.description || '')}</p>
                </div>
                <div role="group" aria-label={t('Modo de personalidade')} className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
                  {personalityOptions.map(({ value, label, description, Icon }) => {
                    const selected = personality === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handlePersonalityChange(value)}
                        aria-pressed={selected}
                        title={t(description)}
                        className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${selected ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-amber-600' : ''}`} aria-hidden="true" />
                        <span className="truncate">{t(label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-800">{t('Exibição das respostas')}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    {displayMode === 'realtime'
                      ? t('Ver o assistente escrevendo em tempo real (digitação dinâmica).')
                      : t('Exibir a resposta completa inteira de uma só vez.')}
                  </p>
                </div>
                <div role="group" aria-label={t('Exibição das respostas')} className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
                  <button
                    type="button"
                    onClick={() => handleDisplayModeChange('realtime')}
                    aria-pressed={displayMode === 'realtime'}
                    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${displayMode === 'realtime' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                  >
                    <Sparkles className={`h-3.5 w-3.5 shrink-0 ${displayMode === 'realtime' ? 'text-amber-600' : ''}`} aria-hidden="true" />
                    <span className="truncate">{t('Em tempo real')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisplayModeChange('instant')}
                    aria-pressed={displayMode === 'instant'}
                    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${displayMode === 'instant' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
                  >
                    <Zap className={`h-3.5 w-3.5 shrink-0 ${displayMode === 'instant' ? 'text-amber-600' : ''}`} aria-hidden="true" />
                    <span className="truncate">{t('Resposta completa')}</span>
                  </button>
                </div>
              </div>
              <p className="rounded-lg border border-[#E7ECF1] px-3 py-2 text-[11px] leading-4 text-slate-500">{t('A preferência é salva para seu usuário neste navegador.')}</p>
            </section>
          ) : historyOpen ? (
            <div className="flex-1 space-y-3 overflow-y-auto bg-white p-4" aria-label={t('Histórico de conversas')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{t('Histórico de conversas')}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">{t('Conversas salvas neste navegador')}</p>
                </div>
                <button type="button" onClick={startNewConversation} disabled={loading} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50">
                  <MessageSquarePlus className="h-3.5 w-3.5" />{t('Nova conversa')}
                </button>
              </div>
              {conversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">{t('Nenhuma conversa salva ainda')}</div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <div key={conversation.id} className={`flex items-center gap-2 rounded-xl border p-2 ${conversation.id === activeConversationId ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                      <button type="button" onClick={() => openConversation(conversation)} aria-current={conversation.id === activeConversationId ? 'true' : undefined} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-white/80">
                        <span className="block truncate text-xs font-semibold text-slate-800">{conversation.title}</span>
                        <span className="mt-1 block text-[10px] text-slate-500">{new Date(conversation.updatedAt).toLocaleString(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' })} · {conversation.messages.length} {t('mensagens')}</span>
                      </button>
                      <button type="button" onClick={() => deleteConversation(conversation.id)} disabled={loading} title={t('Excluir conversa')} aria-label={`${t('Excluir conversa')}: ${conversation.title}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className={`flex-1 space-y-4 overflow-y-auto p-4 ${fullScreen ? 'bg-[#F1F4F7]' : 'bg-white'}`} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`flex gap-2.5 ${fullScreen ? 'mx-auto w-full max-w-4xl' : ''} ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                      : 'rounded-tl-sm border border-[#E7ECF1] bg-white text-[#263548]'}`}>
                    <div className="space-y-1">
                      {renderMessageText(message.text)}
                      {streamingMessageId === message.id && (
                        <span className="inline-block h-3.5 w-1.5 ml-0.5 rounded-[1px] bg-amber-500 animate-pulse align-middle" aria-hidden="true" />
                      )}
                    </div>
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
          )}

          {!historyOpen && !settingsOpen && <footer className={`shrink-0 border-t p-3 ${fullScreen ? 'border-[#DCE3EB] bg-white px-4 py-4' : 'border-[#E7ECF1] bg-[#F8FAFC]'}`}>
            {speechSupported && (
              <div className="mb-2 text-[10px] text-slate-500" aria-live="polite">{isListening ? t('Ouvindo... Fale agora') : ''}</div>
            )}
            <form onSubmit={(event) => { event.preventDefault(); void handleSendMessage(); }} className={`mx-auto flex w-full items-center gap-2 ${fullScreen ? 'max-w-4xl' : ''}`}>
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
                onFocus={() => {
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }, 180);
                }}
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
          </footer>}
          </div>
        </section>
      )}
    </>
  );
};

