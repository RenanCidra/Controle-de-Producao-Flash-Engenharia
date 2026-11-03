import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { api, AuthUser } from './client/api.ts';
import { Sidebar, ActiveTab } from './client/components/Sidebar.tsx';
import { Header } from './client/components/Header.tsx';
import { AuthModal } from './client/modules/auth/AuthModal.tsx';
import { DashboardView } from './client/modules/dashboard/DashboardView.tsx';
import { TraceabilityView } from './client/modules/traceability/TraceabilityView.tsx';
import { OccurrencesView } from './client/modules/occurrences/OccurrencesView.tsx';
import { ProductionOrdersView } from './client/modules/production-orders/ProductionOrdersView.tsx';
import { ProductionLinesView } from './client/modules/production-lines/ProductionLinesView.tsx';
import { QualityView } from './client/modules/quality/QualityView.tsx';
import { InventoryView } from './client/modules/inventory/InventoryView.tsx';
import { IntegrationsView } from './client/modules/integrations/IntegrationsView.tsx';
import { SettingsView, SettingsSubTab } from './client/modules/settings/SettingsView.tsx';
import { subscribeToLanguageChange } from './client/i18n/index.ts';
import { AuthPage } from './client/modules/auth/AuthPage.tsx';
import { UserProfileModal } from './client/modules/auth/UserProfileModal.tsx';
import { FlashAssistantWidget } from './client/components/FlashAssistantWidget.tsx';
import { WelcomeView } from './client/modules/home/WelcomeView.tsx';
import { CommunicationsView } from './client/modules/communications/CommunicationsView.tsx';
import { FeedbackDialog } from './client/modules/feedback/FeedbackDialog.tsx';

const DEV_PREVIEW_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW_AUTH === 'true';
const DEV_PREVIEW_USER: AuthUser = {
  id: 1,
  uid: 'dev-preview-admin',
  loginName: 'preview-admin',
  name: 'Prévia local',
  role: 'ADMIN',
  department: 'Ambiente de desenvolvimento',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === 'undefined') return 'home';
    const reopenSettings = window.sessionStorage.getItem('flash-reopen-settings-after-language-change') === 'true';
    window.sessionStorage.removeItem('flash-reopen-settings-after-language-change');
    return reopenSettings ? 'settings' : 'home';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [previousTab, setPreviousTab] = useState<ActiveTab>('home');
  const [occurrencesOpFilter, setOccurrencesOpFilter] = useState<string | null>(null);
  const [traceabilityOpRequest, setTraceabilityOpRequest] = useState<string | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('general');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(DEV_PREVIEW_AUTH ? DEV_PREVIEW_USER : null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<'submit' | 'inbox' | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [setupStatusChecked, setSetupStatusChecked] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState('');
  const [languageRevision, setLanguageRevision] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [communicationsTransitionLoading, setCommunicationsTransitionLoading] = useState(false);
  const [communicationsTransitionFading, setCommunicationsTransitionFading] = useState(false);
  const transitionStartedAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingDashboardDataRef = useRef(false);
  const pendingDashboardStatsRef = useRef(false);
  const beginCommunicationsTransition = () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionStartedAtRef.current = Date.now();
    setCommunicationsTransitionFading(false);
    setCommunicationsTransitionLoading(true);
  };
  const finishCommunicationsTransition = useCallback(() => {
    const minimumVisibleMs = 500;
    const remainingMs = Math.max(0, minimumVisibleMs - (Date.now() - transitionStartedAtRef.current));
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      setCommunicationsTransitionFading(true);
      transitionTimerRef.current = window.setTimeout(() => setCommunicationsTransitionLoading(false), 300);
    }, remainingMs);
  }, []);
  const navigateToCommunications = () => {
    beginCommunicationsTransition();
    setActiveTab('communications');
  };
  const onCommunicationsInitialLoadComplete = finishCommunicationsTransition;
  const onDashboardDataRequestSettled = useCallback(() => {
    if (!pendingDashboardStatsRef.current) finishCommunicationsTransition();
    pendingDashboardDataRef.current = false;
  }, [finishCommunicationsTransition]);

  // Hotkey global (Ctrl+K ou Cmd+K) para alternar o Assistente Flash
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAssistantOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && !authModalOpen && !profileModalOpen && !assistantOpen) {
        const target = e.target as HTMLElement | null;
        if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false);
          return;
        }
        setActiveTab('home');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assistantOpen, authModalOpen, mobileSidebarOpen, profileModalOpen]);

  const handleNavigateToSettings = (subTab: SettingsSubTab = 'general') => {
    if (activeTab !== 'settings') {
      setPreviousTab(activeTab);
    }
    setSettingsSubTab(subTab);
    setActiveTab('settings');
  };

  const handleBackFromSettings = () => {
    setActiveTab(previousTab === 'settings' ? 'home' : previousTab);
  };

  const handleToggleSidebar = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setSidebarCollapsed((collapsed) => !collapsed);
    } else {
      setMobileSidebarOpen(true);
    }
  };

  const [stats, setStats] = useState<{
    totalProtheusPv: number;
    totalProtheusOp: number;
    totalProtheusProducts: number;
    totalProtheusBatches: number;
    totalProtheusStructures: number;
    totalProtheusRoutings: number;
    totalProtheusAppointments: number;
    latestProtheusImport: {
      batchCode: string;
      sourceType: string;
      entityType: string;
      recordsCount: number;
      status: string;
      createdAt: string | null;
    } | null;
    organization: { id: number; name: string; tradeName: string | null; plantCode: string | null; timezone: string } | null;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<string | null>(null);

  const [orders, setOrders] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [quality, setQuality] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [factoryProfile, setFactoryProfile] = useState<any>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    if (DEV_PREVIEW_AUTH) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      setStats({
        totalProtheusPv: 42,
        totalProtheusOp: 68,
        totalProtheusProducts: 126,
        totalProtheusBatches: 12,
        totalProtheusStructures: 84,
        totalProtheusRoutings: 57,
        totalProtheusAppointments: 214,
        latestProtheusImport: { batchCode: 'PREVIEW-LOCAL', sourceType: 'DEMONSTRAÇÃO', entityType: 'PRODUÇÃO', recordsCount: 214, status: 'PREVIEW', createdAt: new Date().toISOString() },
        organization: { id: 1, name: 'Flash Engenharia', tradeName: 'Flash Engenharia', plantCode: 'PLANTA DEMONSTRAÇÃO', timezone: 'America/Sao_Paulo' },
      });
      setStatsError(null);
      setStatsUpdatedAt(new Date().toISOString());
      setStatsLoading(false);
      return;
    }
    try {
      const data = await api.getStats();
      if (data) {
        setStats(data);
        setStatsError(null);
        setStatsUpdatedAt(new Date().toISOString());
        if (data.organization) setFactoryProfile(data.organization);
      }
    } catch (err: any) {
      console.error(err);
      setStatsError(err.message || 'Não foi possível atualizar os dados do espelho.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTabData = async (tab: ActiveTab) => {
    setLoading(true);
    try {
      if (tab === 'dashboard' || tab === 'home') {
        await loadStats();
      } else if (tab === 'production-orders') {
        const [ord, inv, lin] = await Promise.all([
          api.getProductionOrders(),
          api.getInventory(),
          api.getProductionLines(),
        ]);
        setOrders(ord);
        setInventory(inv);
        setLines(lin);
      } else if (tab === 'production-lines') {
        const res = await api.getProductionLines();
        setLines(res);
      } else if (tab === 'quality') {
        const [ins, ord] = await Promise.all([
          api.getQualityInspections(),
          api.getProductionOrders(),
        ]);
        setQuality(ins);
        setOrders(ord);
      } else if (tab === 'inventory') {
        const res = await api.getInventory();
        setInventory(res);
      } else if (tab === 'integrations') {
        const res = await api.getIntegrations();
        setIntegrations(res);
      } else if (tab === 'settings') {
        const org = await api.getOrg();
        setFactoryProfile(org);
        if (['ADMIN', 'SUPERVISOR', 'AUDITOR'].includes(currentUser?.role || '')) {
          const res = await api.getAuditLogs({ page: 1, pageSize: 25 });
          setAuditLogs(Array.isArray(res) ? res : res.items || []);
        }
        if (currentUser?.role === 'ADMIN') {
          const usr = await api.getUsers();
          setUsers(usr);
        }
        if (['ADMIN', 'SUPERVISOR'].includes(currentUser?.role || '')) {
          const [productionLines, configuredIntegrations] = await Promise.all([
            api.getProductionLines(),
            api.getIntegrations(),
          ]);
          setLines(productionLines);
          setIntegrations(configuredIntegrations);
        }
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribeFromLanguageChanges = subscribeToLanguageChange(() =>
      setLanguageRevision((revision) => revision + 1),
    );
    if (DEV_PREVIEW_AUTH) {
      api.setSession('dev-preview', DEV_PREVIEW_USER);
      return unsubscribeFromLanguageChanges;
    }
    if (api.isAuthenticated()) {
      api.me()
        .then((res) => {
          setCurrentUser(res.user);
          api.setSession(api.getToken()!, res.user);
        })
        .catch(() => {
          api.clearSession();
          setCurrentUser(null);
          setAuthModalOpen(true);
          api.getAuthSetupStatus().then((status) => {
            setSetupRequired(status.setupRequired);
            setBootstrapEnabled(status.bootstrapEnabled);
          }).catch((error) => setSetupStatusError(error.message || 'Não foi possível verificar a configuração de acesso.')).finally(() => setSetupStatusChecked(true));
        });
    } else {
      setAuthModalOpen(true);
      api.getAuthSetupStatus().then((status) => {
        setSetupRequired(status.setupRequired);
        setBootstrapEnabled(status.bootstrapEnabled);
      }).catch((error) => setSetupStatusError(error.message || 'Não foi possível verificar a configuração de acesso.')).finally(() => setSetupStatusChecked(true));
    }
    return unsubscribeFromLanguageChanges;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === 'occurrences') return;
    loadTabData(activeTab);
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!currentUser || !['dashboard', 'home'].includes(activeTab)) return;
    const interval = window.setInterval(() => void loadStats(), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [activeTab, currentUser, loadStats]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    api.clearSession();
    setCurrentUser(null);
    showToast('Sessão encerrada.');
  };

  if (!currentUser) {
    return <AuthPage
      key={languageRevision}
      setupRequired={setupRequired}
      bootstrapEnabled={bootstrapEnabled && setupStatusChecked}
      setupStatusChecked={setupStatusChecked}
      setupStatusError={setupStatusError}
      onSuccess={(user, msg) => {
        setCurrentUser(user);
        setSetupRequired(false);
        setAuthModalOpen(false);
        showToast(msg, 'success');
      }}
    />;
  }

  return (
    <div key={languageRevision} className="flex h-screen w-screen overflow-hidden bg-[#F1F4F7] font-sans text-[#263548] antialiased">
      {DEV_PREVIEW_AUTH && (
        <div className="fixed left-1/2 top-2 z-[60] -translate-x-1/2 rounded-full border border-amber-400/40 bg-slate-950/90 px-4 py-2 text-xs font-semibold text-amber-200 shadow-lg">
          Prévia local · dados demonstrativos · nenhuma alteração persistida
        </div>
      )}
      {message && (
        <div
          className={`fixed left-3 right-3 top-3 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-xl transition-all sm:left-auto sm:right-4 sm:top-4 sm:max-w-md ${
            message.type === 'success'
              ? 'bg-white border-emerald-300 text-emerald-800'
              : 'bg-white border-rose-300 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span className="min-w-0 break-words text-sm font-medium">{message.text}</span>
        </div>
      )}

      {activeTab === 'communications' ? (
        <CommunicationsView
          currentUser={currentUser}
          localPreview={DEV_PREVIEW_AUTH}
          onInitialLoadComplete={onCommunicationsInitialLoadComplete}
          onBack={async () => {
            beginCommunicationsTransition();
            pendingDashboardDataRef.current = true;
            pendingDashboardStatsRef.current = true;
            setActiveTab('dashboard');
            await loadStats();
            pendingDashboardStatsRef.current = false;
            if (!pendingDashboardDataRef.current) finishCommunicationsTransition();
          }}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenFeedback={(tab = 'submit') => setFeedbackDialog(tab)}
          onOpenSettings={() => {
            setAssistantOpen(false);
            handleNavigateToSettings('general');
          }}
          onLogout={handleLogout}
        />
      ) : activeTab === 'settings' ? (
        <SettingsView
          initialSubTab={settingsSubTab}
          onBack={handleBackFromSettings}
          stats={stats}
          factoryProfile={factoryProfile}
          users={users}
          currentUser={currentUser}
          auditLogs={auditLogs}
          lines={lines}
          integrations={integrations}
          onReloadLines={() => api.getProductionLines().then(setLines).catch((err) => showToast(err.message, 'error'))}
          onReloadIntegrations={() => api.getIntegrations().then(setIntegrations).catch((err) => showToast(err.message, 'error'))}
          onReloadAudit={() =>
            api
              .getAuditLogs({ page: 1, pageSize: 25 })
              .then((res) => setAuditLogs(Array.isArray(res) ? res : res.items || []))
              .catch((err) => showToast(err.message, 'error'))
          }
          onReloadFactory={() => {
            api.getOrg().then(setFactoryProfile);
            loadStats();
          }}
          onReloadUsers={() => {
            api.getUsers().then(setUsers);
            loadStats();
          }}
          onRefreshStats={loadStats}
          onSuccess={(msg) => showToast(msg, 'success')}
          onError={(msg) => showToast(msg, 'error')}
        />
      ) : (
        <div className="flex h-[100dvh] w-full min-w-0 overflow-hidden bg-[#F1F4F7]">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => tab === 'communications' ? navigateToCommunications() : setActiveTab(tab)}
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
            onOpenFeedback={(tab = 'submit') => setFeedbackDialog(tab)}
            onLogout={handleLogout}
            onOpenSettings={handleNavigateToSettings}
            collapsed={sidebarCollapsed && !mobileSidebarOpen}
            mobileOpen={mobileSidebarOpen}
            onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
            onCloseMobile={() => setMobileSidebarOpen(false)}
          />

          <main
            className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#F1F4F7]"
            style={{
              backgroundImage: "linear-gradient(rgba(241,244,247,0.91), rgba(241,244,247,0.91)), url('/assets/login-production.webp')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
            }}
          >
            <Header
              plantCode={factoryProfile?.plantCode}
              currentUser={currentUser}
              loading={loading || statsLoading}
              onRefresh={() => {
                if (activeTab === 'dashboard' || activeTab === 'home') void loadStats();
                else void loadTabData(activeTab);
              }}
              onOpenAuth={() => setAuthModalOpen(true)}
              onOpenAssistant={() => setAssistantOpen(true)}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={handleToggleSidebar}
            />

            <div className="min-w-0 flex-1 overflow-y-auto bg-transparent p-3 sm:p-4 lg:p-6">
              {activeTab === 'home' && <WelcomeView stats={stats} loading={statsLoading} error={statsError} onNavigate={(tab) => tab === 'communications' ? navigateToCommunications() : setActiveTab(tab)} onOpenConnectors={() => handleNavigateToSettings('connectors')} onRetry={() => void loadStats()} />}

              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  refreshing={statsLoading}
                  refreshError={statsError}
                  statsUpdatedAt={statsUpdatedAt}
                  onRefresh={() => void loadStats()}
                  onNavigate={(tab) => tab === 'communications' ? navigateToCommunications() : setActiveTab(tab)}
                  onNavigateToConnectors={() => handleNavigateToSettings('connectors')}
                  onDataRequestSettled={onDashboardDataRequestSettled}
                  localPreview={DEV_PREVIEW_AUTH}
                />
              )}

              {activeTab === 'traceability' && (
                <TraceabilityView
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                  initialNumeroOp={traceabilityOpRequest}
                  onManageOccurrences={(numeroOp) => {
                    setOccurrencesOpFilter(numeroOp);
                    setActiveTab('occurrences');
                  }}
                />
              )}

              {activeTab === 'occurrences' && (
                <OccurrencesView
                  initialNumeroOp={occurrencesOpFilter}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onOpenOp={(numeroOp) => {
                    setTraceabilityOpRequest(numeroOp);
                    setActiveTab('traceability');
                  }}
                />
              )}

              {activeTab === 'production-orders' && (
                <ProductionOrdersView
                  orders={orders}
                  items={inventory}
                  lines={lines}
                  onReload={() => {
                    loadTabData('production-orders');
                    loadStats();
                  }}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                />
              )}

              {activeTab === 'production-lines' && (
                <ProductionLinesView
                  lines={lines}
                  onReload={() => {
                    loadTabData('production-lines');
                    loadStats();
                  }}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                />
              )}

              {activeTab === 'quality' && (
                <QualityView
                  inspections={quality}
                  orders={orders}
                  defaultInspector={currentUser?.name}
                  onReload={() => {
                    loadTabData('quality');
                    loadStats();
                  }}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryView
                  items={inventory}
                  onReload={() => {
                    loadTabData('inventory');
                    loadStats();
                  }}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                />
              )}

              {activeTab === 'integrations' && (
                <IntegrationsView
                  integrations={integrations}
                  onReload={() => {
                    loadTabData('integrations');
                    loadStats();
                  }}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
                />
              )}

            </div>
          </main>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        setupRequired={setupRequired}
        bootstrapEnabled={bootstrapEnabled}
        onClose={() => {
          if (currentUser) setAuthModalOpen(false);
        }}
        onSuccess={(usr, msg) => {
          setCurrentUser(usr);
          setSetupRequired(false);
          setAuthModalOpen(false);
          showToast(msg, 'success');
        }}
        onError={(err) => showToast(err, 'error')}
      />
      {currentUser && (
        <FlashAssistantWidget
          currentUser={currentUser}
          isOpen={assistantOpen}
          onToggle={() => setAssistantOpen((prev) => !prev)}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenFeedback={(tab = 'submit') => setFeedbackDialog(tab)}
          onOpenSettings={() => {
            setAssistantOpen(false);
            handleNavigateToSettings('general');
          }}
          onLogout={handleLogout}
          showFloatingActions={activeTab !== 'communications'}
          onNavigate={(targetTab, options) => {
            if (targetTab === 'traceability') {
              if (options?.op) {
                setTraceabilityOpRequest(options.op);
              }
              setActiveTab('traceability');
            } else if (targetTab === 'occurrences') {
              if (options?.op) {
                setOccurrencesOpFilter(options.op);
              }
              setActiveTab('occurrences');
            } else if (targetTab === 'settings') {
              setAssistantOpen(false);
              handleNavigateToSettings((options?.subTab as SettingsSubTab) || 'general');
            } else if (targetTab === 'communications') {
              navigateToCommunications();
            } else if (
              [
                'dashboard',
                'production-orders',
                'production-lines',
                'quality',
                'inventory',
                'integrations',
              ].includes(targetTab)
            ) {
              setActiveTab(targetTab as ActiveTab);
            }
          }}
        />
      )}
      {communicationsTransitionLoading && (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-[#0C1118]/[0.97] px-4 py-8 text-white backdrop-blur-xl transition-opacity duration-300 ease-out ${communicationsTransitionFading ? 'opacity-0' : 'opacity-100'}`} role="status" aria-live="polite" aria-label={activeTab === 'communications' ? 'Carregando Central de Comunicações' : 'Retornando ao Sistema'}>
          <div className="flex w-full max-w-xl flex-col items-center justify-center text-center">
            <div className="relative mb-6 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="44" className="stroke-white/10" strokeWidth="3" fill="none" />
                <motion.circle
                  cx="50" cy="50" r="44" stroke="url(#transition-gold-gradient)" strokeWidth="3.5" strokeLinecap="round" fill="none" strokeDasharray="74 202"
                  animate={{ strokeDashoffset: [0, -276] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(255,170,0,.45))' }}
                />
                <defs><linearGradient id="transition-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFAA00"/><stop offset="100%" stopColor="#FFD15C"/></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#FFAA00] opacity-70 [animation-duration:1.8s]" />
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[#161E28] shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:h-24 sm:w-24">
                {activeTab === 'communications' ? (
                  <svg className="h-9 w-9 text-[#FFAA00] drop-shadow-[0_0_6px_rgba(255,170,0,0.35)] sm:h-11 sm:w-11" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 36l-4 4V12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H12z" />
                    <circle cx="18" cy="21" r="1.6" fill="currentColor" stroke="none"/><circle cx="24" cy="21" r="1.6" fill="currentColor" stroke="none"/><circle cx="30" cy="21" r="1.6" fill="currentColor" stroke="none"/>
                  </svg>
                ) : <img src="/assets/flash-symbol.png" alt="Flash" className="h-9 w-9 object-contain drop-shadow-[0_0_8px_rgba(255,170,0,0.5)] sm:h-11 sm:w-11" />}
              </div>
            </div>
            <h2 className="text-xl font-medium tracking-tight text-white sm:text-2xl">
              {activeTab === 'communications' ? <>Carregando <span className="font-bold text-[#FFAA00]">Central de Comunicações</span></> : <>Retornando ao <span className="font-bold text-[#FFAA00]">Sistema</span></>}
            </h2>
            <p className="mt-2 text-xs text-slate-300 sm:text-sm">
              {activeTab === 'communications' ? 'Inicializando conversas, grupos e participantes...' : 'Sincronizando painel, OPs e chão de fábrica...'}
            </p>
            <div className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-white/10 sm:w-80">
              <motion.div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#FFAA00] via-[#FFB82E] to-[#FFAA00] shadow-[0_0_12px_rgba(255,170,0,0.6)]" animate={{ x: ['-110%', '250%'] }} transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
          </div>
        </div>
      )}
      <UserProfileModal isOpen={profileModalOpen} user={currentUser} onClose={() => setProfileModalOpen(false)} />
      {currentUser && feedbackDialog && <FeedbackDialog user={currentUser} localPreview={DEV_PREVIEW_AUTH} initialTab={feedbackDialog} onClose={() => setFeedbackDialog(null)} onToast={showToast} />}
    </div>
  );
}

