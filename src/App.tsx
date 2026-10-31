import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
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

const DEV_PREVIEW_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW_AUTH === 'true';
const DEV_PREVIEW_USER: AuthUser = {
  id: 0,
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
  const [setupRequired, setSetupRequired] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [setupStatusChecked, setSetupStatusChecked] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState('');
  const [languageRevision, setLanguageRevision] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);

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
    try {
      const data = await api.getStats();
      setStats(data);
      setStatsError(null);
      setStatsUpdatedAt(new Date().toISOString());
      if (data.organization) setFactoryProfile(data.organization);
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
          Prévia local autenticada · conta ADMIN simulada · alterações bloqueadas
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
          onBack={() => setActiveTab('dashboard')}
          onOpenProfile={() => setProfileModalOpen(true)}
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
            setActiveTab={setActiveTab}
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
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
              {activeTab === 'home' && <WelcomeView stats={stats} loading={statsLoading} error={statsError} onNavigate={setActiveTab} onOpenConnectors={() => handleNavigateToSettings('connectors')} />}

              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  refreshing={statsLoading}
                  refreshError={statsError}
                  statsUpdatedAt={statsUpdatedAt}
                  onRefresh={() => void loadStats()}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onNavigateToConnectors={() => handleNavigateToSettings('connectors')}
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
              setActiveTab('communications');
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
      <UserProfileModal isOpen={profileModalOpen} user={currentUser} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
}

