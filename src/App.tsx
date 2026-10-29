import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api, AuthUser } from './client/api.ts';
import { Sidebar, ActiveTab } from './client/components/Sidebar.tsx';
import { Header } from './client/components/Header.tsx';
import { AuthModal } from './client/modules/auth/AuthModal.tsx';
import { DashboardView } from './client/modules/dashboard/DashboardView.tsx';
import { TraceabilityView } from './client/modules/traceability/TraceabilityView.tsx';
import { ProductionOrdersView } from './client/modules/production-orders/ProductionOrdersView.tsx';
import { ProductionLinesView } from './client/modules/production-lines/ProductionLinesView.tsx';
import { QualityView } from './client/modules/quality/QualityView.tsx';
import { InventoryView } from './client/modules/inventory/InventoryView.tsx';
import { IntegrationsView } from './client/modules/integrations/IntegrationsView.tsx';
import { SettingsView, SettingsSubTab } from './client/modules/settings/SettingsView.tsx';
import { subscribeToLanguageChange } from './client/i18n/index.ts';
import { AuthPage } from './client/modules/auth/AuthPage.tsx';

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
    if (typeof window === 'undefined') return 'dashboard';
    const reopenSettings = window.sessionStorage.getItem('flash-reopen-settings-after-language-change') === 'true';
    window.sessionStorage.removeItem('flash-reopen-settings-after-language-change');
    return reopenSettings ? 'settings' : 'dashboard';
  });
  const [previousTab, setPreviousTab] = useState<ActiveTab>('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('general');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(DEV_PREVIEW_AUTH ? DEV_PREVIEW_USER : null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [setupStatusChecked, setSetupStatusChecked] = useState(false);
  const [setupStatusError, setSetupStatusError] = useState('');
  const [languageRevision, setLanguageRevision] = useState(0);

  const handleNavigateToSettings = (subTab: SettingsSubTab = 'general') => {
    if (activeTab !== 'settings') {
      setPreviousTab(activeTab);
    }
    setSettingsSubTab(subTab);
    setActiveTab('settings');
  };

  const handleBackFromSettings = () => {
    setActiveTab(previousTab === 'settings' ? 'dashboard' : previousTab);
  };

  const [stats, setStats] = useState<{
    totalUsers: number;
    totalInventoryItems: number;
    totalProductionLines: number;
    totalProductionOrders: number;
    totalQualityInspections: number;
    totalIntegrations: number;
    totalAuditLogs: number;
    totalProtheusPv: number;
    totalProtheusOp: number;
    totalProtheusProducts: number;
    totalProtheusBatches: number;
    organization: any;
  } | null>(null);

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

  const loadStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data);
      if (data.organization) setFactoryProfile(data.organization);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadTabData = async (tab: ActiveTab) => {
    setLoading(true);
    try {
      if (tab === 'dashboard') {
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
        const [org, usr, logs] = await Promise.all([
          api.getOrg(),
          api.getUsers(),
          api.getAuditLogs({ limit: 100 }),
        ]);
        setFactoryProfile(org);
        setUsers(usr);
        setAuditLogs(logs);
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
    loadStats();
    loadTabData(activeTab);
  }, [activeTab, currentUser]);

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
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-xl transition-all border ${
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
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {activeTab === 'settings' ? (
        <SettingsView
          initialSubTab={settingsSubTab}
          onBack={handleBackFromSettings}
          stats={stats}
          factoryProfile={factoryProfile}
          users={users}
          currentUser={currentUser}
          auditLogs={auditLogs}
          onReloadAudit={() =>
            api.getAuditLogs({ limit: 100 }).then(setAuditLogs).catch((err) => showToast(err.message, 'error'))
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
        <div className="flex h-screen w-screen overflow-hidden bg-[#F1F4F7]">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
            onLogout={handleLogout}
            onOpenSettings={handleNavigateToSettings}
            stats={stats}
          />

          <main className="flex-1 flex flex-col overflow-hidden bg-[#F1F4F7]">
            <Header
              activeTab={activeTab}
              plantCode={factoryProfile?.plantCode}
              currentUser={currentUser}
              loading={loading}
              onRefresh={() => {
                loadStats();
                loadTabData(activeTab);
              }}
              onOpenAuth={() => setAuthModalOpen(true)}
              onOpenSettings={handleNavigateToSettings}
            />

            <div className="flex-1 overflow-y-auto p-6 bg-[#F1F4F7]">
              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  onNavigate={(tab, subTab) => {
                    if (tab === 'settings') {
                      handleNavigateToSettings(subTab || 'data-sync');
                    } else {
                      setActiveTab(tab);
                    }
                  }}
                />
              )}

              {activeTab === 'traceability' && (
                <TraceabilityView
                  onNavigateToSync={() => handleNavigateToSettings('data-sync')}
                  onSuccess={(msg) => showToast(msg, 'success')}
                  onError={(msg) => showToast(msg, 'error')}
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
    </div>
  );
}
