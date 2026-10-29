import React, { useEffect, useState } from 'react';
import { ImagePlus, LockKeyhole, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { api, AuthUser } from '../../api.ts';
import { AppLanguage } from '../../i18n/catalog.ts';
import { getAppLanguage, setAppLanguage, translateText } from '../../i18n/index.ts';
import { Modal } from '../../components/Modal.tsx';
import { readUserPreferences, saveUserPreferences } from './user-preferences.ts';

interface UserProfileModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, user, onClose }) => {
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('pt-BR');
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const preferences = readUserPreferences(user?.uid);
    setAvatarDataUrl(preferences.avatarDataUrl);
    setLanguage(preferences.language || getAppLanguage() as AppLanguage);
    setMessage('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordMessage('');
  }, [isOpen, user?.uid]);

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação não corresponde à nova senha.');
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError('A nova senha deve possuir no mínimo 12 caracteres.');
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await api.changeOwnPassword({ currentPassword, newPassword });
      setPasswordMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordError(error.message || 'Não foi possível alterar a senha.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage('A foto deve ter no máximo 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => setMessage('Não foi possível abrir a imagem selecionada.');
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!user?.uid) {
      setMessage('Entre com sua conta para salvar suas preferências.');
      return;
    }
    saveUserPreferences(user.uid, { avatarDataUrl, language });
    setAppLanguage(language);
    setMessage('Preferências salvas neste dispositivo.');
  };

  const initials = (user?.name || '?').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Meu perfil" maxWidth="max-w-lg">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {avatarDataUrl
            ? <img src={avatarDataUrl} alt="Foto de perfil" className="h-16 w-16 rounded-full border border-slate-700 object-cover" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-lg font-semibold text-slate-200">{initials}</div>}
          <div>
            <p className="text-sm font-semibold text-white">{user?.name || 'Usuário'}</p>
            <p className="mt-1 text-xs text-slate-400">{user?.loginName || 'Sessão não autenticada'}{user?.role ? ` · ${user.role}` : ''}</p>
          </div>
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Personalização</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
              <ImagePlus className="h-4 w-4 text-amber-400" /> {translateText('Escolher foto')}
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhoto} />
            </label>
            {avatarDataUrl && <button type="button" onClick={() => setAvatarDataUrl(null)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Trash2 className="h-4 w-4" />{translateText('Remover foto')}</button>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{translateText('Imagem local de até 1 MB; fica salva neste dispositivo.')}</p>
        </section>

        {user?.uid.startsWith('dev-preview') && <p className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">{translateText('A troca de senha fica disponível quando você entra com sua conta real.')}</p>}
        {user && !user.uid.startsWith('dev-preview') && (
          <form onSubmit={handlePasswordChange} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><LockKeyhole className="h-4 w-4 text-amber-400" />{translateText('Segurança da conta')}</div>
            <p className="mt-1 text-[11px] text-slate-500">{translateText('Confirme sua senha atual. A nova senha deve ter pelo menos 12 caracteres.')}</p>
            <div className="mt-3 space-y-3">
              <PasswordField label={translateText('Senha atual')} value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
              <PasswordField label={translateText('Nova senha')} value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} />
              <PasswordField label={translateText('Confirmar nova senha')} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={12} />
            </div>
            {passwordError && <p role="alert" className="mt-3 text-xs text-rose-300">{translateText(passwordError)}</p>}
            {passwordMessage && <p role="status" className="mt-3 text-xs text-emerald-300">{translateText(passwordMessage)}</p>}
            <button type="submit" disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
              {passwordLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}{translateText(passwordLoading ? 'Alterando senha…' : 'Alterar minha senha')}
            </button>
          </form>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <label htmlFor="profile-language" className="text-xs font-semibold text-slate-300">{translateText('Idioma preferido')}</label>
          <select id="profile-language" value={language} onChange={(event) => setLanguage(event.target.value as AppLanguage)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
            <option value="pt-BR">Português</option><option value="en-US">English</option><option value="es-ES">Español</option>
          </select>
        </section>

        <div className="rounded-lg border border-slate-800 px-3 py-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{translateText('Nome e usuário de acesso são administrados pela equipe responsável.')}</div>
        </div>
        {message && <p role="status" className="text-xs text-slate-300">{translateText(message)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">{translateText('Fechar')}</button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">{translateText('Salvar preferências')}</button>
        </div>
      </div>
    </Modal>
  );
};

function PasswordField({ label, value, onChange, autoComplete, minLength }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number }) {
  return <label className="block text-[11px] font-medium text-slate-400">
    {label}
    <input type="password" required minLength={minLength} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
  </label>;
}
