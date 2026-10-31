import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle, MessageSquarePlus, Plus, Search, Send, Users } from 'lucide-react';
import { api, type AuthUser } from '../../api.ts';
import { UserAccountMenu } from '../../components/UserAccountMenu.tsx';

type Group = { id: number; name: string; sector: string; createdAt: string };
type Message = { id: number; body: string; authorUid: string; authorName: string; createdAt: string };
type DirectoryUser = { id: number; name: string; department: string | null };
type DirectConversation = {
  conversationId: number;
  userId: number;
  name: string;
  department: string | null;
  createdAt: string;
  lastMessage: Pick<Message, 'body' | 'authorUid' | 'createdAt'> | null;
};

const formatMessageTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const CommunicationsView: React.FC<{ currentUser: AuthUser | null; onBack: () => void; onOpenProfile: () => void; onOpenSettings: () => void; onLogout: () => void }> = ({ currentUser, onBack, onOpenProfile, onOpenSettings, onLogout }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [directs, setDirects] = useState<DirectConversation[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedDirectId, setSelectedDirectId] = useState<number | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<DirectoryUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [newGroup, setNewGroup] = useState(false);
  const [newConversation, setNewConversation] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [section, setSection] = useState<'conversations' | 'groups'>('conversations');
  const canCreateGroups = ['ADMIN', 'SUPERVISOR'].includes(api.getUser()?.role || '');
  const selectedConversation = selectedGroupId !== null || selectedDirectId !== null || draftRecipient !== null;

  const loadGroups = useCallback(async () => {
    try {
      const data = await api.getCommunicationGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setGroups([]);
      setError(e.message);
    }
  }, []);
  const loadDirects = useCallback(async () => {
    try {
      const data = await api.getCommunicationDirectConversations();
      setDirects(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setDirects([]);
      setError(e.message);
    }
  }, []);
  const loadDirectory = async () => {
    try {
      const data = await api.getCommunicationDirectory();
      setDirectory(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setDirectory([]);
      setError(e.message);
    }
  };
  const loadMessages = useCallback(async () => {
    try {
      if (selectedGroupId !== null) {
        const data = await api.getCommunicationMessages(selectedGroupId);
        setMessages(Array.isArray(data) ? data : []);
      } else if (selectedDirectId !== null) {
        const data = await api.getCommunicationDirectMessages(selectedDirectId);
        setMessages(Array.isArray(data) ? data : []);
      } else {
        setMessages([]);
      }
    } catch (e: any) {
      setMessages([]);
      setError(e.message);
    }
  }, [selectedGroupId, selectedDirectId]);

  useEffect(() => {
    void loadGroups();
    void loadDirects();
    const timer = window.setInterval(() => void loadDirects(), 10000);
    return () => window.clearInterval(timer);
  }, [loadGroups, loadDirects]);
  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 10000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  const visibleGroups = useMemo(
    () => (Array.isArray(groups) ? groups : []).filter(group => group && `${group.name || ''} ${group.sector || ''}`.toLowerCase().includes((search || '').toLowerCase())),
    [groups, search],
  );
  const visibleDirects = useMemo(
    () => (Array.isArray(directs) ? directs : []).filter(conversation => conversation && `${conversation.name || ''} ${conversation.department || ''}`.toLowerCase().includes((search || '').toLowerCase())),
    [directs, search],
  );
  const visibleUsers = useMemo(
    () => (Array.isArray(directory) ? directory : []).filter(user => user && `${user.name || ''} ${user.department || ''}`.toLowerCase().includes((userSearch || '').toLowerCase())),
    [directory, userSearch],
  );

  const clearSelection = () => {
    setSelectedGroupId(null);
    setSelectedDirectId(null);
    setDraftRecipient(null);
    setMessages([]);
    setBody('');
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
      const group = await api.createCommunicationGroup(name, sector, memberIds);
      setNewGroup(false);
      setSection('groups');
      clearSelection();
      setSelectedGroupId(group.id);
      await loadGroups();
    } catch (e: any) { setError(e.message); }
  };
  const startConversation = (user: DirectoryUser) => {
    const existing = directs.find(conversation => conversation.userId === user.id);
    const existingId = existing ? (existing.conversationId || (existing as any).id) : null;
    setSection('conversations');
    setSelectedGroupId(null);
    setSelectedDirectId(existingId);
    setDraftRecipient(existing ? null : user);
    setMessages([]);
    setBody('');
    setNewConversation(false);
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const messageBody = body.trim();
    if (!messageBody) return;
    setError('');
    try {
      let directConversationId = selectedDirectId;
      if (selectedGroupId !== null) {
        await api.sendCommunicationMessage(selectedGroupId, messageBody);
      } else if (selectedDirectId !== null) {
        await api.sendCommunicationDirectMessage(selectedDirectId, messageBody);
      } else if (draftRecipient) {
        const created = await api.startCommunicationDirectMessage(draftRecipient.id, messageBody);
        directConversationId = created.conversationId;
        setSelectedDirectId(created.conversationId);
        setDraftRecipient(null);
      } else return;
      setBody('');
      if (selectedGroupId !== null) setMessages(await api.getCommunicationMessages(selectedGroupId));
      else if (directConversationId !== null) {
        setMessages(await api.getCommunicationDirectMessages(directConversationId));
        await loadDirects();
      }
    } catch (e: any) { setError(e.message); }
  };

  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const selectedDirect = directs.find(conversation => (conversation.conversationId || (conversation as any).id) === selectedDirectId);
  const directTitle = selectedDirect?.name || draftRecipient?.name;
  const directDepartment = selectedDirect?.department || draftRecipient?.department;

  return <section className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white text-[#263548]">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#263548] bg-[#151C25] px-3 text-white sm:px-6">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><MessageCircle size={18}/></span><div className="min-w-0"><h1 className="truncate text-sm font-semibold">Central de comunicação</h1><p className="text-[11px] text-slate-300">Flash Connect</p></div></div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="md:hidden"><UserAccountMenu compact currentUser={currentUser} onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} onLogout={onLogout}/></div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#263548] hover:text-white sm:px-3"><ArrowLeft size={15}/><span className="hidden sm:inline">Voltar ao sistema</span><span className="sm:hidden">Voltar</span></button>
      </div>
    </header>

    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full max-w-[340px] shrink-0 flex-col border-r border-[#DCE3EB] bg-white md:w-[340px]`}>
        <header className="flex items-center justify-between bg-[#151C25] px-5 py-4 text-white">
          <div><h2 className="text-base font-semibold">{section === 'groups' ? 'Grupos' : 'Conversas'}</h2><p className="mt-0.5 text-xs text-slate-300">Flash Connect</p></div>
          {section === 'groups' && canCreateGroups && <button type="button" onClick={() => void openCreateGroup()} title="Criar grupo" aria-label="Criar grupo" className="rounded-full bg-[#FFAA00] p-2 text-[#151C25] hover:bg-amber-300"><Plus size={18}/></button>}
          {section === 'conversations' && <button type="button" onClick={() => void openNewConversation()} title="Adicionar conversa" aria-label="Adicionar conversa" className="rounded-full bg-[#FFAA00] p-2 text-[#151C25] transition hover:bg-amber-300"><MessageSquarePlus size={18}/></button>}
        </header>
        <div className="border-b border-[#E7ECF1] p-3">
          <label className="flex items-center gap-2 rounded-full bg-[#F1F4F7] px-3 py-2 text-slate-500"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={section === 'groups' ? 'Pesquisar grupos' : 'Pesquisar conversas'} className="min-w-0 flex-1 bg-transparent text-xs text-[#263548] outline-none placeholder:text-slate-400"/></label>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => { setSection('conversations'); clearSelection(); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${section === 'conversations' ? 'bg-[#263548] text-white' : 'bg-[#F1F4F7] text-slate-600'}`}>Conversas</button>
            <button type="button" onClick={() => { setSection('groups'); clearSelection(); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${section === 'groups' ? 'bg-[#263548] text-white' : 'bg-[#F1F4F7] text-slate-600'}`}>Grupos</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {section === 'groups' ? (
            visibleGroups.length ? (
              visibleGroups.map((group, index) => (
                <button
                  key={`group-${group.id || index}`}
                  type="button"
                  onClick={() => { setSelectedGroupId(group.id); setSelectedDirectId(null); setDraftRecipient(null); setMessages([]); }}
                  className={`flex w-full items-center gap-3 border-b border-[#F1F4F7] px-4 py-3.5 text-left ${selectedGroupId === group.id ? 'bg-[#F1F4F7]' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]">
                    <Users size={19}/>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-[#263548]">{group.name}</b>
                    <small className="mt-1 block truncate text-xs text-slate-500">{group.sector}</small>
                  </span>
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
                    onClick={() => { setSelectedGroupId(null); setSelectedDirectId(directId); setDraftRecipient(null); setMessages([]); }}
                    className={`flex w-full items-center gap-3 border-b border-[#F1F4F7] px-4 py-3.5 text-left ${selectedDirectId === directId ? 'bg-[#F1F4F7]' : 'hover:bg-slate-50'}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]">
                      <MessageCircle size={19}/>
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm text-[#263548]">{conversation.name}</b>
                      <small className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessage?.body || conversation.department || 'Conversa direta'}</small>
                    </span>
                    {conversation.lastMessage && <time className="self-start text-[10px] text-slate-400">{formatMessageTime(conversation.lastMessage.createdAt)}</time>}
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs leading-5 text-slate-500">Suas conversas individuais aparecerão aqui. Use o botão <b>+</b> para iniciar uma conversa.</div>
            )
          )}
        </div>
        <div className="hidden shrink-0 border-t border-[#202936] bg-[#151C25] p-3 md:block">
          <UserAccountMenu currentUser={currentUser} onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} onLogout={onLogout}/>
        </div>
      </aside>

      <main className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#F1F4F7]`}>
        {selectedGroup ? <>
          <header className="flex items-center gap-3 border-b border-[#DCE3EB] bg-white px-4 py-3.5 sm:px-5"><button type="button" onClick={clearSelection} aria-label="Voltar à lista" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7] md:hidden"><ArrowLeft size={18}/></button><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><Users size={18}/></span><div><h2 className="text-sm font-semibold text-[#263548]">{selectedGroup.name}</h2><p className="text-xs text-slate-500">{selectedGroup.sector}</p></div></header>
          <MessageList messages={messages}/>
          <MessageComposer body={body} setBody={setBody} send={send}/>
        </> : directTitle ? <>
          <header className="flex items-center gap-3 border-b border-[#DCE3EB] bg-white px-4 py-3.5 sm:px-5"><button type="button" onClick={clearSelection} aria-label="Voltar à lista" className="rounded-lg p-2 text-slate-500 hover:bg-[#F1F4F7] md:hidden"><ArrowLeft size={18}/></button><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><MessageCircle size={18}/></span><div><h2 className="text-sm font-semibold text-[#263548]">{directTitle}</h2><p className="text-xs text-slate-500">{draftRecipient ? 'Nova conversa · será criada ao enviar a primeira mensagem' : directDepartment || 'Conversa direta'}</p></div></header>
          <MessageList messages={messages}/>
          <MessageComposer body={body} setBody={setBody} send={send}/>
        </> : <div className="m-auto max-w-md px-6 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#916B19] shadow-sm"><MessageCircle size={28}/></div><h2 className="text-lg font-semibold text-[#263548]">Sua comunicação de produção</h2><p className="mt-2 text-sm leading-6 text-slate-500">Selecione uma conversa ou grupo. As mensagens ficam visíveis apenas para seus participantes.</p></div>}
        {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
      </main>
    </div>

    {(newGroup || newConversation) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {newConversation ? <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div><h3 className="font-semibold text-[#263548]">Nova conversa</h3><p className="mt-1 text-xs text-slate-500">Escolha um usuário ativo do sistema. A conversa só será criada quando a primeira mensagem for enviada.</p></div>
        <label className="flex items-center gap-2 rounded-lg border border-[#DCE3EB] px-3 py-2 text-slate-500"><Search size={15}/><input autoFocus value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Buscar por nome ou setor" className="min-w-0 flex-1 text-sm text-[#263548] outline-none"/></label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[#E7ECF1]">{visibleUsers.map((user, index) => <button key={`user-${user.id || index}`} type="button" onClick={() => startConversation(user)} className="flex w-full items-center gap-3 border-b border-[#F1F4F7] px-3 py-3 text-left last:border-0 hover:bg-[#F8FAFC]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#263548] text-sm font-semibold text-[#FFAA00]">{user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><span className="min-w-0"><b className="block truncate text-sm text-[#263548]">{user.name}</b><small className="text-xs text-slate-500">{user.department || 'Setor não informado'}</small></span></button>)}{!visibleUsers.length && !error && <p className="p-4 text-center text-xs text-slate-500">Nenhum usuário encontrado.</p>}</div>
        <div className="flex justify-end"><button type="button" onClick={() => setNewConversation(false)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm">Cancelar</button></div>
      </div> : <form onSubmit={createGroup} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="font-semibold text-[#263548]">Criar grupo</h3><input required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Nome do grupo" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/><input required minLength={2} maxLength={80} value={sector} onChange={event => setSector(event.target.value)} placeholder="Setor" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/><label className="block text-xs font-semibold text-[#263548]">Participantes</label><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Pesquisar usuários" className="w-full rounded-lg border border-[#DCE3EB] p-2.5 text-sm"/>{error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<div className="max-h-44 overflow-y-auto rounded-lg border border-[#E7ECF1]">{visibleUsers.map((user, index) => <label key={`member-${user.id || index}`} className="flex cursor-pointer items-center gap-2 border-b border-[#F1F4F7] px-3 py-2 last:border-0"><input type="checkbox" checked={memberIds.includes(user.id)} onChange={event => setMemberIds(ids => event.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))}/><span className="text-sm text-[#263548]">{user.name}<small className="ml-2 text-xs text-slate-500">{user.department || 'Sem setor informado'}</small></span></label>)}</div><div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setNewGroup(false)} className="rounded-lg border border-[#DCE3EB] px-3 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-[#FFAA00] px-3 py-2 text-sm font-semibold text-[#151C25]">Criar grupo</button></div>
      </form>}
    </div>}
  </section>;
};

const MessageList: React.FC<{ messages: Message[] }> = ({ messages }) => <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pb-5 sm:p-6">{(Array.isArray(messages) ? messages : []).map((message, index) => <article key={`msg-${message.id || index}-${message.createdAt || ''}`} className={`max-w-[90%] rounded-xl border px-3.5 py-2.5 shadow-sm sm:max-w-[82%] ${message.authorUid === api.getUser()?.uid ? 'ml-auto border-[#E4D2A2] bg-[#FFF9E9]' : 'border-[#E7ECF1] bg-white'}`}><p className="mb-1 text-[10px] font-semibold text-[#916B19]">{message.authorName}</p><p className="whitespace-pre-wrap break-words text-sm text-[#263548]">{message.body}</p><time className="mt-1 block text-right text-[10px] text-slate-400">{formatMessageTime(message.createdAt)}</time></article>)}</div>;

const MessageComposer: React.FC<{ body: string; setBody: (value: string) => void; send: (event: React.FormEvent) => void }> = ({ body, setBody, send }) => <form onSubmit={send} className="sticky bottom-0 z-10 flex shrink-0 items-end gap-2 border-t border-[#DCE3EB] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4"><textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={1} placeholder="Escreva uma mensagem" className="max-h-28 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-[#DCE3EB] px-4 py-3 text-sm text-[#263548] outline-none focus:border-[#FFAA00]"/><button type="submit" disabled={!body.trim()} title="Enviar mensagem" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFAA00] text-[#151C25] hover:bg-amber-300 disabled:opacity-40"><Send size={17}/></button></form>;
