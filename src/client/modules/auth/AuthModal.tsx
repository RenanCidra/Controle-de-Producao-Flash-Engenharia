import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Modal } from '../../components/Modal.tsx';
import { api, AuthUser } from '../../api.ts';

interface AuthModalProps {
  isOpen: boolean;
  setupRequired: boolean;
  bootstrapEnabled: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, message: string) => void;
  onError: (error: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  setupRequired,
  bootstrapEnabled,
  onClose,
  onSuccess,
  onError,
}) => {
  const [loginName, setLoginName] = useState('');
  const [name, setName] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = setupRequired
        ? await api.bootstrapAdmin({ setupSecret, loginName, name, password })
        : await api.login({ loginName, password });
      api.setSession(result.accessToken, result.user);
      onSuccess(result.user, setupRequired ? 'Administrador inicial configurado.' : 'Sessão autenticada.');
      onClose();
    } catch (error: any) {
      onError(error.message || 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const title = setupRequired ? 'Configuração inicial segura' : 'Autenticação';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {setupRequired && (
          <>
            <p className="text-xs text-slate-300">
              Ainda não há contas cadastradas. Configure a primeira conta administradora para iniciar o sistema.
            </p>
            {!bootstrapEnabled && (
              <p className="text-xs text-rose-300">
                O responsável pela implantação precisa configurar o segredo BOOTSTRAP_SECRET no ambiente.
              </p>
            )}
            {bootstrapEnabled && (
              <div>
                <label className="text-xs font-medium text-slate-300">Chave de configuração inicial</label>
                <input
                  type="password"
                  required
                  autoComplete="off"
                  value={setupSecret}
                  onChange={(event) => setSetupSecret(event.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-300">Nome do administrador</label>
              <input
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-slate-300">
            {setupRequired ? 'Usuário de acesso' : 'Usuário ou ID'}
          </label>
          <input
            type="text"
            required
            minLength={setupRequired ? 3 : 1}
            maxLength={80}
            autoComplete="username"
            placeholder={setupRequired ? undefined : 'Usuário, ID ou e-mail'}
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300">
            {setupRequired ? 'Senha (mínimo 12 caracteres)' : 'Senha'}
          </label>
          <input
            type="password"
            required
            minLength={setupRequired ? 12 : undefined}
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading || (setupRequired && !bootstrapEnabled)}
          className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
          {setupRequired ? 'Criar administrador e entrar' : 'Entrar'}
        </button>
      </form>
    </Modal>
  );
};
