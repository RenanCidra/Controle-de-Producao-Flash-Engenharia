import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus, Send } from 'lucide-react';
import { api } from '../../api.ts';

type Group = { id: number; name: string; sector: string };
type Message = { id: number; body: string; authorUid: string; authorName: string; createdAt: string };

export const CommunicationsView: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [newGroup, setNewGroup] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');

  const loadGroups = useCallback(async () => { try { const rows = await api.getCommunicationGroups(); setGroups(rows); setSelected(current => current ?? rows[0]?.id ?? null); } catch (e: any) { setError(e.message); } }, []);
  const loadMessages = useCallback(async () => { if (selected) try { setMessages(await api.getCommunicationMessages(selected)); } catch (e: any) { setError(e.message); } }, [selected]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { void loadMessages(); const timer = window.setInterval(() => void loadMessages(), 10000); return () => window.clearInterval(timer); }, [loadMessages]);
  const createGroup = async (event: React.FormEvent) => { event.preventDefault(); try { const group = await api.createCommunicationGroup(name, sector); setName(''); setSector(''); setNewGroup(false); await loadGroups(); setSelected(group.id); } catch (e: any) { setError(e.message); } };
  const send = async (event: React.FormEvent) => { event.preventDefault(); if (!selected || !body.trim()) return; try { await api.sendCommunicationMessage(selected, body); setBody(''); await loadMessages(); } catch (e: any) { setError(e.message); } };

  return <section className="flex h-[calc(100dvh-9rem)] min-h-[480px] overflow-hidden rounded-2xl border border-[#DCE3EB] bg-white shadow-sm">
    <aside className="flex w-full max-w-xs shrink-0 flex-col border-r border-[#E7ECF1] bg-white sm:w-72">
      <header className="flex items-center justify-between border-b border-[#E7ECF1] bg-[#151C25] px-4 py-4 text-white"><div><h1 className="text-sm font-bold">Comunicação</h1><p className="text-[11px] text-slate-300">Conversas por setor</p></div><button onClick={() => setNewGroup(true)} title="Criar grupo" className="rounded-lg bg-[#FFAA00] p-2 text-[#151C25]"><Plus size={17}/></button></header>
      <div className="flex-1 overflow-y-auto">{groups.map(group => <button key={group.id} onClick={() => setSelected(group.id)} className={`flex w-full items-center gap-3 border-b border-[#F1F4F7] px-4 py-3 text-left ${selected === group.id ? 'bg-[#FFF8E7]' : 'hover:bg-[#F8FAFC]'}`}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#263548] text-[#FFAA00]"><MessageCircle size={18}/></span><span className="min-w-0"><b className="block truncate text-sm text-[#263548]">{group.name}</b><small className="text-slate-500">{group.sector}</small></span></button>)}{!groups.length && <p className="p-5 text-xs text-slate-500">Nenhum grupo criado ainda.</p>}</div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col bg-[#F1F4F7]">
      <header className="border-b border-[#DCE3EB] bg-white px-5 py-4"><h2 className="text-sm font-bold text-[#263548]">{groups.find(g => g.id === selected)?.name || 'Selecione uma conversa'}</h2><p className="text-[11px] text-slate-500">{groups.find(g => g.id === selected)?.sector || 'Setor'}</p></header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map(message => <article key={message.id} className={`max-w-[80%] rounded-xl border px-3 py-2 shadow-sm ${message.authorUid === api.getUser()?.uid ? 'ml-auto border-[#F4D27A] bg-[#FFF8E7]' : 'border-[#E7ECF1] bg-white'}`}><p className="text-[10px] font-semibold text-[#B77900]">{message.authorName}</p><p className="whitespace-pre-wrap break-words text-sm text-[#263548]">{message.body}</p><time className="mt-1 block text-right text-[9px] text-slate-400">{new Date(message.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</time></article>)}</div>
      {error && <p role="alert" className="px-4 text-xs text-rose-700">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-[#DCE3EB] bg-white p-3"><input value={body} onChange={e => setBody(e.target.value)} maxLength={4000} placeholder="Escreva uma mensagem..." className="min-w-0 flex-1 rounded-xl border border-[#DCE3EB] px-4 py-2.5 text-sm outline-none focus:border-[#FFAA00]"/><button disabled={!selected || !body.trim()} className="rounded-xl bg-[#FFAA00] px-4 text-[#151C25] disabled:opacity-40"><Send size={17}/></button></form>
    </div>
    {newGroup && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={createGroup} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl"><h3 className="font-bold text-[#263548]">Novo grupo</h3><input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Nome do grupo" className="w-full rounded-lg border p-2 text-sm"/><input required minLength={2} maxLength={80} value={sector} onChange={e => setSector(e.target.value)} placeholder="Setor" className="w-full rounded-lg border p-2 text-sm"/><div className="flex justify-end gap-2"><button type="button" onClick={() => setNewGroup(false)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-[#FFAA00] px-3 py-2 text-sm font-semibold">Criar grupo</button></div></form></div>}
  </section>;
};
