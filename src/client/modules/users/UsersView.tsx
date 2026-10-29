import React, { useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';

interface UsersViewProps {
  users: any[];
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({
        name,
        email,
        role,
        department,
        password,
      });
      setModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setDepartment('');
      onSuccess('Colaborador cadastrado.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir este colaborador?')) return;
    try {
      await api.deleteUser(id);
      onSuccess('Colaborador excluído.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Equipe de Produção</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Operadores, inspetores de qualidade e supervisores.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Colaborador
        </button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador cadastrado."
          actionLabel="Novo Colaborador"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#121820] text-slate-400 uppercase font-semibold border-b border-[#202936]">
              <tr>
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4">Função</th>
                <th className="py-3 px-4">Turno / Setor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202936]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#1C2532] transition">
                  <td className="py-3 px-4 font-medium text-white">{u.name}</td>
                  <td className="py-3 px-4 text-slate-300 font-mono">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1C2532] text-slate-300 border border-[#263342]">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">{u.department || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="text-emerald-400 font-semibold">{u.status}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cadastrar Colaborador"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">Nome Completo</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Função</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="QUALITY_INSPECTOR">QUALITY_INSPECTOR</option>
                <option value="OPERATOR">OPERATOR</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300">Turno / Setor</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-300">Senha Provisória</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
