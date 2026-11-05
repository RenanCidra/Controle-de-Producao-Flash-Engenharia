import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Copy, Forward, Info, MessageCircle, MessageSquarePlus, MoreVertical, Plus, Reply, Search, Send, Trash2, UserRound, Users, X } from 'lucide-react';
import { api, type AuthUser, type FeedbackCategory } from '../../api.ts';
import { UserAccountMenu } from '../../components/UserAccountMenu.tsx';
import { AudioRecorderButton } from '../../components/AudioRecorderButton.tsx';
import { EmojiPicker } from '../../components/EmojiPicker.tsx';
import { translateText } from '../../i18n/index.ts';
import { DataUnavailableState, LoadingState } from '../../components/DataStatus.tsx';

type Group = { id: number; name: string; sector: string; createdAt: string; unreadCount: number; lastMessage: Pick<Message, 'id' | 'body' | 'authorUid' | 'authorName' | 'createdAt' | 'deletedAt'> | null };
type MessageReaction = { emoji: string; count: number; reactedByMe: boolean };
type Message = { id: number; body: string; authorUid: string; authorName: string; createdAt: string; replyToMessageId?: number | null; hasAudio?: boolean; audioDurationMs?: number | null; audioPreviewUrl?: string; deletedAt?: string | null; reactions?: MessageReaction[]; readByCount?: number; recipientCount?: number };
type DirectoryUser = { id: number; name: string; department: string | null; role?: string; avatarUrl?: string | null };
type DirectConversation = {
  conversationId: number;
  userId: number;
  name: string;
  department: string | null;
  role?: string;
  avatarUrl?: string | null;
  createdAt: string;
  lastMessage: Pick<Message, 'id' | 'body' | 'authorUid' | 'authorName' | 'createdAt' | 'deletedAt'> | null;
  unreadCount: number;
};

const formatMessageTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const mergeMessages = (current: Message[], incoming: Message[]) => {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
};
const waitForPreview = (ms = 450) => new Promise(resolve => window.setTimeout(resolve, ms));
const previewDirectory: DirectoryUser[] = [
  { id: 2, name: 'Marcos Oliveira', department: 'Sinalização', role: 'MONITOR' },
  { id: 3, name: 'Juliana Santos', department: 'Luz auxiliar', role: 'SUPERVISOR' },
  { id: 4, name: 'Rafael Costa', department: 'Teste e inspeção', role: 'OPERATOR' },
];
const previewConversationMessages = (conversationKey: string, currentUser: AuthUser | null): Message[] => {
  const now = Date.now();
  const own = { authorUid: currentUser?.uid || 'dev-preview-admin', authorName: currentUser?.name || 'Administrador local' };
  const other = { authorUid: 'preview-marcos', authorName: 'Marcos Oliveira' };
  const messages = conversationKey === 'group:1'
    ? [
      { id: 101, body: 'Bom dia, equipe. A OP-260184 está priorizada para hoje.', ...other, createdAt: new Date(now - 25 * 60000).toISOString() },
      { id: 102, body: 'Recebido. Estamos finalizando a montagem do conjunto sinalizador.', ...own, createdAt: new Date(now - 18 * 60000).toISOString() },
      { id: 103, body: 'Assim que concluir, aviso por aqui para atualizar o próximo setor.', ...other, createdAt: new Date(now - 6 * 60000).toISOString() },
    ]
    : [
      { id: 201, body: 'Oi! Você consegue confirmar o andamento da OP-260185?', ...other, createdAt: new Date(now - 14 * 60000).toISOString() },
      { id: 202, body: 'Sim. A luminária auxiliar está em montagem e segue no prazo.', ...own, createdAt: new Date(now - 9 * 60000).toISOString() },
    ];
  return messages;
};

export const CommunicationsView: React.FC<{ currentUser: AuthUser | null; localPreview: boolean; onBack: () => void; onInitialLoadComplete: () => void; onOpenProfile: () => void; onOpenSettings: () => void; onOpenFeedback: (initialTab?: 'submit' | 'inbox', initialCategory?: FeedbackCategory) => void; onOpenHelpInfo: (mode: 'help' | 'release' | 'shortcuts') => void; onOpenShortcuts: () => void; onLogout: () => void }> = ({ currentUser, localPreview, onBack, onInitialLoadComplete, onOpenProfile, onOpenSettings, onOpenFeedback, onOpenHelpInfo, onOpenShortcuts, onLogout }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [directs, setDirects] = useState<DirectConversation[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedDirectId, setSelectedDirectId] = useState<number | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<DirectoryUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const messagesRequestsInFlightRef = useRef(new Set<string>());
  const listsRequestInFlightRef = useRef(false);
  const pendingReactionsRef = useRef(new Set<string>());
  const previewAudioUrlsRef = useRef<string[]>([]);
  const [body, setBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState('');
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [newGroup, setNewGroup] = useState(false);
  const [newConversation, setNewConversation] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [messageDetails, setMessageDetails] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<DirectoryUser[]>([]);
  const [profileUser, setProfileUser] = useState<DirectoryUser | null>(null);
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [section, setSection] = useState<'conversations' | 'groups'>('conversations');
  const lastSeenMessageRef = useRef<{ conversationKey: string; messageId: number } | null>(null);
  const loadedConversationRef = useRef<string | null>(null);
  const messageChangesCursorRef = useRef<Date | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const pendingLatestScrollRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const canCreateGroups = ['ADMIN', 'SUPERVISOR'].includes(api.getUser()?.role || '');
  const selectedConversation = selectedGroupId !== null || selectedDirectId !== null || draftRecipient !== null;
  activeConversationRef.current = selectedGroupId !== null ? `group:${selectedGroupId}` : selectedDirectId !== null ? `direct:${selectedDirectId}` : null;

  const loadGroups = useCallback(async () => {
    if (localPreview) {
      await waitForPreview();
      setGroups([{ id: 1, name: 'Comunicação da Produção', sector: 'Sinalização', createdAt: new Date().toISOString(), unreadCount: 2, lastMessage: { id: 103, body: 'Assim que concluir, aviso por aqui para atualizar o próximo setor.', authorUid: 'preview-marcos', authorName: 'Marcos Oliveira', createdAt: new Date(Date.now() - 6 * 60000).toISOString() } }]);
      return true;
    }
    try {
      const data = await api.getCommunicationGroups();
      setGroups(Array.isArray(data) ? data : []);
      return true;
    } catch (e: any) {
      return false;
    }
  }, [localPreview]);
  const loadDirects = useCallback(async () => {
    if (localPreview) {
      await waitForPreview();
      setDirects([{ conversationId: 11, userId: 2, name: 'Marcos Oliveira', department: 'Sinalização', role: 'MONITOR', createdAt: new Date().toISOString(), lastMessage: { id: 202, body: 'Sim. A luminária auxiliar está em montagem e segue no prazo.', authorUid: currentUser?.uid || 'dev-preview-admin', authorName: currentUser?.name || 'Administrador local', createdAt: new Date(Date.now() - 9 * 60000).toISOString() }, unreadCount: 0 }]);
      return true;
    }
    try {
      const data = await api.getCommunicationDirectConversations();
      setDirects(Array.isArray(data) ? data : []);
      return true;
    } catch (e: any) {
      return false;
    }
  }, [currentUser, localPreview]);
  const refreshLists = useCallback(async () => {
    if (listsRequestInFlightRef.current) return null;
    listsRequestInFlightRef.current = true;
    try {
      const results = await Promise.all([loadGroups(), loadDirects()]);
      setListsError(results.some(result => !result));
      return results;
    } finally {
      listsRequestInFlightRef.current = false;
    }
  }, [loadGroups, loadDirects]);
  const loadDirectory = async () => {
    if (localPreview) { await waitForPreview(250); setDirectory(previewDirectory); return; }
    try {
      const data = await api.getCommunicationDirectory();
      setDirectory(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setDirectory([]);
      setError(e.message);
    }
  };
  const loadMessages = useCallback(async () => {
    const conversationKey = selectedGroupId !== null ? `group:${selectedGroupId}` : selectedDirectId !== null ? `direct:${selectedDirectId}` : null;
    if (!conversationKey) { setMessages([]); loadedConversationRef.current = null; return; }
    if (messagesRequestsInFlightRef.current.has(conversationKey)) return;
    messagesRequestsInFlightRef.current.add(conversationKey);
    const initial = loadedConversationRef.current !== conversationKey;
    try {
      if (initial) { setMessagesLoading(true); setMessagesError(false); }
      if (localPreview) {
        await waitForPreview();
        if (activeConversationRef.current !== conversationKey) return;
        if (!initial) return;
        const previewMessages = previewConversationMessages(conversationKey, currentUser);
        setMessages(previewMessages);
        loadedConversationRef.current = conversationKey;
        messageChangesCursorRef.current = new Date();
        setHasOlderMessages(false);
        setMessagesError(false);
        return;
      }
      const latestLoadedId = messagesRef.current.at(-1)?.id;
      const pollStartedAt = new Date();
      const changedAfter = initial ? undefined : messageChangesCursorRef.current?.toISOString();
      if (selectedGroupId !== null) {
        const data = await api.getCommunicationMessages(selectedGroupId, initial ? { limit: 30 } : { ...(latestLoadedId ? { afterId: latestLoadedId } : {}), ...(changedAfter ? { changedAfter } : {}), limit: 30 });
        if (activeConversationRef.current !== conversationKey) return;
        const loaded = Array.isArray(data) ? data : [];
        if (initial) { setMessages(loaded); loadedConversationRef.current = conversationKey; setHasOlderMessages(loaded.length === 30); }
        else if (loaded.length) setMessages(previous => mergeMessages(previous, loaded));
        setMessagesError(false);
        messageChangesCursorRef.current = pollStartedAt;
        const latest = loaded.at(-1);
        const key = `group:${selectedGroupId}`;
        if (latest && lastSeenMessageRef.current?.conversationKey === key && latest.id !== lastSeenMessageRef.current.messageId && latest.authorUid !== api.getUser()?.uid && document.visibilityState === 'visible') {
          void api.markCommunicationGroupRead(selectedGroupId).then(loadGroups).catch(() => undefined);
        }
        if (latest) lastSeenMessageRef.current = { conversationKey: key, messageId: latest.id };
      } else if (selectedDirectId !== null) {
        const data = await api.getCommunicationDirectMessages(selectedDirectId, initial ? { limit: 30 } : { ...(latestLoadedId ? { afterId: latestLoadedId } : {}), ...(changedAfter ? { changedAfter } : {}), limit: 30 });
        if (activeConversationRef.current !== conversationKey) return;
        const loaded = Array.isArray(data) ? data : [];
        if (initial) { setMessages(loaded); loadedConversationRef.current = conversationKey; setHasOlderMessages(loaded.length === 30); }
        else if (loaded.length) setMessages(previous => mergeMessages(previous, loaded));
        setMessagesError(false);
        messageChangesCursorRef.current = pollStartedAt;
        const latest = loaded.at(-1);
        const key = `direct:${selectedDirectId}`;
        if (latest && lastSeenMessageRef.current?.conversationKey === key && latest.id !== lastSeenMessageRef.current.messageId && latest.authorUid !== api.getUser()?.uid && document.visibilityState === 'visible') {
          void api.markCommunicationDirectRead(selectedDirectId).then(loadDirects).catch(() => undefined);
        }
        if (latest) lastSeenMessageRef.current = { conversationKey: key, messageId: latest.id };
      } else {
        setMessages([]);
      }
    } catch (e: any) {
      if (activeConversationRef.current !== conversationKey) return;
      if (initial) setMessages([]);
      setMessagesError(true);
    } finally {
      messagesRequestsInFlightRef.current.delete(conversationKey);
      if (activeConversationRef.current === conversationKey) setMessagesLoading(false);
    }
  }, [selectedGroupId, selectedDirectId, loadGroups, loadDirects, currentUser, localPreview]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useLayoutEffect(() => {
    const conversationKey = activeConversationRef.current;
    const scroller = messageListRef.current;
    if (!conversationKey || pendingLatestScrollRef.current !== conversationKey || messagesLoading || !scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    pendingLatestScrollRef.current = null;
  }, [messages, messagesLoading, selectedGroupId, selectedDirectId]);
  useEffect(() => () => previewAudioUrlsRef.current.forEach(URL.revokeObjectURL), []);

  const loadOlderMessages = async () => {
    if (!hasOlderMessages || loadingOlderRef.current || !messagesRef.current.length) return;
    const firstId = messagesRef.current[0].id;
    const conversationKey = selectedGroupId !== null ? `group:${selectedGroupId}` : selectedDirectId !== null ? `direct:${selectedDirectId}` : null;
    if (!conversationKey) return;
    loadingOlderRef.current = true; setLoadingOlder(true);
    try {
      const scroller = messageListRef.current;
      const oldHeight = scroller?.scrollHeight || 0;
      const page = selectedGroupId !== null
        ? await api.getCommunicationMessages(selectedGroupId, { beforeId: firstId, limit: 30 })
        : await api.getCommunicationDirectMessages(selectedDirectId!, { beforeId: firstId, limit: 30 });
      if (activeConversationRef.current !== conversationKey) return;
      setMessages(previous => [...page.filter(item => !previous.some(existing => existing.id === item.id)), ...previous]);
      setHasOlderMessages(page.length === 30);
      requestAnimationFrame(() => { if (scroller) scroller.scrollTop += scroller.scrollHeight - oldHeight; });
    } catch (e: any) { setError(e.message); }
    finally { loadingOlderRef.current = false; setLoadingOlder(false); }
  };

  useEffect(() => {
    setListsLoading(true);
    setListsError(false);
    void refreshLists().finally(() => {
      setListsLoading(false);
      onInitialLoadComplete();
    });
    const timer = localPreview ? null : window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshLists();
    }, 10000);
    const refreshWhenAvailable = () => {
      if (document.visibilityState === 'visible') void refreshLists();
    };
    document.addEventListener('visibilitychange', refreshWhenAvailable);
    window.addEventListener('online', refreshWhenAvailable);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenAvailable);
      window.removeEventListener('online', refreshWhenAvailable);
    };
  }, [refreshLists, onInitialLoadComplete, localPreview]);
  useEffect(() => {
    if (localPreview) return;
    const refreshContactAvatars = () => {
      void loadDirects();
      void api.getCommunicationDirectory().then(data => setDirectory(Array.isArray(data) ? data : [])).catch(() => undefined);
    };
    window.addEventListener('flash-contact-avatar-change', refreshContactAvatars);
    return () => window.removeEventListener('flash-contact-avatar-change', refreshContactAvatars);
  }, [loadDirects, localPreview]);
  useEffect(() => {
    void loadMessages();
    if (localPreview) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMessages();
    }, 10000);
    const refreshWhenAvailable = () => {
      if (document.visibilityState === 'visible') void loadMessages();
    };
    document.addEventListener('visibilitychange', refreshWhenAvailable);
    window.addEventListener('online', refreshWhenAvailable);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenAvailable);
      window.removeEventListener('online', refreshWhenAvailable);
    };
  }, [loadMessages, localPreview]);

  const visibleGroups = useMemo(
    () => (Array.isArray(groups) ? groups : []).filter(group => group && `${group.name || ''} ${group.sector || ''} ${group.lastMessage?.body || ''}`.toLowerCase().includes((search || '').toLowerCase())),
    [groups, search],
  );
  const visibleDirects = useMemo(
    () => (Array.isArray(directs) ? directs : []).filter(conversation => conversation && `${conversation.name || ''} ${conversation.department || ''} ${conversation.lastMessage?.body || ''}`.toLowerCase().includes((search || '').toLowerCase())),
    [directs, search],
  );
  const visibleUsers = useMemo(
    () => (Array.isArray(directory) ? directory : []).filter(user => user && `${user.name || ''} ${user.department || ''}`.toLowerCase().includes((userSearch || '').toLowerCase())),
    [directory, userSearch],
  );
  const retryLists = async () => {
    setListsError(false);
    if (!groups.length && !directs.length) setListsLoading(true);
    try { await refreshLists(); }
    finally { setListsLoading(false); }
  };
  const openConversationInfo = async () => {
    setError('');
    setProfileUser(null);
    if (selectedGroupId !== null) {
      if (localPreview) { setGroupMembers(previewDirectory); setConversationInfoOpen(true); return; }
      try { setGroupMembers(await api.getCommunicationGroupMembers(selectedGroupId)); }
      catch (e: any) { setError(e.message); return; }
    } else if (selectedDirectId !== null) {
      const conversation = directs.find(item => (item.conversationId || (item as any).id) === selectedDirectId);
      if (conversation) setProfileUser({ id: conversation.userId, name: conversation.name, department: conversation.department, role: conversation.role, avatarUrl: conversation.avatarUrl });
    } else if (draftRecipient) {
      setProfileUser(draftRecipient);
    }
    setConversationInfoOpen(true);
  };
  const sendForward = async () => {
    if (!forwardingMessage || !forwardTarget) return;
    setError('');
    const forwardedBody = `Encaminhada de ${forwardingMessage.authorName}:\n${forwardingMessage.body}`.slice(0, 4000);
    try {
      const [kind, rawId] = forwardTarget.split(':');
      const targetId = Number(rawId);
      if (localPreview) {
        const forwarded: Message = { id: Date.now(), body: forwardedBody, authorUid: currentUser?.uid || 'dev-preview-admin', authorName: currentUser?.name || 'Administrador local', createdAt: new Date().toISOString() };
        if (kind === 'group') setGroups(previous => previous.map(group => group.id === targetId ? { ...group, lastMessage: forwarded } : group));
        else if (kind === 'direct') setDirects(previous => previous.map(conversation => conversation.conversationId === targetId ? { ...conversation, lastMessage: forwarded } : conversation));
        if (kind === 'group' && selectedGroupId === targetId || kind === 'direct' && selectedDirectId === targetId) setMessages(previous => [...previous, forwarded]);
        setForwardingMessage(null);
        setForwardTarget('');
        return;
      }
      if (kind === 'group') await api.sendCommunicationMessage(targetId, forwardedBody);
      else if (kind === 'direct') await api.sendCommunicationDirectMessage(targetId, forwardedBody);
      setForwardingMessage(null);
      setForwardTarget('');
      await Promise.all([loadGroups(), loadDirects()]);
    } catch (e: any) { setError(e.message); }
  };

  const deleteMessage = async () => {
    if (!messageToDelete || deletingMessage) return;
    const target = messageToDelete;
    setDeletingMessage(true);
    setError('');
    try {
      if (!localPreview) {
        if (selectedGroupId !== null) await api.deleteCommunicationMessage(selectedGroupId, target.id);
        else if (selectedDirectId !== null) await api.deleteCommunicationDirectMessage(selectedDirectId, target.id);
        else return;
      }
      const deletedAt = new Date().toISOString();
      const markDeleted = (message: Message): Message => message.id === target.id
        ? { ...message, body: 'Mensagem apagada', hasAudio: false, audioDurationMs: null, audioPreviewUrl: undefined, deletedAt }
        : message;
      setMessages(previous => previous.map(markDeleted));
      setGroups(previous => previous.map(group => group.lastMessage?.id === target.id ? { ...group, lastMessage: markDeleted(group.lastMessage) } : group));
      setDirects(previous => previous.map(conversation => conversation.lastMessage?.id === target.id ? { ...conversation, lastMessage: markDeleted(conversation.lastMessage) } : conversation));
      setReplyingTo(previous => previous?.id === target.id ? null : previous);
      setMessageDetails(previous => previous?.id === target.id ? null : previous);
      setMessageToDelete(null);
      if (!localPreview) await Promise.all([loadGroups(), loadDirects()]);
    } catch (e: any) {
      setError(e.message || 'Não foi possível apagar a mensagem.');
    } finally {
      setDeletingMessage(false);
    }
  };

  const clearSelection = () => {
    pendingLatestScrollRef.current = null;
    setSelectedGroupId(null);
    setSelectedDirectId(null);
    setDraftRecipient(null);
    setMessages([]);
    setBody('');
    setReplyingTo(null);
  };
  const openCreateGroup = async () => {
    setError('');
    setName('');
    setSector('');
    setMemberIds([]);
    setUserSearch('');
    setNewGroup(true);
    await loadDirectory();
  };
  const openNewConversation = async () => {
    setError('');
    setUserSearch('');
    setNewConversation(true);
    await loadDirectory();
  };
  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (localPreview) {
        const created: Group = { id: Date.now(), name, sector, createdAt: new Date().toISOString(), unreadCount: 0, lastMessage: null };
        setGroups(previous => [created, ...previous]);
        setNewGroup(false);
        setSection('groups');
        clearSelection();
        setSelectedGroupId(created.id);
        return;
      }
      const group = await api.createCommunicationGroup(name, sector, memberIds);
      setNewGroup(false);
      setSection('groups');
      clearSelection();
      setSelectedGroupId(group.id);
      await loadGroups();
    } catch (e: any) { setError(e.message); }
  };
  const sendAudioMessage = async (audio: Blob, duration: number) => {
    if (localPreview) {
      const audioPreviewUrl = URL.createObjectURL(audio);
      previewAudioUrlsRef.current.push(audioPreviewUrl);
      const message: Message = { id: Date.now(), body: 'Áudio', authorUid: currentUser?.uid || 'dev-preview-admin', authorName: currentUser?.name || 'Administrador local', createdAt: new Date().toISOString(), hasAudio: true, audioDurationMs: duration, audioPreviewUrl };
      setMessages(previous => [...previous, message]);
      if (selectedGroupId !== null) setGroups(previous => previous.map(group => group.id === selectedGroupId ? { ...group, lastMessage: message } : group));
      if (selectedDirectId !== null) setDirects(previous => previous.map(conversation => conversation.conversationId === selectedDirectId ? { ...conversation, lastMessage: message } : conversation));
      return;
    }
    if (selectedGroupId !== null) { const created = await api.sendCommunicationGroupAudio(selectedGroupId, audio, duration); setMessages(previous => [...previous, created]); await loadGroups(); }
    else if (selectedDirectId !== null) { const created = await api.sendCommunicationDirectAudio(selectedDirectId, audio, duration); setMessages(previous => [...previous, created]); await loadDirects(); }
  };
  const startConversation = (user: DirectoryUser) => {
    const existing = directs.find(conversation => conversation.userId === user.id);
    const existingId = existing ? (existing.conversationId || (existing as any).id) : null;
    pendingLatestScrollRef.current = existingId ? `direct:${existingId}` : null;
    setSection('conversations');
    setSelectedGroupId(null);
    setSelectedDirectId(existingId);
    if (existingId && !localPreview) void api.markCommunicationDirectRead(existingId).then(loadDirects).catch(() => undefined);
    setDraftRecipient(existing ? null : user);
    setMessages([]);
    setBody('');
    setReplyingTo(null);
    setNewConversation(false);
  };
  const send = async () => {
    if (sendingMessage) return;
    const messageBody = body.trim();
    if (!messageBody) return;
    setSendingMessage(true);
    setError('');
    try {
      if (localPreview) {
        const created: Message = { id: Date.now(), body: messageBody, authorUid: currentUser?.uid || 'dev-preview-admin', authorName: currentUser?.name || 'Administrador local', createdAt: new Date().toISOString(), replyToMessageId: replyingTo?.id };
        let targetDirectId = selectedDirectId;
        if (draftRecipient) {
          targetDirectId = Date.now();
          loadedConversationRef.current = `direct:${targetDirectId}`;
          setSelectedDirectId(targetDirectId);
          setDirects(previous => [{ conversationId: targetDirectId!, userId: draftRecipient.id, name: draftRecipient.name, department: draftRecipient.department, role: draftRecipient.role, avatarUrl: draftRecipient.avatarUrl, createdAt: created.createdAt, lastMessage: created, unreadCount: 0 }, ...previous]);
          setDraftRecipient(null);
        }
        setMessages(previous => [...previous, created]);
        if (selectedGroupId !== null) setGroups(previous => previous.map(group => group.id === selectedGroupId ? { ...group, lastMessage: created } : group));
        else if (targetDirectId !== null) setDirects(previous => previous.map(conversation => conversation.conversationId === targetDirectId ? { ...conversation, lastMessage: created } : conversation));
        setBody('');
        setReplyingTo(null);
        return;
      }
      let directConversationId = selectedDirectId;
      if (selectedGroupId !== null) {
        await api.sendCommunicationMessage(selectedGroupId, messageBody, replyingTo?.id);
      } else if (selectedDirectId !== null) {
        await api.sendCommunicationDirectMessage(selectedDirectId, messageBody, replyingTo?.id);
      } else if (draftRecipient) {
        const created = await api.startCommunicationDirectMessage(draftRecipient.id, messageBody);
        directConversationId = created.conversationId;
        setSelectedDirectId(created.conversationId);
        setDraftRecipient(null);
      } else return;
      setBody('');
      setReplyingTo(null);
      if (selectedGroupId !== null) setMessages(await api.getCommunicationMessages(selectedGroupId));
      else if (directConversationId !== null) {
        setMessages(await api.getCommunicationDirectMessages(directConversationId));
        await loadDirects();
      }
    } catch (e: any) { setError(e.message); }
    finally { setSendingMessage(false); }
  };

  const toggleMessageReaction = async (message: Message, emoji: string) => {
    const groupId = selectedGroupId;
    const directId = selectedDirectId;
    if (groupId === null && directId === null) return;
    const reactionKey = `${groupId === null ? `direct:${directId}` : `group:${groupId}`}:${message.id}:${emoji}`;
    if (pendingReactionsRef.current.has(reactionKey)) return;
    pendingReactionsRef.current.add(reactionKey);
    const existing = message.reactions?.find(reaction => reaction.emoji === emoji);
    const remove = Boolean(existing?.reactedByMe);
    const updateMessage = (item: Message) => {
      if (item.id !== message.id) return item;
      const reactions = [...(item.reactions || [])];
      const index = reactions.findIndex(reaction => reaction.emoji === emoji);
      if (remove && index >= 0) {
        const current = reactions[index];
        if (current.count <= 1) reactions.splice(index, 1);
        else reactions[index] = { ...current, count: current.count - 1, reactedByMe: false };
      } else if (!remove) {
        if (index >= 0) reactions[index] = { ...reactions[index], count: reactions[index].count + 1, reactedByMe: true };
        else reactions.push({ emoji, count: 1, reactedByMe: true });
      }
      return { ...item, reactions };
    };
    try {
      if (!localPreview) {
        if (groupId !== null) {
          if (remove) await api.removeCommunicationGroupReaction(groupId, message.id, emoji);
          else await api.addCommunicationGroupReaction(groupId, message.id, emoji);
        } else if (directId !== null) {
          if (remove) await api.removeCommunicationDirectReaction(directId, message.id, emoji);
          else await api.addCommunicationDirectReaction(directId, message.id, emoji);
        }
      }
      setMessages(previous => previous.map(updateMessage));
    } catch (e: any) {
      setError(e.message || 'Não foi possível atualizar a reação.');
    } finally {
      pendingReactionsRef.current.delete(reactionKey);
    }
  };

  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const selectedDirect = directs.find(conversation => (conversation.conversationId || (conversation as any).id) === selectedDirectId);
  const directTitle = selectedDirect?.name || draftRecipient?.name;
  const directDepartment = selectedDirect?.department || draftRecipient?.department;
  const unreadGroupTotal = groups.reduce((total, group) => total + (group.unreadCount || 0), 0);
  const unreadDirectTotal = directs.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);

  return <section className="relative flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white text-[#263548]">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#263548] bg-[#151C25] px-3 text-white sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/assets/flash-brand.svg" alt="Flash Engenharia" className="h-8 w-[132px] shrink-0 object-contain object-left md:hidden" />
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00] md:flex"><MessageCircle size={18}/></span>
        <div className="hidden min-w-0 md:block"><h1 className="truncate text-sm font-semibold">Central de comunicação</h1><p className="text-[11px] text-slate-300">Flash Connect</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="md:hidden"><UserAccountMenu compact currentUser={currentUser} onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} onOpenFeedback={onOpenFeedback} onOpenHelpInfo={onOpenHelpInfo} onOpenShortcuts={onOpenShortcuts} onLogout={onLogout}/></div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#263548] hover:text-white sm:px-3"><ArrowLeft size={15}/><span className="hidden sm:inline">Voltar ao sistema</span><span className="sm:hidden">Voltar</span></button>
      </div>
    </header>

    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full min-w-0 shrink-0 flex-col border-r border-[#DCE3EB] bg-white md:w-[340px] md:max-w-[340px]`}>
        <header className="hidden items-center justify-between bg-[#151C25] px-5 py-4 text-white md:flex">
          <div><h2 className="text-base font-semibold">{section === 'groups' ? 'Grupos' : 'Conversas'}</h2><p className="mt-0.5 text-xs text-slate-300">Flash Connect</p></div>
          {section === 'groups' && canCreateGroups && <button type="button" onClick={() => void openCreateGroup()} title="Criar grupo" aria-label="Criar grupo" className="rounded-full bg-[#FFAA00] p-2 text-[#151C25] hover:bg-amber-300"><Plus size={18}/></button>}
          {section === 'conversations' && <button type="button" onClick={() => void openNewConversation()} title="Adicionar conversa" aria-label="Adicionar conversa" className="rounded-full bg-[#FFAA00] p-2 text-[#151C25] transition hover:bg-amber-300"><MessageSquarePlus size={18}/></button>}
        </header>
        <div className="border-b border-[#E7ECF1] p-3 md:p-3">
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F1F4F7] px-3 py-2 text-slate-500"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={section === 'groups' ? 'Pesquisar grupos' : 'Pesquisar conversas'} className="min-w-0 flex-1 bg-transparent text-sm text-[#263548] outline-none placeholder:text-slate-400 sm:text-xs"/></label>
            {section === 'conversations' && <button type="button" onClick={() => void openNewConversation()} title="Adicionar conversa" aria-label="Adicionar conversa" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] transition hover:bg-amber-300 md:hidden"><MessageSquarePlus size={18}/></button>}
            {section === 'groups' && canCreateGroups && <button type="button" onClick={() => void openCreateGroup()} title="Criar grupo" aria-label="Criar grupo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] transition hover:bg-amber-300 md:hidden"><Plus size={18}/></button>}
          </div>
          <div className="mt-3 hidden items-center gap-2 md:flex">
            <button type="button" onClick={() => { setSection('conversations'); clearSelection(); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${section === 'conversations' ? 'bg-[#263548] text-white' : 'bg-[#F1F4F7] text-slate-600'}`}>Conversas</button>
            <button type="button" onClick={() => { setSection('groups'); clearSelection(); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${section === 'groups' ? 'bg-[#263548] text-white' : 'bg-[#F1F4F7] text-slate-600'}`}>Grupos</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listsLoading && !groups.length && !directs.length ? <LoadingState compact label="Carregando conversas e grupos…" /> : listsError && !groups.length && !directs.length ? <DataUnavailableState compact title="Conversas indisponíveis" description="Não foi possível carregar suas conversas e grupos. Confira a conexão com o sistema e tente novamente." onRetry={() => void retryLists()} retrying={listsLoading} /> : <>
          {listsError && <div role="status" className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/80 px-4 py-2 text-[11px] text-amber-900"><span>Sem atualização no momento. Mostrando conversas carregadas anteriormente.</span><button type="button" onClick={() => void retryLists()} className="shrink-0 font-semibold underline underline-offset-2">Tentar novamente</button></div>}
          {section === 'groups' ? (
            visibleGroups.length ? (
              visibleGroups.map((group, index) => (
                <button
                  key={`group-${group.id || index}`}
                  type="button"
                  onClick={() => { pendingLatestScrollRef.current = `group:${group.id}`; setSelectedGroupId(group.id); setSelectedDirectId(null); setDraftRecipient(null); setMessages([]); setMessagesLoading(true); setMessagesError(false); setReplyingTo(null); lastSeenMessageRef.current = null; if (!localPreview) void api.markCommunicationGroupRead(group.id).then(loadGroups).catch(() => undefined); }}
                  className={`flex w-full items-center gap-3 border-b border-[#F1F4F7] px-4 py-3.5 text-left ${selectedGroupId === group.id ? 'bg-[#F1F4F7]' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]">
                    <Users size={19}/>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-[#263548]">{group.name}</b>
                    <small className="mt-1 block truncate text-xs text-slate-500">{group.lastMessage ? `${group.lastMessage.authorName}: ${group.lastMessage.body}` : group.sector}</small>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">{group.lastMessage && <time className="text-[10px] text-slate-400">{formatMessageTime(group.lastMessage.createdAt)}</time>}{group.unreadCount > 0 && <b className="min-w-5 rounded-full bg-[#FFAA00] px-1.5 py-0.5 text-center text-[10px] text-[#151C25]">{group.unreadCount}</b>}</span>
                </button>
              ))
            ) : (
              <p className="p-5 text-xs text-slate-500">Nenhum grupo disponível para sua conta.</p>
            )
          ) : (
            visibleDirects.length ? (
              visibleDirects.map((conversation, index) => {
                const directId = conversation.conversationId || (conversation as any).id || (index + 1);
                return (
                  <button
                    key={`direct-${directId}`}
                    type="button"
                    onClick={() => { pendingLatestScrollRef.current = `direct:${directId}`; setSelectedGroupId(null); setSelectedDirectId(directId); setDraftRecipient(null); setMessages([]); setMessagesLoading(true); setMessagesError(false); setReplyingTo(null); lastSeenMessageRef.current = null; if (!localPreview) void api.markCommunicationDirectRead(directId).then(loadDirects).catch(() => undefined); }}
                    className={`flex w-full items-center gap-3 border-b border-[#F1F4F7] px-4 py-3.5 text-left ${selectedDirectId === directId ? 'bg-[#F1F4F7]' : 'hover:bg-slate-50'}`}
                  >
                    <ContactAvatar name={conversation.name} avatarUrl={conversation.avatarUrl} size="list" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm text-[#263548]">{conversation.name}</b>
                      <small className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessage?.body || conversation.department || 'Conversa direta'}</small>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">{conversation.lastMessage && <time className="text-[10px] text-slate-400">{formatMessageTime(conversation.lastMessage.createdAt)}</time>}{conversation.unreadCount > 0 && <b className="min-w-5 rounded-full bg-[#FFAA00] px-1.5 py-0.5 text-center text-[10px] text-[#151C25]">{conversation.unreadCount}</b>}</span>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs leading-5 text-slate-500">Suas conversas individuais aparecerão aqui. Use o botão <b>+</b> para iniciar uma conversa.</div>
            )
          )}
          </>}
        </div>
        <div className="hidden shrink-0 border-t border-[#202936] bg-[#151C25] p-3 md:block">
          <UserAccountMenu currentUser={currentUser} onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} onOpenFeedback={onOpenFeedback} onOpenHelpInfo={onOpenHelpInfo} onOpenShortcuts={onOpenShortcuts} onLogout={onLogout}/>
        </div>
        <nav aria-label="Seções da comunicação" className="flex shrink-0 items-stretch border-t border-[#263548] bg-[#151C25] pb-[env(safe-area-inset-bottom)] md:hidden">
          <button type="button" onClick={() => { setSection('conversations'); clearSelection(); }} aria-current={section === 'conversations' ? 'page' : undefined} className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${section === 'conversations' ? 'text-[#FFAA00]' : 'text-slate-300'}`}><MessageCircle size={19}/><span>Conversas</span>{unreadDirectTotal > 0 && <b className="absolute right-[calc(50%-25px)] top-1 min-w-4 rounded-full bg-[#FFAA00] px-1 text-center text-[9px] leading-4 text-[#151C25]">{unreadDirectTotal}</b>}</button>
          <button type="button" onClick={() => { setSection('groups'); clearSelection(); }} aria-current={section === 'groups' ? 'page' : undefined} className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${section === 'groups' ? 'text-[#FFAA00]' : 'text-slate-300'}`}><Users size={19}/><span>Grupos</span>{unreadGroupTotal > 0 && <b className="absolute right-[calc(50%-25px)] top-1 min-w-4 rounded-full bg-[#FFAA00] px-1 text-center text-[9px] leading-4 text-[#151C25]">{unreadGroupTotal}</b>}</button>
        </nav>
      </aside>

      <main className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F1F4F7]`}>
        {selectedGroup ? <>
          <header className="flex items-center gap-3 border-b border-[#DCE3EB] bg-white px-4 py-3.5 sm:px-5"><button type="button" onClick={clearSelection} aria-label="Voltar à lista" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7] md:hidden"><ArrowLeft size={18}/></button><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><Users size={18}/></span><button type="button" onClick={() => void openConversationInfo()} className="min-w-0 flex-1 text-left"><h2 className="truncate text-sm font-semibold text-[#263548]">{selectedGroup.name}</h2><p className="text-xs text-slate-500">{selectedGroup.sector} · {groupMembers.length || 'Ver'} participantes</p></button><button type="button" onClick={() => void openConversationInfo()} title="Dados do grupo" aria-label="Dados do grupo" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7]"><Info size={18}/></button></header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{messagesLoading && !messages.length ? <LoadingState compact label="Carregando mensagens…" /> : messagesError && !messages.length ? <DataUnavailableState compact title="Mensagens indisponíveis" description="Não foi possível carregar esta conversa. Verifique sua conexão e tente novamente." onRetry={() => { loadedConversationRef.current = null; void loadMessages(); }} /> : <div className="flex min-h-0 flex-1 flex-col">{messagesError && <div role="status" className="flex items-center justify-between gap-3 bg-transparent px-4 py-1.5 text-[11px] text-slate-500"><span>Sem conexão com o servidor. Mantendo as mensagens já carregadas.</span><button type="button" onClick={() => void loadMessages()} className="shrink-0 font-semibold text-[#916B19] underline underline-offset-2">Tentar atualizar</button></div>}<MessageList messages={messages} scrollerRef={messageListRef} loadOlder={loadOlderMessages} hasOlder={hasOlderMessages} loadingOlder={loadingOlder} groupId={selectedGroupId} onReply={setReplyingTo} onForward={setForwardingMessage} onDetails={setMessageDetails} onDelete={setMessageToDelete} onToggleReaction={toggleMessageReaction}/></div>}</div>
          <MessageComposer body={body} setBody={setBody} send={send} sending={sendingMessage} onSendAudio={sendAudioMessage} replyingTo={replyingTo} cancelReply={() => setReplyingTo(null)}/>
        </> : directTitle ? <>
          <header className="flex items-center gap-3 border-b border-[#DCE3EB] bg-white px-4 py-3.5 sm:px-5"><button type="button" onClick={clearSelection} aria-label="Voltar à lista" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7] md:hidden"><ArrowLeft size={18}/></button><ContactAvatar name={directTitle} avatarUrl={selectedDirect?.avatarUrl || draftRecipient?.avatarUrl} size="header" /><button type="button" onClick={() => void openConversationInfo()} className="min-w-0 flex-1 text-left"><h2 className="truncate text-sm font-semibold text-[#263548]">{directTitle}</h2><p className="text-xs text-slate-500">{draftRecipient ? 'Nova conversa · será criada ao enviar a primeira mensagem' : directDepartment || 'Conversa direta'}</p></button><button type="button" onClick={() => void openConversationInfo()} title="Ver perfil" aria-label="Ver perfil" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7]"><Info size={18}/></button></header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{messagesLoading && !messages.length ? <LoadingState compact label="Carregando mensagens…" /> : messagesError && !messages.length ? <DataUnavailableState compact title="Mensagens indisponíveis" description="Não foi possível carregar esta conversa. Verifique sua conexão e tente novamente." onRetry={() => { loadedConversationRef.current = null; void loadMessages(); }} /> : <div className="flex min-h-0 flex-1 flex-col">{messagesError && <div role="status" className="flex items-center justify-between gap-3 bg-transparent px-4 py-1.5 text-[11px] text-slate-500"><span>Sem conexão com o servidor. Mantendo as mensagens já carregadas.</span><button type="button" onClick={() => void loadMessages()} className="shrink-0 font-semibold text-[#916B19] underline underline-offset-2">Tentar atualizar</button></div>}<MessageList messages={messages} scrollerRef={messageListRef} loadOlder={loadOlderMessages} hasOlder={hasOlderMessages} loadingOlder={loadingOlder} directId={selectedDirectId} onReply={setReplyingTo} onForward={setForwardingMessage} onDetails={setMessageDetails} onDelete={setMessageToDelete} onToggleReaction={toggleMessageReaction}/></div>}</div>
          <MessageComposer body={body} setBody={setBody} send={send} sending={sendingMessage} onSendAudio={sendAudioMessage} replyingTo={replyingTo} cancelReply={() => setReplyingTo(null)}/>
        </> : <div className="m-auto max-w-md px-6 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#916B19] shadow-sm"><MessageCircle size={28}/></div><h2 className="text-lg font-semibold text-[#263548]">Sua comunicação de produção</h2><p className="mt-2 text-sm leading-6 text-slate-500">Selecione uma conversa ou grupo. As mensagens ficam visíveis apenas para seus participantes.</p></div>}
        {error && <p role="alert" className="border-t border-slate-200/70 bg-transparent px-4 py-1.5 text-[11px] text-slate-500">{error}</p>}
      </main>
    </div>

    {conversationInfoOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setConversationInfoOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label={profileUser ? 'Perfil do usuário' : selectedGroup ? 'Informações do grupo' : 'Perfil do usuário'} className="max-h-[85dvh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#E7ECF1] px-5 py-4"><div className="flex items-center gap-2">{profileUser && selectedGroup && <button type="button" onClick={() => setProfileUser(null)} className="mr-1 rounded-lg p-1.5 text-slate-500 hover:bg-[#F1F4F7]" aria-label="Voltar ao grupo"><ArrowLeft size={17}/></button>}<h3 className="font-semibold text-[#263548]">{profileUser ? 'Perfil' : selectedGroup ? 'Informações do grupo' : 'Perfil'}</h3></div><button type="button" onClick={() => setConversationInfoOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F1F4F7]"><X size={18}/></button></header>
        <div className="max-h-[calc(85dvh-60px)] overflow-y-auto p-5">
          {profileUser ? <div className="text-center"><ContactAvatar name={profileUser.name} avatarUrl={profileUser.avatarUrl} size="profile" /><h4 className="mt-3 text-lg font-semibold text-[#263548]">{profileUser.name}</h4><p className="text-sm text-slate-500">{roleLabel(profileUser.role)}</p><div className="mt-5 divide-y divide-[#E7ECF1] rounded-xl border border-[#E7ECF1] text-left"><ProfileRow label="Setor" value={profileUser.department || 'Não informado'}/><ProfileRow label="Acesso" value={roleLabel(profileUser.role)}/></div>{selectedGroup && profileUser.id !== api.getUser()?.id ? <button type="button" onClick={() => { startConversation(profileUser); setConversationInfoOpen(false); }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2 text-sm font-semibold text-[#151C25]"><MessageCircle size={16}/>Iniciar conversa individual</button> : <button type="button" onClick={() => setConversationInfoOpen(false)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2 text-sm font-semibold text-[#151C25]"><MessageCircle size={16}/>{selectedGroup ? 'Voltar ao grupo' : 'Voltar à conversa'}</button>}</div>
            : selectedGroup ? <><div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><Users size={26}/></span><h4 className="mt-3 text-lg font-semibold text-[#263548]">{selectedGroup.name}</h4><p className="text-sm text-slate-500">{selectedGroup.sector}</p><p className="mt-1 text-xs text-slate-400">{groupMembers.length} participantes</p></div><h5 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Participantes</h5><div className="divide-y divide-[#E7ECF1] rounded-xl border border-[#E7ECF1]">{groupMembers.map(member => <button key={member.id} type="button" onClick={() => setProfileUser(member)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#F8FAFC]"><ContactAvatar name={member.name} avatarUrl={member.avatarUrl} size="list" /><span className="min-w-0 flex-1"><b className="block truncate text-sm text-[#263548]">{member.name}</b><small className="text-xs text-slate-500">{member.department || roleLabel(member.role)}</small></span><UserRound size={16} className="text-slate-400"/></button>)}</div></>
            : null}
        </div>
      </section>
    </div>}

    {forwardingMessage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-label="Encaminhar mensagem" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-semibold text-[#263548]">Encaminhar mensagem</h3><button type="button" onClick={() => setForwardingMessage(null)} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F1F4F7]"><X size={18}/></button></div><p className="line-clamp-3 rounded-lg bg-[#F1F4F7] p-3 text-sm text-slate-600">{forwardingMessage.body}</p><label className="block text-xs font-semibold text-slate-600">Enviar para</label><select value={forwardTarget} onChange={event => setForwardTarget(event.target.value)} className="w-full rounded-lg border border-[#DCE3EB] px-3 py-2.5 text-sm text-[#263548]"><option value="">Escolha uma conversa ou grupo</option>{directs.map(item => <option key={`forward-direct-${item.conversationId}`} value={`direct:${item.conversationId}`}>{item.name}</option>)}{groups.map(item => <option key={`forward-group-${item.id}`} value={`group:${item.id}`}>{item.name} · {item.sector}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={() => setForwardingMessage(null)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm text-slate-600">Cancelar</button><button type="button" onClick={() => void sendForward()} disabled={!forwardTarget} className="inline-flex items-center gap-2 rounded-lg bg-[#FFAA00] px-3 py-2 text-sm font-semibold text-[#151C25] disabled:opacity-50"><Forward size={15}/>Encaminhar</button></div></section></div>}

    {messageDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setMessageDetails(null); }}><section role="dialog" aria-modal="true" aria-label="Dados da mensagem" className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-[#E7ECF1] px-4 py-3"><h3 className="font-semibold text-[#263548]">Dados da mensagem</h3><button type="button" onClick={() => setMessageDetails(null)} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F1F4F7]"><X size={17}/></button></header><div className="space-y-3 p-4"><p className="whitespace-pre-wrap break-words rounded-lg bg-[#F1F4F7] p-3 text-sm text-[#263548]">{messageDetails.body}</p><ProfileRow label="Enviada por" value={messageDetails.authorName}/><ProfileRow label="Data e hora" value={new Date(messageDetails.createdAt).toLocaleString()}/>{messageDetails.replyToMessageId && <ProfileRow label="Resposta a mensagem" value={`#${messageDetails.replyToMessageId}`}/>}</div></section></div>}

    {messageToDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !deletingMessage) setMessageToDelete(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div><h3 id="delete-message-title" className="font-semibold text-[#263548]">Apagar mensagem para todos?</h3><p className="mt-2 text-sm leading-5 text-slate-600">O conteúdo será substituído por “Mensagem apagada” para todos os participantes. A ação não pode ser desfeita.</p></div><div className="rounded-lg bg-[#F1F4F7] px-3 py-2 text-xs text-slate-500">{messageToDelete.hasAudio ? 'Mensagem de áudio' : messageToDelete.body}</div><div className="flex justify-end gap-2"><button type="button" disabled={deletingMessage} onClick={() => setMessageToDelete(null)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm text-slate-600 disabled:opacity-50">Cancelar</button><button type="button" disabled={deletingMessage} onClick={() => void deleteMessage()} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"><Trash2 size={15}/>{deletingMessage ? 'Apagando…' : 'Apagar mensagem'}</button></div></section></div>}

    {(newGroup || newConversation) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {newConversation ? <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div><h3 className="font-semibold text-[#263548]">Nova conversa</h3><p className="mt-1 text-xs text-slate-500">Escolha um usuário ativo do sistema. A conversa só será criada quando a primeira mensagem for enviada.</p></div>
        <label className="flex items-center gap-2 rounded-lg border border-[#DCE3EB] px-3 py-2 text-slate-500"><Search size={15}/><input autoFocus value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Buscar por nome ou setor" className="min-w-0 flex-1 text-sm text-[#263548] outline-none"/></label>
        {error && <p role="alert" className="bg-transparent px-1 py-1 text-xs text-rose-700">{error}</p>}
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[#E7ECF1]">{visibleUsers.map((user, index) => <button key={`user-${user.id || index}`} type="button" onClick={() => startConversation(user)} className="flex w-full items-center gap-3 border-b border-[#F1F4F7] px-3 py-3 text-left last:border-0 hover:bg-[#F8FAFC]"><ContactAvatar name={user.name} avatarUrl={user.avatarUrl} size="list" /><span className="min-w-0"><b className="block truncate text-sm text-[#263548]">{user.name}</b><small className="text-xs text-slate-500">{user.department || 'Setor não informado'}</small></span></button>)}{!visibleUsers.length && !error && <p className="p-4 text-center text-xs text-slate-500">Nenhum usuário encontrado.</p>}</div>
        <div className="flex justify-end"><button type="button" onClick={() => setNewConversation(false)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm">Cancelar</button></div>
      </div> : <form onSubmit={createGroup} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="font-semibold text-[#263548]">Criar grupo</h3><input required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Nome do grupo" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/><input required minLength={2} maxLength={80} value={sector} onChange={event => setSector(event.target.value)} placeholder="Setor" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/><label className="block text-xs font-semibold text-[#263548]">Participantes</label><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Pesquisar usuários" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/>{error && <p role="alert" className="bg-transparent px-1 py-1 text-xs text-rose-700">{error}</p>}<div className="max-h-44 overflow-y-auto rounded-lg border border-[#E7ECF1]">{visibleUsers.map((user, index) => <label key={`member-${user.id || index}`} className="flex cursor-pointer items-center gap-2 border-b border-[#F1F4F7] px-3 py-2 last:border-0"><input type="checkbox" checked={memberIds.includes(user.id)} onChange={event => setMemberIds(ids => event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))}/><span className="text-sm text-[#263548]">{user.name}<small className="ml-2 text-xs text-slate-500">{user.department || 'Sem setor informado'}</small></span></label>)}</div><div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setNewGroup(false)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-[#FFAA00] px-3 py-2 text-sm font-semibold text-[#151C25]">Criar grupo</button></div>
      </form>}
    </div>}
  </section>;
};

const MessageList: React.FC<{ messages: Message[]; scrollerRef: React.RefObject<HTMLDivElement | null>; loadOlder: () => void; hasOlder: boolean; loadingOlder: boolean; groupId?: number | null; directId?: number | null; onReply: (message: Message) => void; onForward: (message: Message) => void; onDetails: (message: Message) => void; onDelete: (message: Message) => void; onToggleReaction: (message: Message, emoji: string) => void }> = ({ messages, scrollerRef, loadOlder, hasOlder, loadingOlder, groupId, directId, onReply, onForward, onDetails, onDelete, onToggleReaction }) => {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  const copyMessage = async (message: Message) => {
    try { await navigator.clipboard.writeText(message.body); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
    setOpenMenuId(null);
  };
  return <div ref={scrollerRef} aria-label="Mensagens da conversa" onScroll={event => { if (event.currentTarget.scrollTop < 90 && hasOlder && !loadingOlder) loadOlder(); }} className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pb-5 sm:p-6">
    {(loadingOlder || hasOlder && !messages.length) && <div className="sticky top-1 z-10 mx-auto w-fit rounded-full bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow">{loadingOlder ? 'Carregando mensagens anteriores…' : ''}</div>}
    {copied && <div role="status" className="sticky top-1 z-10 mx-auto w-fit rounded-full bg-[#151C25] px-3 py-1.5 text-xs text-white shadow">Mensagem copiada</div>}
    {!messages.length && !loadingOlder && <div className="m-auto max-w-xs px-5 py-10 text-center text-sm leading-6 text-slate-500">Nenhuma mensagem ainda. Envie uma mensagem para iniciar a conversa.</div>}
    {(Array.isArray(messages) ? messages : []).map((message, index) => {
      const quoted = messages.find(item => item.id === message.replyToMessageId);
      const own = message.authorUid === api.getUser()?.uid;
      const readByCount = message.readByCount || 0;
      const recipientCount = message.recipientCount || 0;
      return <article key={`msg-${message.id || index}-${message.createdAt || ''}`} className={`group relative max-w-[90%] rounded-xl border px-3.5 py-2.5 pr-10 shadow-sm sm:max-w-[82%] ${own ? 'ml-auto border-[#E4D2A2] bg-[#FFF9E9]' : 'border-[#E7ECF1] bg-white'}`}>
        <button type="button" onClick={() => setOpenMenuId(openMenuId === message.id ? null : message.id)} aria-label="Ações da mensagem" title="Ações da mensagem" aria-expanded={openMenuId === message.id} className="absolute right-1.5 top-1.5 rounded-md p-1 text-slate-400 hover:bg-black/5 hover:text-[#263548] md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"><MoreVertical size={16}/></button>
        {openMenuId === message.id && <div role="menu" className={`absolute ${own ? 'right-1' : 'left-1'} top-8 z-30 w-56 overflow-hidden rounded-xl border border-[#DCE3EB] bg-white py-1 shadow-xl`}>
          {!message.deletedAt && <div aria-label="Reações rápidas" className="flex items-center justify-around border-b border-[#E7ECF1] px-2 py-1.5">{quickReactions.map(emoji => <button key={emoji} type="button" role="menuitem" onClick={() => { onToggleReaction(message, emoji); setOpenMenuId(null); }} aria-label={`Reagir com ${emoji}`} title={`Reagir com ${emoji}`} className="rounded-md p-1 text-lg transition hover:scale-110 hover:bg-[#F1F4F7]">{emoji}</button>)}</div>}
          <button type="button" role="menuitem" onClick={() => { onDetails(message); setOpenMenuId(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[#263548] hover:bg-[#F1F4F7]"><Info size={14}/>Dados da mensagem</button>
          {!message.deletedAt && <><button type="button" role="menuitem" onClick={() => { onReply(message); setOpenMenuId(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[#263548] hover:bg-[#F1F4F7]"><Reply size={14}/>Responder</button><button type="button" role="menuitem" onClick={() => void copyMessage(message)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[#263548] hover:bg-[#F1F4F7]"><Copy size={14}/>Copiar</button><button type="button" role="menuitem" onClick={() => { onForward(message); setOpenMenuId(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[#263548] hover:bg-[#F1F4F7]"><Forward size={14}/>Encaminhar</button>{own && <button type="button" role="menuitem" onClick={() => { onDelete(message); setOpenMenuId(null); }} className="flex w-full items-center gap-2.5 border-t border-[#E7ECF1] px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50"><Trash2 size={14}/>Apagar para todos</button>}</>}
        </div>}
        <p className="mb-1 text-[10px] font-semibold text-[#916B19]">{message.authorName}</p>
        {message.replyToMessageId && <div className="mb-2 border-l-2 border-[#FFAA00] bg-[#F1F4F7]/80 px-2.5 py-1.5"><p className="text-[10px] font-semibold text-[#916B19]">{quoted?.authorName || 'Mensagem anterior'}</p><p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-slate-600">{quoted?.body || 'Conteúdo fora do histórico carregado'}</p></div>}
        {message.audioPreviewUrl ? <audio controls preload="metadata" src={message.audioPreviewUrl} className="max-w-full"/> : message.hasAudio && groupId !== undefined && groupId !== null ? <PrivateAudioPlayer message={message} load={() => api.getCommunicationGroupAudio(groupId, message.id)}/> : message.hasAudio && directId !== undefined && directId !== null ? <PrivateAudioPlayer message={message} load={() => api.getCommunicationDirectAudio(directId, message.id)}/> : <p className={`whitespace-pre-wrap break-words text-sm ${message.deletedAt ? 'italic text-slate-500' : 'text-[#263548]'}`}>{message.body}</p>}
        {message.hasAudio && <p className="mt-1 text-[10px] text-slate-500">Áudio · {Math.max(1, Math.round((message.audioDurationMs || 0) / 1000))}s</p>}
        {!!message.reactions?.length && <div className="mt-2 flex flex-wrap gap-1.5">{message.reactions.map(reaction => <button key={reaction.emoji} type="button" onClick={() => onToggleReaction(message, reaction.emoji)} aria-label={`${reaction.emoji}, ${reaction.count} reações${reaction.reactedByMe ? ', sua reação' : ''}`} aria-pressed={reaction.reactedByMe} className={`rounded-full border px-2 py-0.5 text-xs transition ${reaction.reactedByMe ? 'border-[#D59A12] bg-[#FFF1C8]' : 'border-[#DCE3EB] bg-white hover:bg-[#F1F4F7]'}`}>{reaction.emoji} <span className="text-[10px] text-slate-600">{reaction.count}</span></button>)}</div>}
        <time className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">{formatMessageTime(message.createdAt)}{own && recipientCount > 0 && <span title={readByCount ? `Lida por ${readByCount} de ${recipientCount}` : 'Enviada'} aria-label={readByCount ? `Lida por ${readByCount} de ${recipientCount}` : 'Enviada'} className={readByCount ? 'text-sky-600' : 'text-slate-400'}>{readByCount ? <CheckCheck size={13}/> : <Check size={13}/>}</span>}</time>
      </article>;
    })}
  </div>;
};

const MessageComposer: React.FC<{ body: string; setBody: (value: string) => void; send: () => void; sending: boolean; onSendAudio: (audio: Blob, durationMs: number) => Promise<void>; replyingTo: Message | null; cancelReply: () => void }> = ({ body, setBody, send, sending, onSendAudio, replyingTo, cancelReply }) => <form onSubmit={event => { event.preventDefault(); void send(); }} className={`relative z-10 flex shrink-0 gap-2 border-t border-[#DCE3EB] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 ${replyingTo ? 'items-end' : 'items-center'}`}><EmojiPicker onSelect={emoji => setBody(`${body}${emoji}`.slice(0, 4000))}/><AudioRecorderButton onRecorded={onSendAudio}/><div className="min-w-0 flex-1">{replyingTo && <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-[#FFAA00] bg-[#F1F4F7] px-2.5 py-1.5"><span className="min-w-0 flex-1"><b className="block text-[10px] text-[#916B19]">Respondendo a {replyingTo.authorName}</b><small className="block truncate text-xs text-slate-600">{replyingTo.body}</small></span><button type="button" onClick={cancelReply} aria-label="Cancelar resposta" className="rounded p-1 text-slate-500 hover:bg-white"><X size={15}/></button></div>}<textarea aria-label="Escreva uma mensagem" value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} maxLength={4000} rows={1} placeholder="Escreva uma mensagem · Enter envia, Shift+Enter quebra linha" className="max-h-28 min-h-11 w-full resize-none overflow-y-auto rounded-2xl border border-[#DCE3EB] px-4 py-3 text-sm text-[#263548] outline-none focus:border-[#FFAA00]"/></div><button type="submit" disabled={!body.trim() || sending} title={sending ? 'Enviando mensagem…' : 'Enviar mensagem'} aria-label={sending ? 'Enviando mensagem' : 'Enviar mensagem'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] hover:bg-amber-300 disabled:opacity-40"><Send size={17}/></button></form>;

const ContactAvatar: React.FC<{ name: string; avatarUrl?: string | null; size: 'list' | 'header' | 'profile' }> = ({ name, avatarUrl, size }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUrl]);
  const dimensions = size === 'profile' ? 'h-20 w-20 text-2xl' : size === 'header' ? 'h-10 w-10 text-sm' : 'h-11 w-11 text-xs';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#263548] font-semibold text-[#FFAA00] ${dimensions} ${size === 'profile' ? 'mx-auto' : ''}`}>
    {avatarUrl && !failed ? <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} /> : initials}
  </span>;
};

const PrivateAudioPlayer: React.FC<{ message: Message; load: () => Promise<string> }> = ({ message, load }) => {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false); const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const fetchAudio = async () => { setLoading(true); setFailed(false); try { setUrl(await load()); } catch { setFailed(true); } finally { setLoading(false); } };
  return url ? <audio controls preload="none" src={url} className="max-w-full"/> : <button type="button" disabled={loading} onClick={() => void fetchAudio()} className="rounded-lg border border-[#DCE3EB] bg-white px-3 py-2 text-xs font-semibold text-[#263548] disabled:opacity-50">{translateText(loading ? 'Carregando áudio…' : failed ? 'Tentar carregar áudio' : 'Carregar áudio para reproduzir')}</button>;
};

const roleLabel = (role?: string) => ({ ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', OPERATOR: 'Operador', AUDITOR: 'Auditor' }[role || ''] || 'Usuário do sistema');
const ProfileRow: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="px-3 py-2.5"><small className="block text-[10px] uppercase tracking-wide text-slate-400">{label}</small><span className="text-sm text-[#263548]">{value}</span></div>;
