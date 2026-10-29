import React, { useState } from 'react';
import { RefreshCw, Lock, Key } from 'lucide-react';
import { Modal } from '../../components/Modal.tsx';
import { api, AuthUser } from '../../api.ts';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../../../lib/firebase.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, message: string) => void;
  onError: (error: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'QUALITY_INSPECTOR'>('SUPERVISOR');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'login') {
        const res = await api.login({ email, password });
        api.setSession(res.accessToken, res.user);
        onSuccess(res.user, 'Sessão autenticada.');
      } else {
        const res = await api.register({ email, password, name, role });
        api.setSession(res.accessToken, res.user);
        onSuccess(res.user, 'Usuário cadastrado com sucesso.');
      }
      onClose();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await api.firebaseLogin(idToken);
      api.setSession(res.accessToken, res.user);
      onSuccess(res.user, 'Autenticado com sucesso via Google.');
      onClose();
    } catch (err: any) {
      onError(err.message || 'Falha na autenticação Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={authMode === 'login' ? 'Autenticação' : 'Cadastro de Operador'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {authMode === 'register' && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-300">Nome Completo</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Função</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="QUALITY_INSPECTOR">QUALITY_INSPECTOR</option>
                <option value="OPERATOR">OPERATOR</option>
              </select>
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-slate-300">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300">Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
        >
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
          {authMode === 'login' ? 'Entrar' : 'Cadastrar'}
        </button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-slate-900 px-2 text-slate-500">Ou</span>
        </div>
      </div>

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition flex items-center justify-center gap-2"
      >
        <Key className="h-3.5 w-3.5 text-amber-400" />
        Google SSO
      </button>

      <div className="mt-4 text-center">
        <button
          onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          className="text-xs text-amber-400 hover:underline"
        >
          {authMode === 'login' ? 'Criar nova conta' : 'Já possui conta? Clique para entrar'}
        </button>
      </div>
    </Modal>
  );
};
