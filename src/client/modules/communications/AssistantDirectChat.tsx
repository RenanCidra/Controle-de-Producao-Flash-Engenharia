import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Coffee,
  History,
  MessageSquarePlus,
  Mic,
  MicOff,
  MoreVertical,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { api, type AuthUser } from '../../api.ts';
import { getAppLanguage, getIntlLocale, translateText } from '../../i18n/index.ts';
import { AudioRecorderButton } from '../../components/AudioRecorderButton.tsx';
import { EmojiPicker } from '../../components/EmojiPicker.tsx';

export type PersonalityMode = 'direct' | 'casual' | 'formal';
export type TypingDisplayMode = 'realtime' | 'instant';

interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: Array<{ type: string; target: string; label: string }>;
  mode?: 'gemini' | 'data_fallback';
  error?: boolean;
  audioUrl?: string;
}

interface AssistantConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: AssistantMessage[];
}

interface AssistantDirectChatProps {
  currentUser: AuthUser | null;
  initialPrompt?: string;
  onInitialPromptHandled?: () => void;
  onNavigate?: (tab: string, options?: { op?: string; subTab?: string }) => void;
  onBackMobile: () => void;
}

const t = (text: string) => translateText(text);
const currentTime = () => new Date().toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' });
const personalityStorageKey = (uid?: string) => `nexus_copilot_personality_${uid || 'guest'}`;
const displayModeStorageKey = (uid?: string) => `nexus_copilot_display_mode_${uid || 'guest'}`;
const conversationStorageKey = (uid?: string) => `nexus_copilot_conversations_${uid || 'guest'}`;
const LEAVE_COMMUNICATIONS_CONFIRM_KEY = (uid?: string) => `nexus_communications_leave_confirm_${uid || 'guest'}`;
const MAX_SAVED_CONVERSATIONS = 25;
const MAX_SAVED_MESSAGES = 80;

function createConversation(name?: string, mode: PersonalityMode = 'casual'): AssistantConversation {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: t('Nova conversa'),
    updatedAt: new Date().toISOString(),
    messages: [makeWelcome(name, mode)],
  };
}

function loadConversations(uid?: string, name?: string, mode: PersonalityMode = 'casual'): AssistantConversation[] {
  if (typeof window === 'undefined') return [createConversation(name, mode)];
  try {
    const stored = localStorage.getItem(conversationStorageKey(uid));
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((item): item is AssistantConversation => Boolean(
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
    // Storage may be unavailable or invalid.
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

function makeWelcome(name?: string, mode: PersonalityMode = 'casual'): AssistantMessage {
  let text = '';
  if (mode === 'direct') {
    text = `${name ? `${t('Olá')}, ${name}.` : `${t('Olá')}.`} ${t('Assistente Flash conectado no modo Direto. Pergunte sobre OPs, ocorrências ou estoques.')}`;
  } else if (mode === 'formal') {
    text = `${name ? `${t('Prezado(a)')} ${name},` : `${t('Prezado(a)')},`} ${t('Prezado(a), sou o Assistente Flash, focado em planejamento e controle da produção industrial. Como posso auxiliá-lo(a) nesta sessão?')}`;
  } else {
    text = `${name ? `${t('Olá')}, ${name}!` : `${t('Olá')}!`} ${t('Sou o Assistente Flash, seu assistente no PCP e chão de fábrica.')}\n\n${t('Posso tirar dúvidas sobre a produção, analisar a operação, checar qualquer OP ou te guiar pelo sistema. Como posso te ajudar hoje?')}`;
  }
  return {
    id: 'welcome',
    sender: 'assistant',
    text,
    timestamp: currentTime(),
  };
}

const quickQuestions = [
  { label: 'Status da produção', prompt: 'Como está o status geral da produção?' },
  { label: 'OPs atrasadas', prompt: 'Quais OPs estão atrasadas?' },
  { label: 'Ocorrências abertas', prompt: 'Quais ocorrências estão abertas?' },
  { label: 'Estoque crítico', prompt: 'Quais itens de estoque estão abaixo do mínimo?' },
];

function getAssistantActivityStages(message: string, isAudio: boolean): string[] {
  if (isAudio) {
    return [t('Ouvindo seu áudio…'), t('Interpretando sua mensagem de voz…'), t('Preparando uma resposta…')];
  }
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const opMatch = normalized.match(/\b(?:op|ordem(?:\s+de)?\s+producao)\s*(?:n[º°.]?\s*)?[:#-]?\s*([a-z0-9][a-z0-9._/-]{2,19})\b/i);
  if (opMatch) {
    const op = opMatch[1].toUpperCase();
    return [
      t('Localizando a OP {op}…').replace('{op}', op),
      t('Conferindo os dados disponíveis da OP {op}…').replace('{op}', op),
      t('Organizando o resumo da OP {op}…').replace('{op}', op),
    ];
  }
  if (/\b(calcul[ae]|quanto|total|som[ae]|diferenca|percentual|porcentagem)\b/.test(normalized)) {
    return [t('Reunindo os dados necessários…'), t('Conferindo os valores informados…'), t('Calculando a resposta…')];
  }
  if (/\b(resumo|turno|produc|ordens?|ops?|atras|ocorr|estoque|insumos?|saldo|apontamentos?|protheus|espelho|sincroniz|linhas?)\b/.test(normalized)) {
    return [t('Flash de Dados: consultando o espelho…'), t('Reunindo os dados da produção…'), t('Organizando as informações disponíveis…')];
  }
  return [t('Pensando na melhor resposta…'), t('Organizando as informações…'), t('Preparando a resposta…')];
}

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
          <span className="select-none text-amber-600 font-bold">{bullet ? '•' : `${trimmed.match(/^\d+/)?.[0]}.`}</span>
          <span>{renderInline((bullet || ordered)![1], index)}</span>
        </p>
      );
    }
    const heading = trimmed.replace(/^#{1,3}\s+/, '');
    return <p key={`line-${index}`} className="leading-5">{renderInline(heading, index)}</p>;
  });
}

export const AssistantDirectChat: React.FC<AssistantDirectChatProps> = ({
  currentUser,
  initialPrompt,
  onInitialPromptHandled,
  onNavigate,
  onBackMobile,
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

  const [conversations, setConversations] = useState<AssistantConversation[]>(() =>
    loadConversations(currentUser?.uid, currentUser?.name, personality),
  );
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id || '');
  const [messages, setMessages] = useState<AssistantMessage[]>(() => conversations[0]?.messages || [makeWelcome(currentUser?.name, personality)]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const streamingAbortRef = useRef<(() => void) | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<'history' | 'settings' | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAssistantActivity, setShowAssistantActivity] = useState(false);
  const [assistantActivity, setAssistantActivity] = useState(t('Assistente Flash digitando…'));
  const [pendingAction, setPendingAction] = useState<{ target: string; label: string } | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!pendingAction) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingAction(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [pendingAction]);

  const activityTimerRef = useRef<number | null>(null);
  const activityVisibilityTimerRef = useRef<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  useEffect(() => {
    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversationId ? { ...c, messages, updatedAt: new Date().toISOString() } : c)),
      );
    }
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && currentUser?.uid) {
      try {
        localStorage.setItem(conversationStorageKey(currentUser.uid), JSON.stringify(conversations.slice(0, MAX_SAVED_CONVERSATIONS)));
      } catch {
        // Storage unavailable
      }
    }
  }, [conversations, currentUser?.uid]);

  useEffect(() => {
    if (!initialPrompt) return;
    setInputValue(initialPrompt.slice(0, 2000));
    requestAnimationFrame(() => inputRef.current?.focus());
    onInitialPromptHandled?.();
  }, [initialPrompt, onInitialPromptHandled]);

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
      if (transcript) setInputValue((prev) => `${prev}${prev ? ' ' : ''}${transcript}`.slice(0, 2000));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    speechRecognitionRef.current = recognition;
    return () => {
      try { recognition.stop(); } catch {}
      speechRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [menuOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, showAssistantActivity]);

  const handlePersonalityChange = (mode: PersonalityMode) => {
    setPersonality(mode);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(personalityStorageKey(currentUser?.uid), mode); } catch {}
    }
  };

  const handleDisplayModeChange = (mode: TypingDisplayMode) => {
    setDisplayMode(mode);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(displayModeStorageKey(currentUser?.uid), mode); } catch {}
    }
  };

  const toggleListening = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      try { recognition.stop(); } catch {}
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

  const handleSendMessage = async (suggestedText?: string, audioBlob?: Blob) => {
    const text = (suggestedText ?? inputValue).trim();
    if ((!text && !audioBlob) || loading) return;

    if (streamingAbortRef.current) {
      streamingAbortRef.current();
      streamingAbortRef.current = null;
    }

    const history = messages
      .filter((item) => item.id !== 'welcome' && !item.error)
      .slice(-10)
      .map((item) => ({ role: item.sender === 'user' ? ('user' as const) : ('model' as const), text: item.text }));

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text || 'Mensagem de áudio',
      timestamp: currentTime(),
      audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    const activityStages = getAssistantActivityStages(text, Boolean(audioBlob));
    let activityIndex = 0;
    setShowAssistantActivity(false);
    if (activityVisibilityTimerRef.current !== null) window.clearTimeout(activityVisibilityTimerRef.current);
    activityVisibilityTimerRef.current = window.setTimeout(() => {
      setShowAssistantActivity(true);
      activityVisibilityTimerRef.current = null;
    }, 120);
    setAssistantActivity(activityStages[0]);
    if (activityTimerRef.current !== null) window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = window.setInterval(() => {
      if (activityIndex >= activityStages.length - 1) {
        if (activityTimerRef.current !== null) window.clearInterval(activityTimerRef.current);
        activityTimerRef.current = null;
        return;
      }
      activityIndex += 1;
      setAssistantActivity(activityStages[activityIndex]);
    }, 2200);

    setLoading(true);

    try {
      const response = audioBlob
        ? await api.sendCopilotAudio(audioBlob, history, getAppLanguage(), personality)
        : await api.sendCopilotMessage(text, history, getAppLanguage(), personality);

      const assistantMessageId = `assistant-${Date.now()}`;
      const fullText = response.reply;

      if (displayMode === 'realtime') {
        if (fullText.length <= 160 || response.mode === 'data_fallback') {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              sender: 'assistant',
              text: fullText,
              timestamp: currentTime(),
              mode: response.mode,
              actions: response.actions,
            },
          ]);
          setLoading(false);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              sender: 'assistant',
              text: '',
              timestamp: currentTime(),
              mode: response.mode,
              actions: response.actions,
            },
          ]);
          setLoading(false);
          setStreamingMessageId(assistantMessageId);

          await new Promise<void>((resolve) => {
            let currentIndex = 0;
            const totalLength = fullText.length;
            const stepSize = Math.max(18, Math.ceil(totalLength / 14));
            const interval = setInterval(() => {
              currentIndex = Math.min(totalLength, currentIndex + stepSize);
              const currentSlice = fullText.slice(0, currentIndex);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, text: currentSlice } : m)),
              );
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

              if (currentIndex >= totalLength) {
                clearInterval(interval);
                streamingAbortRef.current = null;
                setStreamingMessageId(null);
                resolve();
              }
            }, 10);

            streamingAbortRef.current = () => {
              clearInterval(interval);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, text: fullText } : m)),
              );
              setStreamingMessageId(null);
              resolve();
            };
          });
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            sender: 'assistant',
            text: fullText,
            timestamp: currentTime(),
            mode: response.mode,
            actions: response.actions,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          sender: 'assistant',
          text: err?.message || t('Não foi possível consultar o assistente agora. Verifique a conexão e tente novamente.'),
          timestamp: currentTime(),
          error: true,
        },
      ]);
    } finally {
      if (activityVisibilityTimerRef.current !== null) window.clearTimeout(activityVisibilityTimerRef.current);
      activityVisibilityTimerRef.current = null;
      setShowAssistantActivity(false);
      if (activityTimerRef.current !== null) window.clearInterval(activityTimerRef.current);
      activityTimerRef.current = null;
      setLoading(false);
      setStreamingMessageId(null);
    }
  };

  const executeNavigation = (target: string) => {
    if (!onNavigate) return;
    const [tab, queryString] = target.split('?');
    const validTabs = new Set(['dashboard', 'traceability', 'occurrences', 'inventory', 'production-lines', 'production-orders', 'settings', 'home']);
    if (!validTabs.has(tab)) return;
    const params = new URLSearchParams(queryString || '');
    onNavigate(tab, { op: params.get('op') || undefined, subTab: params.get('sub') || undefined });
  };

  const handleActionClick = (target: string, label: string) => {
    if (!onNavigate) return;
    const dismissed = typeof window !== 'undefined' && localStorage.getItem(LEAVE_COMMUNICATIONS_CONFIRM_KEY(currentUser?.uid)) === 'true';
    if (dismissed) {
      executeNavigation(target);
      return;
    }
    setDontShowAgain(false);
    setPendingAction({ target, label });
  };

  const handleConfirmNavigation = () => {
    if (!pendingAction) return;
    if (dontShowAgain && typeof window !== 'undefined') {
      try {
        localStorage.setItem(LEAVE_COMMUNICATIONS_CONFIRM_KEY(currentUser?.uid), 'true');
      } catch {
        // Storage unavailable
      }
    }
    const target = pendingAction.target;
    setPendingAction(null);
    executeNavigation(target);
  };

  const startNewConversation = () => {
    const conv = createConversation(currentUser?.name, personality);
    setConversations((prev) => [conv, ...prev].slice(0, MAX_SAVED_CONVERSATIONS));
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setActiveSidePanel(null);
    setMenuOpen(false);
    setInputValue('');
  };

  const openConversation = (conv: AssistantConversation) => {
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setActiveSidePanel(null);
    setMenuOpen(false);
  };

  const deleteConversation = (id: string) => {
    if (conversations.length <= 1) {
      startNewConversation();
      return;
    }
    const filtered = conversations.filter((c) => c.id !== id);
    setConversations(filtered);
    if (activeConversationId === id) {
      const next = filtered[0];
      setActiveConversationId(next.id);
      setMessages(next.messages);
    }
  };

  const clearCurrentMessages = () => {
    const welcome = makeWelcome(currentUser?.name, personality);
    setMessages([welcome]);
    setMenuOpen(false);
  };

  return (
    <div data-theme-assistant-chat className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F1F4F7]">
      {/* Header do Contato: Assistente Flash */}
      <header className="relative z-20 flex min-h-[68px] shrink-0 items-center justify-between border-b border-[#DCE3EB] bg-white px-3.5 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBackMobile}
            title={translateText('Voltar às conversas')}
            aria-label={translateText('Voltar às conversas')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:hidden"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 ring-2 ring-amber-400/90 shadow-sm">
            <img src="/assets/flash-symbol.png" alt="" className="h-6 w-6 object-contain" />
            <span
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white"
              title={translateText('Online')}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-[#263548]">Assistente Flash</h2>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                IA
              </span>
            </div>
            <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>{translateText('PCP e Chão de Fábrica')}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">

          {/* Menu dos 3 Pontos */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={translateText('Opções do contato')}
              title={translateText('Opções do contato')}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                menuOpen ? 'border-amber-400 bg-amber-50 text-slate-800' : 'border-[#DCE3EB] bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-xl border border-[#DCE3EB] bg-white py-1.5 text-[#263548] shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setActiveSidePanel('history');
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <History size={16} className="text-amber-600" />
                  <span>{t('Histórico de conversas')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setActiveSidePanel('settings');
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Settings2 size={16} className="text-slate-500" />
                  <span>{t('Configurações do chat')}</span>
                </button>

                <div className="my-1 border-t border-[#F1F4F7]" />

                <button
                  type="button"
                  onClick={startNewConversation}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <MessageSquarePlus size={16} className="text-slate-500" />
                  <span>{t('Nova conversa')}</span>
                </button>

                <button
                  type="button"
                  onClick={clearCurrentMessages}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw size={16} className="text-rose-500" />
                  <span>{t('Limpar mensagens')}</span>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </header>

      {/* Área principal: Mensagens e Painel Lateral */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Lista de Mensagens */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            <div className="mx-auto max-w-4xl space-y-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.sender === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 ring-1 ring-amber-400/80 shadow-sm">
                      <img src="/assets/flash-symbol.png" alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                    </div>
                  )}

                  <div className={`min-w-0 max-w-[85%] space-y-1.5 ${message.sender === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-[13px] shadow-sm leading-relaxed ${
                        message.sender === 'user'
                          ? 'rounded-tr-xs bg-amber-400 text-slate-950 font-medium'
                          : message.error
                            ? 'rounded-tl-xs border border-rose-200 bg-rose-50 text-rose-900'
                            : 'rounded-tl-xs border border-[#E7ECF1] bg-white text-[#263548]'
                      }`}
                    >
                      <div className="space-y-1.5">
                        {renderMessageText(message.text)}
                        {message.audioUrl && (
                          <audio controls preload="metadata" src={message.audioUrl} className="mt-2 max-w-full" />
                        )}
                        {streamingMessageId === message.id && (
                          <span
                            className="inline-block h-3.5 w-1.5 ml-0.5 rounded-[1px] bg-amber-500 animate-pulse align-middle"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>

                    {message.mode === 'gemini' && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                        ⚡ {t('Assistente Flash')}
                      </span>
                    )}

                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {message.actions.map((action, idx) => (
                          <button
                            key={`${message.id}-${idx}`}
                            type="button"
                            onClick={() => handleActionClick(action.target, action.label)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-950"
                          >
                            <span>{action.label}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
                          </button>
                        ))}
                      </div>
                    )}

                    <time
                      className={`block text-[10px] text-slate-400 ${
                        message.sender === 'user' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {message.timestamp}
                    </time>
                  </div>
                </article>
              ))}

              {/* Sugestões de Início de Conversa */}
              {messages.length === 1 && !loading && (
                <div className="space-y-2 pt-2 pl-11">
                  <p className="text-xs font-semibold text-slate-500">{t('Sugestões operacionais')}</p>
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => void handleSendMessage(t(q.prompt))}
                        className="rounded-full border border-[#DCE3EB] bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-900"
                      >
                        {t(q.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Indicador de Digitação / Atividade */}
              {loading && showAssistantActivity && (
                <div className="flex items-center gap-2.5 pl-11 text-xs text-slate-500" role="status" aria-live="polite">
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.24s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.12s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-amber-500" />
                  </span>
                  <span className="text-xs font-medium text-slate-600">{assistantActivity}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Compositor de Mensagens do Assistente - Padronizado com MessageComposer da Central */}
          <form
            data-chat-composer
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="relative z-10 flex shrink-0 flex-col gap-2 border-t border-[#DCE3EB] bg-[#F1F4F7] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4"
          >
            {speechSupported && isListening && (
              <div className="text-center text-xs font-medium text-amber-700 animate-pulse">
                {t('Ouvindo... Fale agora sua pergunta operacional')}
              </div>
            )}

            <div
              data-chat-composer-pill
              className="flex min-h-12 w-full items-center gap-1.5 rounded-full border border-[#D0D5DC] bg-white px-2 shadow-sm transition-colors focus-within:border-[#B8891F] focus-within:ring-2 focus-within:ring-amber-400/20"
            >
              <EmojiPicker
                buttonClassName="!border-transparent !bg-transparent hover:!border-transparent hover:!bg-[#F1F4F7]"
                onSelect={(emoji) => setInputValue((val) => `${val}${emoji}`.slice(0, 4000))}
              />
              <textarea
                ref={inputRef}
                aria-label={t('Digite uma mensagem')}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                maxLength={4000}
                rows={1}
                disabled={loading}
                placeholder={t('Digite uma mensagem')}
                className="max-h-28 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2.5 text-sm leading-5 text-[#263548] outline-none placeholder:text-slate-500 focus:ring-0 disabled:opacity-50"
              />
              {speechSupported && !inputValue.trim() && (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={loading}
                  title={t(isListening ? 'Parar ditado' : 'Ditar pergunta')}
                  aria-label={t(isListening ? 'Parar ditado' : 'Ditar pergunta')}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isListening
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : 'text-slate-500 hover:bg-[#F1F4F7]'
                  }`}
                >
                  {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
              )}
              {inputValue.trim() ? (
                <button
                  type="submit"
                  disabled={loading}
                  title={loading ? t('Enviando mensagem…') : t('Enviar mensagem')}
                  aria-label={loading ? t('Enviando mensagem') : t('Enviar mensagem')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
                >
                  <Send size={17} />
                </button>
              ) : (
                <AudioRecorderButton
                  onRecorded={async (audio) => {
                    await handleSendMessage(undefined, audio);
                  }}
                  disabled={loading}
                  label={t('Gravar áudio')}
                  buttonClassName="!border-transparent !bg-transparent hover:!border-transparent hover:!bg-[#F1F4F7]"
                />
              )}
            </div>
          </form>
        </div>

        {/* Painel Lateral: Histórico ou Configurações */}
        <AnimatePresence>
          {activeSidePanel && (
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute inset-y-0 right-0 z-40 flex w-[min(380px,94vw)] flex-col border-l border-[#DCE3EB] bg-white shadow-2xl"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#E7ECF1] px-4">
                <div className="flex items-center gap-2">
                  {activeSidePanel === 'history' ? (
                    <>
                      <History size={18} className="text-amber-600" />
                      <h3 className="text-sm font-bold text-[#263548]">{t('Histórico de conversas')}</h3>
                    </>
                  ) : (
                    <>
                      <Settings2 size={18} className="text-amber-600" />
                      <h3 className="text-sm font-bold text-[#263548]">{t('Configurações do chat')}</h3>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSidePanel(null)}
                  title={translateText('Fechar painel')}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {activeSidePanel === 'history' ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={startNewConversation}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300 shadow-xs"
                    >
                      <MessageSquarePlus size={16} />
                      <span>{t('Nova conversa')}</span>
                    </button>

                    <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {t('Conversas anteriores')} ({conversations.length})
                    </p>

                    <div className="space-y-2">
                      {conversations.map((conv) => {
                        const isCurrent = conv.id === activeConversationId;
                        return (
                          <div
                            key={conv.id}
                            className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                              isCurrent ? 'border-amber-300 bg-amber-50/70' : 'border-[#E7ECF1] bg-white hover:bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openConversation(conv)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block truncate text-xs font-semibold text-slate-800">{conv.title}</span>
                              <span className="mt-0.5 block text-[10px] text-slate-500">
                                {new Date(conv.updatedAt).toLocaleString(getIntlLocale(), {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}{' '}
                                · {conv.messages.length} {t('mensagens')}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteConversation(conv.id)}
                              title={t('Excluir conversa')}
                              aria-label={`${t('Excluir conversa')}: ${conv.title}`}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{t('Modo de personalidade')}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        {t(personalityOptions.find((opt) => opt.value === personality)?.description || '')}
                      </p>
                      <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                        {personalityOptions.map(({ value, label, Icon }) => {
                          const isSel = personality === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => handlePersonalityChange(value)}
                              className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2 px-1 text-xs font-semibold transition ${
                                isSel ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              <Icon className={`h-4 w-4 ${isSel ? 'text-amber-600' : ''}`} />
                              <span>{t(label)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-[#F1F4F7] pt-3">
                      <p className="text-xs font-bold text-slate-800">{t('Exibição das respostas')}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                        {displayMode === 'realtime'
                          ? t('Digitação dinâmica e progressiva.')
                          : t('Exibir resposta completa de uma vez.')}
                      </p>
                      <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => handleDisplayModeChange('realtime')}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                            displayMode === 'realtime'
                              ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                          <span>{t('Em tempo real')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisplayModeChange('instant')}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                            displayMode === 'instant'
                              ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5 text-amber-600" />
                          <span>{t('Completa')}</span>
                        </button>
                      </div>
                    </div>

                    <p className="rounded-xl border border-[#E7ECF1] bg-[#F8FAFC] p-3 text-[11px] leading-relaxed text-slate-500">
                      {t('As configurações e histórico do Assistente Flash são salvos no seu usuário neste navegador.')}
                    </p>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Modal de Confirmação: Sair da Central */}
        <AnimatePresence>
          {pendingAction && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setPendingAction(null);
              }}
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="leave-central-title"
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.16 }}
                className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4"
              >
                <div>
                  <h3 id="leave-central-title" className="font-semibold text-[#263548]">
                    {t('Deseja sair da central?')}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {t('Você será direcionado para o módulo do sistema')}{' '}
                    {pendingAction.label ? <strong className="text-slate-800">({pendingAction.label})</strong> : ''}. {t('Deseja continuar?')}
                  </p>
                </div>

                <div className="pt-1 border-t border-[#F1F4F7]">
                  <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="h-4 w-4 rounded border-[#DCE3EB] text-amber-500 focus:ring-amber-400"
                    />
                    <span>{t('Não mostrar novamente')}</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="rounded-lg border border-[#DCE3EB] px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-[#F1F4F7]"
                  >
                    {t('Cancelar')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmNavigation}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFAA00] px-3.5 py-2 text-xs font-bold text-[#151C25] shadow-xs transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <span>{t('Confirmar')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.section>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
