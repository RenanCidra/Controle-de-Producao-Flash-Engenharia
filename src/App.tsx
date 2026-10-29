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
import { AuditView } from './client/modules/audit/AuditView.tsx';
import { SettingsView, SettingsSubTab } from './client/modules/settings/SettingsView.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [previousTab, setPreviousTab] = useState<ActiveTab>('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('general');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(api.getUser());
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

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
      } else if (tab === 'audit') {
        const res = await api.getAuditLogs({ limit: 100 });
        setAuditLogs(res);
      } else if (tab === 'settings') {
        const [org, usr] = await Promise.all([
          api.getOrg(),
          api.getUsers(),
        ]);
        setFactoryProfile(org);
        setUsers(usr);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    if (api.isAuthenticated()) {
      api.me()
        .then((res) => {
          setCurrentUser(res.user);
          api.setSession(api.getToken()!, res.user);
        })
        .catch(() => {
          api.clearSession();
          setCurrentUser(null);
        });
    }
  }, []);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    api.clearSession();
    setCurrentUser(null);
    showToast('Sessão encerrada.');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F1F4F7] font-sans text-[#263548] antialiased">
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

              {activeTab === 'audit' && (
                <AuditView
                  logs={auditLogs}
                  onReload={() => loadTabData('audit')}
                />
              )}
            </div>
          </main>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(usr, msg) => {
          setCurrentUser(usr);
          showToast(msg, 'success');
          loadStats();
          loadTabData(activeTab);
        }}
        onError={(err) => showToast(err, 'error')}
      />
    </div>
  );
}
