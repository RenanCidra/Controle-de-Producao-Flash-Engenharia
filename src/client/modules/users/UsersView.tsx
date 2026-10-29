import React, { useState, useMemo } from 'react';
import { Users, Plus, Trash2, KeyRound, Edit2, Search, X, Shield, Wrench, Monitor, FileSearch } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api, AuthUser } from '../../api.ts';
import { formatProperName, sanitizeLoginName, isValidLoginName } from '../../../modules/auth/credentials.ts';

interface UserRecord {
  id: number;
  uid: string;
  loginName: string;
  email?: string | null;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR';
  status: 'ACTIVE' | 'INACTIVE';
  department?: string | null;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

interface UsersViewProps {
  users: UserRecord[];
  currentUser?: AuthUser | null;
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const ROLE_BADGES: Record<'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR', { label: string; icon: React.ElementType; className: string }> = {
  ADMIN: {
    label: 'ADMIN',
    icon: Shield,
    className: 'bg-amber-950/50 text-amber-400 border border-amber-800/50',
  },
  SUPERVISOR: {
    label: 'SUPERVISOR',
    icon: Monitor,
    className: 'bg-sky-950/50 text-sky-400 border border-sky-800/50',
  },
  OPERATOR: {
    label: 'OPERATOR',
    icon: Wrench,
    className: 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50',
  },
  AUDITOR: {
    label: 'AUDITOR',
    icon: FileSearch,
    className: 'bg-purple-950/50 text-purple-400 border border-purple-800/50',
  },
};

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  currentUser,
  onReload,
  onSuccess,
  onError,
}) => {
  const loggedUser = currentUser || api.getUser();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<UserRecord | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserRecord | null>(null);

  // Form: Create User
  const [createCustomUid, setCreateCustomUid] = useState('');
  const [createName, setCreateName] = useState('');
  const [createLogin, setCreateLogin] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR'>('OPERATOR');
  const [createDepartment, setCreateDepartment] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form: Edit User
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR'>('OPERATOR');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editDepartment, setEditDepartment] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Form: Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Form: Delete
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const adminCount = users.filter((u) => u.role === 'ADMIN' && u.status === 'ACTIVE').length;

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesName = u.name.toLowerCase().includes(term);
        const matchesLogin = u.loginName.toLowerCase().includes(term);
        const matchesEmail = (u.email || '').toLowerCase().includes(term);
        const matchesDept = (u.department || '').toLowerCase().includes(term);
        const matchesUid = u.uid.toLowerCase().includes(term);
        const matchesId = `#${u.id}`.includes(term) || String(u.id) === term;
        if (!matchesName && !matchesLogin && !matchesEmail && !matchesDept && !matchesUid && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchTerm]);

  const openCreateModal = () => {
    setCreateCustomUid('');
    setCreateName('');
    setCreateLogin('');
    setCreateEmail('');
    setCreateRole('OPERATOR');
    setCreateDepartment('');
    setCreatePassword('');
    setCreateConfirmPassword('');
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCreate) return;

    const formattedName = formatProperName(createName);
    if (!formattedName || formattedName.length < 3) {
      onError('O nome completo deve conter no mínimo 3 caracteres.');
      return;
    }

    const sanitizedLogin = sanitizeLoginName(createLogin);
    if (!isValidLoginName(sanitizedLogin)) {
      onError('O usuário de acesso deve ter entre 3 e 40 caracteres (letras minúsculas, números, ponto, hífen ou sublinhado).');
      return;
    }

    if (createPassword.length < 12) {
      onError('A senha deve ter no mínimo 12 caracteres.');
      return;
    }

    if (createPassword !== createConfirmPassword) {
      onError('As senhas digitadas não conferem.');
      return;
    }

    const cleanUid = createCustomUid.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    setIsSubmittingCreate(true);
    try {
      await api.createUser({
        name: formattedName,
        loginName: sanitizedLogin,
        email: createEmail.trim() ? createEmail.toLowerCase().trim() : undefined,
        role: createRole,
        department: createDepartment.trim() ? formatProperName(createDepartment) : undefined,
        password: createPassword,
        customUid: cleanUid || undefined,
      });

      setCreateModalOpen(false);
      onSuccess(`Conta de acesso "${sanitizedLogin}" criada com sucesso.`);
      onReload();
    } catch (err: any) {
      onError(err.message || 'Falha ao cadastrar conta de acesso.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openEditModal = (u: UserRecord) => {
    setEditUser(u);
    setEditName(u.name);
    setEditEmail(u.email || '');
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditDepartment(u.department || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser || isSubmittingEdit) return;

    const formattedName = formatProperName(editName);
    if (!formattedName || formattedName.length < 3) {
      onError('O nome completo deve conter no mínimo 3 caracteres.');
      return;
    }

    const isSelf = loggedUser && loggedUser.id === editUser.id;
    if (isSelf && (editRole !== 'ADMIN' || editStatus === 'INACTIVE')) {
      onError('Você não pode remover seus próprios privilégios administrativos ou desativar sua conta.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await api.updateUser(editUser.id, {
        name: formattedName,
        email: editEmail.trim() ? editEmail.toLowerCase().trim() : null,
        role: editRole,
        status: editStatus,
        department: editDepartment.trim() ? formatProperName(editDepartment) : null,
      });

      setEditUser(null);
      onSuccess(`Conta de acesso "${editUser.loginName}" atualizada com sucesso.`);
      onReload();
    } catch (err: any) {
      onError(err.message || 'Falha ao atualizar conta de acesso.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const openResetPwdModal = (u: UserRecord) => {
    setResetPwdUser(u);
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser || isSubmittingReset) return;

    if (newPassword.length < 12) {
      onError('A nova senha deve ter no mínimo 12 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      onError('As senhas digitadas não conferem.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      await api.resetUserPassword(resetPwdUser.id, newPassword);
      setResetPwdUser(null);
      onSuccess(`Senha da conta "${resetPwdUser.loginName}" redefinida com sucesso.`);
    } catch (err: any) {
      onError(err.message || 'Falha ao redefinir senha.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const openDeleteConfirm = (u: UserRecord) => {
    const isSelf = loggedUser && loggedUser.id === u.id;
    if (isSelf) {
      onError('Não é possível excluir a própria conta em uso.');
      return;
    }
    if (u.role === 'ADMIN' && adminCount <= 1) {
      onError('Não é possível excluir a última conta administradora ativa.');
      return;
    }
    setDeleteConfirmUser(u);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteConfirmUser || isSubmittingDelete) return;

    setIsSubmittingDelete(true);
    try {
      await api.deleteUser(deleteConfirmUser.id);
      const login = deleteConfirmUser.loginName;
      setDeleteConfirmUser(null);
      onSuccess(`Conta de acesso "${login}" excluída com sucesso.`);
      onReload();
    } catch (err: any) {
      onError(err.message || 'Falha ao excluir conta.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Contas de Acesso</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerenciamento de identidades, perfis de acesso e credenciais de segurança.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Conta
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, @login, ID ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#151C25] border border-[#202936] text-xs text-white rounded-lg pl-9 pr-8 py-2 placeholder-slate-500 focus:outline-none focus:border-[#FFAA00]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-[#151C25] border border-[#202936] text-xs text-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#FFAA00] cursor-pointer"
          >
            <option value="ALL">Todos os Perfis</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPERVISOR">SUPERVISOR</option>
            <option value="OPERATOR">OPERATOR</option>
            <option value="AUDITOR">AUDITOR</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#151C25] border border-[#202936] text-xs text-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#FFAA00] cursor-pointer"
          >
            <option value="ALL">Todos os Status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'Nenhuma conta encontrada com os filtros aplicados.'
              : 'Nenhuma conta de acesso cadastrada.'
          }
          actionLabel={searchTerm ? 'Limpar filtros' : 'Cadastrar Conta'}
          onAction={
            searchTerm
              ? () => {
                  setSearchTerm('');
                  setRoleFilter('ALL');
                  setStatusFilter('ALL');
                }
              : openCreateModal
          }
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#121820] text-slate-400 uppercase font-semibold border-b border-[#202936]">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Login</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Setor / Turno</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Último Acesso</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202936]">
                {filteredUsers.map((u) => {
                  const isCurrent = loggedUser && loggedUser.id === u.id;
                  const roleBadge = ROLE_BADGES[u.role] || ROLE_BADGES.OPERATOR;
                  const RoleIcon = roleBadge.icon;

                  return (
                    <tr key={u.id} className="hover:bg-[#1C2532] transition">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {u.uid.startsWith('usr_') ? `#${u.id}` : u.uid}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-[#202936] border border-[#263342] flex items-center justify-center text-[11px] font-bold text-slate-200 shrink-0">
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-white">{u.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  Você
                                </span>
                              )}
                            </div>
                            {u.email && (
                              <span className="text-[11px] text-slate-400 block">{u.email}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        @{u.loginName}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${roleBadge.className}`}>
                          <RoleIcon className="h-3 w-3" />
                          {roleBadge.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {u.department || '—'}
                      </td>

                      <td className="py-3 px-4">
                        {u.status === 'ACTIVE' ? (
                          <span className="text-emerald-400 font-medium text-[11px]">Ativo</span>
                        ) : (
                          <span className="text-rose-400 font-medium text-[11px]">Inativo</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {u.lastLoginAt ? (
                          new Date(u.lastLoginAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(u)}
                            title="Editar conta"
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#263342] rounded transition cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => openResetPwdModal(u)}
                            title="Redefinir senha"
                            className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => openDeleteConfirm(u)}
                            disabled={isCurrent || (u.role === 'ADMIN' && adminCount <= 1)}
                            title={
                              isCurrent
                                ? 'Não é possível excluir a própria conta'
                                : u.role === 'ADMIN' && adminCount <= 1
                                ? 'Último administrador ativo'
                                : 'Excluir conta'
                            }
                            className={`p-1.5 rounded transition ${
                              isCurrent || (u.role === 'ADMIN' && adminCount <= 1)
                                ? 'text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer'
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Cadastrar Conta */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Cadastrar Conta de Acesso"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">
                Nome Completo <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Carlos Silva"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onBlur={() => {
                  if (createName.trim()) setCreateName(formatProperName(createName));
                }}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300">
                Usuário (@login) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={40}
                placeholder="Ex: carlos.silva"
                value={createLogin}
                onChange={(e) => setCreateLogin(sanitizeLoginName(e.target.value))}
                onBlur={() => {
                  if (createLogin.trim()) setCreateLogin(sanitizeLoginName(createLogin));
                }}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">ID Próprio (Opcional)</label>
              <input
                type="text"
                maxLength={36}
                placeholder="Ex: MAT-1042 ou USR-101"
                value={createCustomUid}
                onChange={(e) => setCreateCustomUid(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300">E-mail (Opcional)</label>
              <input
                type="email"
                placeholder="carlos.silva@empresa.com.br"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value.toLowerCase().trim())}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">
                Perfil de Acesso <span className="text-rose-400">*</span>
              </label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as any)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="OPERATOR">OPERATOR (Operador)</option>
                <option value="SUPERVISOR">SUPERVISOR (Supervisor)</option>
                <option value="AUDITOR">AUDITOR (Auditor)</option>
                <option value="ADMIN">ADMIN (Administrador)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300">Setor / Turno (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: Usinagem ou 1º Turno"
                value={createDepartment}
                onChange={(e) => setCreateDepartment(e.target.value)}
                onBlur={() => {
                  if (createDepartment.trim()) setCreateDepartment(formatProperName(createDepartment));
                }}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs text-slate-300">
                Senha Inicial <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                required
                minLength={12}
                placeholder="Mínimo 12 caracteres"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300">
                Confirmar Senha <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                required
                minLength={12}
                placeholder="Repita a senha"
                value={createConfirmPassword}
                onChange={(e) => setCreateConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="px-4 py-1.5 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingCreate ? 'Salvando...' : 'Cadastrar Conta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Editar Conta */}
      <Modal
        isOpen={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title={editUser ? `Editar Conta: @${editUser.loginName}` : 'Editar Conta'}
      >
        <form onSubmit={handleEditSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">
              Nome Completo <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (editName.trim()) setEditName(formatProperName(editName));
              }}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300">E-mail (Opcional)</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value.toLowerCase().trim())}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Perfil de Acesso</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as any)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="OPERATOR">OPERATOR</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="AUDITOR">AUDITOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300">Setor / Turno (Opcional)</label>
            <input
              type="text"
              value={editDepartment}
              onChange={(e) => setEditDepartment(e.target.value)}
              onBlur={() => {
                if (editDepartment.trim()) setEditDepartment(formatProperName(editDepartment));
              }}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-4 py-1.5 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Redefinir Senha */}
      <Modal
        isOpen={Boolean(resetPwdUser)}
        onClose={() => setResetPwdUser(null)}
        title={resetPwdUser ? `Redefinir Senha: @${resetPwdUser.loginName}` : 'Redefinir Senha'}
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">
              Nova Senha <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              required
              minLength={12}
              placeholder="Mínimo 12 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300">
              Confirmar Nova Senha <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              required
              minLength={12}
              placeholder="Repita a nova senha"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setResetPwdUser(null)}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingReset}
              className="px-4 py-1.5 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingReset ? 'Redefinindo...' : 'Redefinir Senha'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirmar Exclusão */}
      <Modal
        isOpen={Boolean(deleteConfirmUser)}
        onClose={() => setDeleteConfirmUser(null)}
        title="Excluir Conta de Acesso"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            Deseja realmente excluir a conta de acesso{' '}
            <strong className="text-white">{deleteConfirmUser?.name}</strong> (@{deleteConfirmUser?.loginName})?
          </p>
          <p className="text-[11px] text-slate-400">
            Esta ação revoga permanentemente o acesso do usuário ao sistema.
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setDeleteConfirmUser(null)}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSubmittingDelete}
              onClick={handleDeleteSubmit}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingDelete ? 'Excluindo...' : 'Excluir Conta'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
