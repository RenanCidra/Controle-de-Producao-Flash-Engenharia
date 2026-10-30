import React, { useState } from 'react';
import { Activity, ArrowRight, Boxes, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldCheck, Waypoints } from 'lucide-react';
import { api, AuthUser } from '../../api.ts';
import { translateText } from '../../i18n/index.ts';

interface AuthPageProps {
  setupRequired: boolean;
  bootstrapEnabled: boolean;
  setupStatusChecked: boolean;
  setupStatusError: string;
  onSuccess: (user: AuthUser, message: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ setupRequired, bootstrapEnabled, setupStatusChecked, setupStatusError, onSuccess }) => {
  const [loginName, setLoginName] = useState('');
  const [name, setName] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = (value: string) => translateText(value);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = setupRequired
        ? await api.bootstrapAdmin({ setupSecret, loginName, name, password })
        : await api.login({ loginName, password });
      api.setSession(result.accessToken, result.user);
      onSuccess(result.user, setupRequired ? 'Administrador inicial configurado.' : 'Sessão autenticada.');
    } catch (requestError: any) {
      setError(requestError.message || t('Falha na autenticação.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-[100svh] overflow-x-hidden bg-[#0C1420] text-white selection:bg-amber-400/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-[position:68%_center] opacity-40 lg:hidden" style={{ backgroundImage: "url('/assets/login-production.webp')" }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0C1420]/65 via-[#0C1420]/75 to-[#0C1420]/95 lg:hidden" />
      <div className="relative grid min-h-[100svh] w-full lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0C1420] px-4 py-6 sm:px-8 sm:py-9 lg:order-1 lg:flex lg:px-16 lg:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover opacity-60 saturate-[0.8]" style={{ backgroundImage: "url('/assets/login-production.webp')", backgroundPosition: '62% center' }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0C1420]/40 via-[#0C1420]/35 to-[#0C1420]/70" />
          <div className="pointer-events-none absolute -left-28 top-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex flex-col items-start gap-1.5">
              <img src="/assets/flash-brand.svg" alt="Flash Engenharia" className="h-10 w-40 object-contain object-left sm:h-12 sm:w-[190px]" />
            </div>
          </div>

          <div className="relative my-7 max-w-2xl sm:my-10 lg:my-0">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-700 bg-[#101A27] px-3 py-1.5 text-[10px] font-medium text-amber-300 sm:mb-5 sm:text-xs">
              <Activity size={14} className="shrink-0" /> {t('Produção conectada, rastreável e sob controle')}
            </div>
            <h1 className="max-w-xl text-2xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              <span className="block">{t('Da ordem de produção à entrega.')}</span>
              <span className="mt-1 block text-amber-400">{t('Clareza em cada etapa.')}</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:mt-5 sm:text-base sm:leading-7">
              {t('Acompanhe a operação em um só lugar e transforme dados dispersos em decisões mais rápidas para a fábrica.')}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 lg:mt-10">
              <Feature icon={<Waypoints size={18} />} title={t('Rastreabilidade de ponta a ponta')} description={t('Conecte pedidos de venda, ordens de produção, etapas e apontamentos.')}/>
              <Feature icon={<Boxes size={18} />} title={t('Visibilidade da operação')} description={t('Encontre atrasos, saldo a produzir, refugo e disponibilidade de estoque.')}/>
              <Feature icon={<Activity size={18} />} title={t('Dados do Protheus integrados')} description={t('Centralize a leitura operacional de pedidos, produtos, roteiros e produção.')}/>
              <Feature icon={<ShieldCheck size={18} />} title={t('Acesso e histórico controlados')} description={t('Use contas individuais, perfis de acesso e trilha de auditoria.')}/>
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} /> {t('Acesso interno protegido por autenticação')}</div>
        </section>

        <section className="relative isolate order-1 flex min-h-[100svh] items-center justify-center overflow-y-auto px-4 py-5 sm:px-8 sm:py-8 lg:order-2 lg:border-l lg:border-slate-800 lg:bg-[#111C2A] lg:px-12 lg:py-10 xl:px-20">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#0B1420] px-5 py-5 shadow-2xl shadow-black/50 sm:rounded-3xl sm:px-7 sm:py-8">
            <div className="mb-5 sm:mb-8">
              <img src="/assets/flash-brand.svg" alt="Flash Engenharia" className="mb-5 h-8 w-32 object-contain object-left sm:hidden" />
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">{setupRequired ? t('Primeiro acesso') : t('Acesso ao sistema')}</div>
              <h2 className="mt-1.5 text-2xl font-bold sm:mt-3 sm:text-3xl">{setupRequired ? t('Configure a conta administradora') : t('Boas-vindas')}</h2>
              <p className="mt-1.5 text-sm leading-5 text-slate-400 sm:mt-2 sm:leading-6">
                {setupRequired
                  ? t('Ainda não existe um administrador ativo com senha configurada. Configure o acesso inicial seguro da equipe.')
                  : t('Entre com seu usuário e senha internos para acompanhar a operação.')}
              </p>
            </div>

            {!setupStatusChecked && <div className="mb-5 flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" />{t('Verificando configuração de acesso...')}</div>}
            {setupStatusError && <div role="alert" className="mb-5 rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm leading-6 text-rose-200">
              <p>{setupStatusError}</p>
              <p className="mt-2 text-rose-200/80">{t('Confirme que o servidor foi reiniciado na versão atual e que a migração de acesso foi aplicada.')}</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-2 underline underline-offset-2">{t('Tentar novamente')}</button>
            </div>}

            {setupRequired && setupStatusChecked && !bootstrapEnabled && (
              <div className="mb-5 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100">
                <div className="font-semibold">{t('Configuração de implantação necessária')}</div>
                <p className="mt-1 text-amber-100/80">{t('O responsável pelo ambiente precisa definir a chave temporária BOOTSTRAP_SECRET nas variáveis secretas da implantação. Depois, use essa chave aqui para criar o primeiro administrador.')}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {setupStatusChecked && !setupStatusError && setupRequired && bootstrapEnabled && <Field label={t('Chave temporária de implantação')} value={setupSecret} onChange={setSetupSecret} type="password" autoComplete="off" required />}
              {setupStatusChecked && !setupStatusError && setupRequired && <Field label={t('Nome do administrador')} value={name} onChange={setName} autoComplete="name" required />}
              {setupStatusChecked && !setupStatusError && (
                <Field
                  label={setupRequired ? t('Usuário') : t('Usuário ou ID')}
                  placeholder={setupRequired ? undefined : t('Usuário, ID ou e-mail')}
                  value={loginName}
                  onChange={setLoginName}
                  autoComplete="username"
                  minLength={setupRequired ? 3 : 1}
                  maxLength={80}
                  required
                />
              )}
              {setupStatusChecked && !setupStatusError && <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">{setupRequired ? t('Senha (mínimo 12 caracteres)') : t('Senha')}</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} required minLength={setupRequired ? 12 : undefined} autoComplete={setupRequired ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0C1420] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t('Ocultar senha') : t('Mostrar senha')} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-white">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>}

              {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>}

              {setupStatusChecked && !setupStatusError && <button type="submit" disabled={loading || (setupRequired && !bootstrapEnabled)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3.5">
                {loading ? <RefreshCw size={17} className="animate-spin" /> : <>{setupRequired ? t('Criar administrador e entrar') : t('Entrar')} <ArrowRight size={17} /></>}
              </button>}
            </form>

            <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3 text-[10px] leading-4 text-slate-500 sm:mt-6 sm:items-start sm:pt-5 sm:text-xs sm:leading-5">
              <ShieldCheck size={14} className="shrink-0 text-emerald-500" />
              <span className="sm:hidden">{t('Acesso interno protegido.')}</span>
              <span className="hidden sm:inline">{t('As contas são administradas internamente. Não há cadastro público nem necessidade de e-mail para entrar.')}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-700/80 bg-[#111C2A] p-3 shadow-sm shadow-black/20 sm:p-4">
    <div className="flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-slate-100 sm:items-center sm:gap-2 sm:text-sm sm:leading-normal"><span className="shrink-0 text-amber-400">{icon}</span><span>{title}</span></div>
    <p className="mt-1.5 text-[10px] leading-4 text-slate-400 sm:mt-2 sm:text-xs sm:leading-5">{description}</p>
  </div>;
}

function Field({ label, value, onChange, type = 'text', autoComplete, minLength, maxLength, required, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string;
  minLength?: number; maxLength?: number; required?: boolean; placeholder?: string;
}) {
  return <div>
    <label className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label>
    <input type={type} required={required} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0C1420] px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" />
  </div>;
}
