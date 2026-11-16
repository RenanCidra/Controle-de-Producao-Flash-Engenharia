import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, ImagePlus, LockKeyhole, LogOut, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { api, AuthUser, type NotificationScope } from '../../api.ts';
import { AppLanguage } from '../../i18n/catalog.ts';
import { getAppLanguage, setAppLanguage, translateText } from '../../i18n/index.ts';
import { Modal } from '../../components/Modal.tsx';
import { applyThemePreference, readUserPreferences, saveUserPreferences, type ThemePreference } from './user-preferences.ts';
import {
  getBrowserNotificationPermission,
  getExistingPushSubscription,
  isPushSupported,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from '../notifications/push-client.ts';

interface UserProfileModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onLogoutComplete?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, user, onClose, onLogoutComplete }) => {
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('pt-BR');
  const [theme, setTheme] = useState<ThemePreference>('mixed');
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [notifScope, setNotifScope] = useState<NotificationScope>('SECTOR');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('06:00');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [vapidEnabled, setVapidEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState('');
  const [logoutStopBusy, setLogoutStopBusy] = useState(false);
  const avatarEditedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const preferences = readUserPreferences(user?.uid);
    let active = true;
    avatarEditedRef.current = false;
    setAvatarDataUrl(preferences.avatarDataUrl);
    if (user?.uid && !user.uid.startsWith('dev-preview')) {
      void api.getOwnAvatar().then(result => { if (active && !avatarEditedRef.current && result.avatarUrl) setAvatarDataUrl(result.avatarUrl); }).catch(() => undefined);
      void api.getNotificationPreferences().then((prefs) => {
        if (!active) return;
        setNotifScope(prefs.scope);
        setQuietHoursEnabled(Boolean(prefs.quietHoursEnabled));
        setQuietHoursStart(prefs.quietHoursStart || '22:00');
        setQuietHoursEnd(prefs.quietHoursEnd || '06:00');
      }).catch(() => undefined);
      void Promise.all([
        api.getVapidPublicKey().catch(() => ({ enabled: false, publicKey: null })),
        getExistingPushSubscription().catch(() => null),
      ]).then(([vapid, sub]) => {
        if (!active) return;
        setVapidEnabled(Boolean(vapid.enabled));
        setPushSubscribed(Boolean(sub));
      });
    }
    setLanguage(preferences.language || getAppLanguage() as AppLanguage);
    setTheme(preferences.theme);
    setMessage('');
    setPushStatusMsg('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordMessage('');
    return () => { active = false; };
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
    reader.onload = () => { avatarEditedRef.current = true; setAvatarDataUrl(typeof reader.result === 'string' ? reader.result : null); };
    reader.onerror = () => setMessage('Não foi possível abrir a imagem selecionada.');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user?.uid) {
      setMessage('Entre com sua conta para salvar suas preferências.');
      return;
    }
    setPreferencesLoading(true);
    try {
      const isLocalPreview = user.uid.startsWith('dev-preview');
      if (!isLocalPreview) {
        await Promise.all([
          api.updateOwnAvatar(avatarDataUrl),
          api.updateNotificationPreferences({
            scope: notifScope,
            quietHoursEnabled,
            quietHoursStart,
            quietHoursEnd,
          }),
        ]);
      }
      const saved = saveUserPreferences(user.uid, { avatarDataUrl, language, theme });
      if (!saved) throw new Error('Não foi possível salvar as preferências neste dispositivo.');
      if (!isLocalPreview) window.dispatchEvent(new Event('flash-contact-avatar-change'));
      setAppLanguage(language);
      setMessage(isLocalPreview ? 'Foto local salva somente nesta prévia.' : 'Foto e preferências de notificação sincronizadas.');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível salvar a foto e preferências do perfil.');
    } finally {
      setPreferencesLoading(false);
    }
  };

  const handleToggleDevicePush = async () => {
    setPushBusy(true);
    setPushStatusMsg('');
    try {
      if (pushSubscribed) {
        await unsubscribeBrowserPush();
        setPushSubscribed(false);
        setPushStatusMsg('Notificações Push desativadas neste aparelho.');
      } else {
        const res = await subscribeBrowserPush();
        setPushStatusMsg(res.message);
        if (res.ok) setPushSubscribed(true);
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleLogoutAndStopNotifications = async () => {
    if (logoutStopBusy) return;
    setLogoutStopBusy(true);
    try {
      await unsubscribeBrowserPush();
      try {
        await api.logout();
      } catch {
        // Proceed clearing local session even if server logout already expired.
      }
      api.clearSession();
      onClose();
      onLogoutComplete?.();
    } finally {
      setLogoutStopBusy(false);
    }
  };

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme);
    applyThemePreference(nextTheme);
    if (user?.uid) {
      const saved = saveUserPreferences(user.uid, { theme: nextTheme });
      setMessage(saved ? 'Tema atualizado e salvo neste dispositivo.' : 'Tema aplicado, mas não foi possível salvá-lo neste dispositivo.');
    }
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
          <label htmlFor="profile-theme" className="mt-3 block text-xs font-semibold text-slate-300">{translateText('Tema da interface')}</label>
          <select id="profile-theme" value={theme} onChange={(event) => handleThemeChange(event.target.value as ThemePreference)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
            <option value="mixed">{translateText('Mesclado (atual)')}</option>
            <option value="light">{translateText('Claro')}</option>
            <option value="dark">{translateText('Escuro')}</option>
            <option value="system">{translateText('Padrão do sistema')}</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-500">{translateText('O padrão do sistema acompanha a preferência de aparência do dispositivo.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
              <ImagePlus className="h-4 w-4 text-amber-400" /> {translateText('Escolher foto')}
              <input type="file" accept="image/*" className="sr-only" onChange={handlePhoto} />
            </label>
            {avatarDataUrl && <button type="button" onClick={() => { avatarEditedRef.current = true; setAvatarDataUrl(null); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Trash2 className="h-4 w-4" />{translateText('Remover foto')}</button>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{translateText('Foto de até 1 MB; visível para seus contatos na Central de Comunicação.')}</p>
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

        {user && !user.uid.startsWith('dev-preview') && (
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Bell className="h-4 w-4 text-amber-400" />
              <span>{translateText('Notificações e alertas')}</span>
            </div>

            <div>
              <label htmlFor="profile-notif-scope" className="block text-[11px] font-medium text-slate-400">
                {translateText('Quais ocorrências notificar')}
              </label>
              <select
                id="profile-notif-scope"
                value={notifScope}
                onChange={(event) => setNotifScope(event.target.value as NotificationScope)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              >
                <option value="MINE">{translateText('Só minhas (atribuídas ou abertas por mim)')}</option>
                <option value="SECTOR">{translateText('Do meu setor')}</option>
                <option value="ALL">{translateText('Todas as ocorrências da fábrica')}</option>
              </select>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
              <label className="flex items-center justify-between gap-3 text-xs text-slate-200">
                <span>{translateText('Horário de silêncio (sem push)')}</span>
                <input
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(event) => setQuietHoursEnabled(event.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
              </label>
              {quietHoursEnabled && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-400">
                    {translateText('Início')}
                    <input
                      type="time"
                      value={quietHoursStart}
                      onChange={(event) => setQuietHoursStart(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    {translateText('Fim')}
                    <input
                      type="time"
                      value={quietHoursEnd}
                      onChange={(event) => setQuietHoursEnd(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-slate-400">
                {!isPushSupported()
                  ? translateText('Push não suportado neste navegador.')
                  : !vapidEnabled
                    ? translateText('Push aguardando chaves VAPID no servidor (sino interno ativo).')
                    : getBrowserNotificationPermission() === 'denied'
                      ? translateText('Permissão de notificação bloqueada nas configurações do navegador.')
                      : pushSubscribed
                        ? translateText('Notificações Push ativas neste aparelho.')
                        : translateText('Notificações Push desativadas neste aparelho.')}
              </div>
              {isPushSupported() && vapidEnabled && getBrowserNotificationPermission() !== 'denied' && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void handleToggleDevicePush()}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    pushSubscribed
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                  }`}
                >
                  {pushSubscribed ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                  <span>{translateText(pushBusy ? 'Aguarde…' : pushSubscribed ? 'Parar push aqui' : 'Ativar push neste aparelho')}</span>
                </button>
              )}
            </div>
            {pushStatusMsg && <p role="status" className="text-[11px] text-amber-200">{translateText(pushStatusMsg)}</p>}

            <div className="border-t border-slate-800 pt-3">
              <button
                type="button"
                disabled={logoutStopBusy}
                onClick={() => void handleLogoutAndStopNotifications()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-950/60 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{translateText(logoutStopBusy ? 'Encerrando…' : 'Sair e parar notificações neste aparelho')}</span>
              </button>
            </div>
          </section>
        )}

        <div className="rounded-lg border border-slate-800 px-3 py-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{translateText('Nome e usuário de acesso são administrados pela equipe responsável.')}</div>
        </div>
        {message && <p role="status" className="text-xs text-slate-300">{translateText(message)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">{translateText('Fechar')}</button>
          <button type="button" disabled={preferencesLoading} onClick={() => void handleSave()} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{translateText(preferencesLoading ? 'Salvando…' : 'Salvar preferências')}</button>
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
