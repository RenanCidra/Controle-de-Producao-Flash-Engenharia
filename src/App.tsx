import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { api, AuthUser, type FeedbackCategory } from './client/api.ts';
import { Sidebar, ActiveTab } from './client/components/Sidebar.tsx';
import { Header } from './client/components/Header.tsx';
import { AuthModal } from './client/modules/auth/AuthModal.tsx';
import type { SettingsSubTab } from './client/modules/settings/SettingsView.tsx';
import { subscribeToLanguageChange, translateText } from './client/i18n/index.ts';
import { AuthPage } from './client/modules/auth/AuthPage.tsx';
import { UserProfileModal } from './client/modules/auth/UserProfileModal.tsx';
import { FlashAssistantWidget } from './client/components/FlashAssistantWidget.tsx';
import { WelcomeView } from './client/modules/home/WelcomeView.tsx';
import { FeedbackDialog } from './client/modules/feedback/FeedbackDialog.tsx';
import { HelpInfoDialog, type HelpInfoMode } from './client/components/HelpInfoDialog.tsx';
import { LogoutConfirmDialog } from './client/components/LogoutConfirmDialog.tsx';
import { LoadingState } from './client/components/DataStatus.tsx';
import { ModuleErrorBoundary } from './client/components/ModuleErrorBoundary.tsx';
import { applyThemePreference, readUserPreferences, subscribeToUserPreferences } from './client/modules/auth/user-preferences.ts';

const DashboardView = lazy(() => import('./client/modules/dashboard/DashboardView.tsx').then(module => ({ default: module.DashboardView })));
const TraceabilityView = lazy(() => import('./client/modules/traceability/TraceabilityView.tsx').then(module => ({ default: module.TraceabilityView })));
const OccurrencesView = lazy(() => import('./client/modules/occurrences/OccurrencesView.tsx').then(module => ({ default: module.OccurrencesView })));
const ProductionOrdersView = lazy(() => import('./client/modules/production-orders/ProductionOrdersView.tsx').then(module => ({ default: module.ProductionOrdersView })));
const ProductionLinesView = lazy(() => import('./client/modules/production-lines/ProductionLinesView.tsx').then(module => ({ default: module.ProductionLinesView })));
const QualityView = lazy(() => import('./client/modules/quality/QualityView.tsx').then(module => ({ default: module.QualityView })));
const InventoryView = lazy(() => import('./client/modules/inventory/InventoryView.tsx').then(module => ({ default: module.InventoryView })));
const IntegrationsView = lazy(() => import('./client/modules/integrations/IntegrationsView.tsx').then(module => ({ default: module.IntegrationsView })));
const SettingsView = lazy(() => import('./client/modules/settings/SettingsView.tsx').then(module => ({ default: module.SettingsView })));
const CommunicationsView = lazy(() => import('./client/modules/communications/CommunicationsView.tsx').then(module => ({ default: module.CommunicationsView })));

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
  const shouldReduceMotion = useReducedMotion() ?? false;
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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<'submit' | 'inbox' | null>(null);
  const [feedbackInitialCategory, setFeedbackInitialCategory] = useState<FeedbackCategory>('IDEA');
  const [helpInfoDialog, setHelpInfoDialog] = useState<HelpInfoMode | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [setupStatusChecked, setSetupStatusChecked] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState('');
  const [languageRevision, setLanguageRevision] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [communicationsTransitionLoading, setCommunicationsTransitionLoading] = useState(false);
  const [communicationsTransitionFading, setCommunicationsTransitionFading] = useState(false);
  const [systemEntryTransitionLoading, setSystemEntryTransitionLoading] = useState(false);
  const [systemEntryTransitionFading, setSystemEntryTransitionFading] = useState(false);
  const systemEntryStartedAtRef = useRef(0);
  const systemEntryTimerRef = useRef<number | null>(null);
  const transitionStartedAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const pendingDashboardDataRef = useRef(false);
  const pendingDashboardStatsRef = useRef(false);

  useEffect(() => {
    if (!currentUser) {
      applyThemePreference('mixed');
      return;
    }
    let stopSystemSync: () => void = () => {};
    const syncTheme = () => {
      stopSystemSync();
      stopSystemSync = applyThemePreference(readUserPreferences(currentUser.uid).theme);
    };
    syncTheme();
    const unsubscribe = subscribeToUserPreferences(syncTheme);
    return () => {
      unsubscribe();
      stopSystemSync();
    };
  }, [currentUser?.uid]);
  const beginSystemEntryTransition = () => {
    if (systemEntryTimerRef.current !== null) window.clearTimeout(systemEntryTimerRef.current);
    systemEntryStartedAtRef.current = Date.now();
    setSystemEntryTransitionFading(false);
    setSystemEntryTransitionLoading(true);
    const minimumVisibleMs = shouldReduceMotion ? 420 : 1150;
    systemEntryTimerRef.current = window.setTimeout(() => {
      setSystemEntryTransitionFading(true);
      systemEntryTimerRef.current = window.setTimeout(() => {
        setSystemEntryTransitionLoading(false);
        systemEntryTimerRef.current = null;
      }, 360);
    }, Math.max(0, minimumVisibleMs - (Date.now() - systemEntryStartedAtRef.current)));
  };
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
      const target = e.target as HTMLElement | null;
      const editingText = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === '?') && currentUser && !editingText) {
        e.preventDefault();
        setHelpInfoDialog((open) => open === 'shortcuts' ? null : 'shortcuts');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !editingText) {
        e.preventDefault();
        setAssistantOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && helpInfoDialog) {
        setHelpInfoDialog(null);
        return;
      }
      if (e.key === 'Escape' && feedbackDialog) {
        setFeedbackDialog(null);
        return;
      }
      if (e.key === 'Escape' && profileModalOpen) {
        setProfileModalOpen(false);
        return;
      }
      if (e.key === 'Escape' && authModalOpen && currentUser) {
        setAuthModalOpen(false);
        return;
      }
      if (e.key === 'Escape' && !authModalOpen && !profileModalOpen && !assistantOpen) {
        if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
        if (target?.closest('[data-user-account-menu], [data-user-account-menu-popover], [role="dialog"]')) return;
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false);
          return;
        }
        setActiveTab('home');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assistantOpen, authModalOpen, currentUser, feedbackDialog, helpInfoDialog, mobileSidebarOpen, profileModalOpen]);

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

  const openFeedbackDialog = (tab: 'submit' | 'inbox' = 'submit', category: FeedbackCategory = 'IDEA') => {
    setFeedbackInitialCategory(category);
    setFeedbackDialog(tab);
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

  useEffect(() => () => {
    if (systemEntryTimerRef.current !== null) window.clearTimeout(systemEntryTimerRef.current);
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

  const handleLogout = () => setLogoutConfirmOpen(true);

  const confirmLogout = async () => {
    if (logoutSubmitting) return;
    setLogoutSubmitting(true);
    try {
      await api.logout();
    } catch {}
    api.clearSession();
    setCurrentUser(null);
    setLogoutConfirmOpen(false);
    setLogoutSubmitting(false);
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
        beginSystemEntryTransition();
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
          {translateText('Prévia local · usuário ADMIN simulado · conexão do banco e Protheus verificada separadamente · alterações bloqueadas')}
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
        <ModuleErrorBoundary key={activeTab} onReturn={() => setActiveTab('home')}><Suspense fallback={<div className="flex h-[100dvh] items-center justify-center bg-[#151C25]"><LoadingState compact label="Abrindo Central de Comunicação…"/></div>}><CommunicationsView
          currentUser={currentUser}
          localPreview={DEV_PREVIEW_AUTH}
          onAskAssistant={(prompt) => { setAssistantPrompt(prompt); setAssistantOpen(true); }}
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
          onOpenFeedback={openFeedbackDialog}
          onOpenHelpInfo={setHelpInfoDialog}
          onOpenShortcuts={() => setHelpInfoDialog('shortcuts')}
          onOpenSettings={() => {
            setAssistantOpen(false);
            handleNavigateToSettings('general');
          }}
          onLogout={handleLogout}
        /></Suspense></ModuleErrorBoundary>
      ) : activeTab === 'settings' ? (
        <ModuleErrorBoundary key={activeTab} onReturn={handleBackFromSettings}><Suspense fallback={<div className="flex h-[100dvh] items-center justify-center bg-[#F1F4F7]"><LoadingState label="Abrindo configurações…"/></div>}><SettingsView
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
        /></Suspense></ModuleErrorBoundary>
      ) : (
        <div className="flex h-[100dvh] w-full min-w-0 overflow-hidden bg-[#F1F4F7]">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => tab === 'communications' ? navigateToCommunications() : setActiveTab(tab)}
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
            onOpenFeedback={openFeedbackDialog}
            onOpenHelpInfo={setHelpInfoDialog}
            onOpenShortcuts={() => setHelpInfoDialog('shortcuts')}
            onLogout={handleLogout}
            onOpenSettings={handleNavigateToSettings}
            collapsed={sidebarCollapsed && !mobileSidebarOpen}
            mobileOpen={mobileSidebarOpen}
            onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
            onCloseMobile={() => setMobileSidebarOpen(false)}
          />

          <main
            data-theme-wallpaper="app"
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
              <ModuleErrorBoundary key={activeTab} onReturn={() => setActiveTab('home')}><Suspense fallback={<LoadingState label="Abrindo módulo…"/>}>
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
              </Suspense></ModuleErrorBoundary>
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
          beginSystemEntryTransition();
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
          initialPrompt={assistantPrompt}
          onInitialPromptHandled={() => setAssistantPrompt('')}
          onToggle={() => setAssistantOpen((prev) => !prev)}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenFeedback={openFeedbackDialog}
          onOpenHelpInfo={setHelpInfoDialog}
          onOpenShortcuts={() => setHelpInfoDialog('shortcuts')}
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
        <div data-theme-loading="transition" className={`fixed inset-0 z-[70] flex items-center justify-center bg-[#0C1118] px-4 py-8 text-white transition-opacity duration-300 ease-out ${communicationsTransitionFading ? 'opacity-0' : 'opacity-100'}`} role="status" aria-live="polite" aria-label={activeTab === 'communications' ? 'Carregando Central de Comunicações' : 'Retornando ao Sistema'}>
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
              <div data-loading-indicator-disc className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[#161E28] shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:h-24 sm:w-24">
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
            <div data-loading-track className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-white/10 sm:w-80">
              <motion.div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#FFAA00] via-[#FFB82E] to-[#FFAA00] shadow-[0_0_12px_rgba(255,170,0,0.6)]" animate={{ x: ['-110%', '250%'] }} transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
          </div>
        </div>
      )}
      {systemEntryTransitionLoading && currentUser && (
        <div data-theme-loading="entry" className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#0C1118] px-4 py-8 text-white transition-opacity duration-[360ms] ease-out motion-reduce:transition-none ${systemEntryTransitionFading ? 'opacity-0' : 'opacity-100'}`} role="status" aria-live="polite" aria-label="Acesso confirmado. Preparando o sistema.">
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="relative mb-7 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="44" className="stroke-white/10" strokeWidth="3" fill="none" />
                <motion.circle cx="50" cy="50" r="44" stroke="url(#entry-gold-gradient)" strokeWidth="3.5" strokeLinecap="round" fill="none" strokeDasharray="74 202" animate={{ strokeDashoffset: shouldReduceMotion ? 0 : [0, -276] }} transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: 'linear' }} style={{ filter: 'drop-shadow(0 0 8px rgba(255,170,0,.45))' }} />
                <defs><linearGradient id="entry-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFAA00"/><stop offset="100%" stopColor="#FFD15C"/></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFAA00] opacity-70 [animation-duration:1.8s] motion-safe:animate-spin" />
              <motion.div data-loading-indicator-disc initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85 }} animate={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1, 1.035, 1] }} transition={shouldReduceMotion ? { duration: 0 } : { opacity: { delay: 0.12, duration: 0.35 }, scale: { delay: 0.35, duration: 2.2, repeat: Infinity, ease: 'easeInOut' } }} className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[#161E28] shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:h-24 sm:w-24">
                <img src="/assets/flash-symbol.png" alt="Flash" className="h-9 w-9 object-contain drop-shadow-[0_0_8px_rgba(255,170,0,0.5)] sm:h-11 sm:w-11" />
              </motion.div>
            </motion.div>
            <motion.p initial={shouldReduceMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.18, duration: 0.4 }} className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFAA00]">Acesso confirmado</motion.p>
            <motion.h2 initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.28, duration: 0.4 }} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Bem-vindo, <span className="text-[#FFAA00]">{currentUser.name}</span></motion.h2>
            <motion.p initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.42, duration: 0.45 }} className="mt-2 text-sm text-slate-300">Preparando seu ambiente de produção…</motion.p>
            <div data-loading-track className="mt-7 h-1.5 w-56 overflow-hidden rounded-full bg-white/10 sm:w-72"><motion.div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#FFAA00] via-[#FFD15C] to-[#FFAA00] shadow-[0_0_12px_rgba(255,170,0,0.55)]" animate={shouldReduceMotion ? { x: 0 } : { x: ['-110%', '250%'] }} transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.25, repeat: Infinity, ease: 'easeInOut' }} /></div>
          </div>
        </div>
      )}
      <UserProfileModal isOpen={profileModalOpen} user={currentUser} onClose={() => setProfileModalOpen(false)} />
      <LogoutConfirmDialog isOpen={logoutConfirmOpen} userName={currentUser?.name} busy={logoutSubmitting} onCancel={() => setLogoutConfirmOpen(false)} onConfirm={() => void confirmLogout()} />
      {currentUser && feedbackDialog && <FeedbackDialog key={`${feedbackDialog}:${feedbackInitialCategory}`} user={currentUser} localPreview={DEV_PREVIEW_AUTH} initialTab={feedbackDialog} initialCategory={feedbackInitialCategory} onClose={() => setFeedbackDialog(null)} onToast={showToast} />}
      {helpInfoDialog && <HelpInfoDialog mode={helpInfoDialog} onClose={() => setHelpInfoDialog(null)} />}
    </div>
  );
}

