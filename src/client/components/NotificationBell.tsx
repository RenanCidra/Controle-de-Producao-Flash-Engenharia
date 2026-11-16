import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, BellRing, CheckCheck, Clock3, ExternalLink } from 'lucide-react';
import {
  api,
  type AppNotification,
  type AuthUser,
  type ShiftBacklogSummary,
} from '../api.ts';
import { getIntlLocale, translateText } from '../i18n/index.ts';
import {
  getBrowserNotificationPermission,
  getExistingPushSubscription,
  isPushSupported,
  subscribeBrowserPush,
} from '../modules/notifications/push-client.ts';

interface NotificationBellProps {
  currentUser: AuthUser | null;
  localPreview?: boolean;
  variant?: 'header' | 'rail';
  allowPushOptIn?: boolean;
  onOpenOccurrence: (occurrenceId: number) => void;
  onOpenOccurrencesList?: () => void;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return translateText('agora');
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString(getIntlLocale(), { day: '2-digit', month: '2-digit' });
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  currentUser,
  localPreview = false,
  variant = 'header',
  allowPushOptIn = false,
  onOpenOccurrence,
  onOpenOccurrencesList,
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shiftSummary, setShiftSummary] = useState<ShiftBacklogSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [vapidEnabled, setVapidEnabled] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const permissionState = getBrowserNotificationPermission();

  const loadInbox = useCallback(async () => {
    if (!currentUser || localPreview) return;
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount || 0));
      setShiftSummary(data.shiftSummary || null);
    } catch {
      // Preserve last loaded notifications cleanly.
    } finally {
      setLoading(false);
    }
  }, [currentUser, localPreview]);

  useEffect(() => {
    if (!currentUser || localPreview) return;
    void loadInbox();

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadInbox();
      }
    }, 20000);

    const onRefresh = () => { void loadInbox(); };
    window.addEventListener('nexus-notifications-refresh', onRefresh);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('nexus-notifications-refresh', onRefresh);
    };
  }, [currentUser, localPreview, loadInbox]);

  useEffect(() => {
    if (!open || !allowPushOptIn || localPreview || !currentUser) return;
    let active = true;
    void Promise.all([
      api.getVapidPublicKey().catch(() => ({ enabled: false, publicKey: null })),
      getExistingPushSubscription().catch(() => null),
    ]).then(([vapid, sub]) => {
      if (!active) return;
      setVapidEnabled(Boolean(vapid.enabled));
      setPushSubscribed(Boolean(sub));
    });
    return () => { active = false; };
  }, [open, allowPushOptIn, localPreview, currentUser]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!currentUser) return null;

  const handleOpenItem = async (item: AppNotification) => {
    if (!item.isRead && !localPreview) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      void api.markNotificationRead(item.id).catch(() => undefined);
    }
    setOpen(false);
    if (item.occurrenceId) {
      onOpenOccurrence(item.occurrenceId);
    } else {
      onOpenOccurrencesList?.();
    }
  };

  const handleMarkAllRead = async () => {
    if (localPreview || unreadCount === 0) return;
    setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
    setUnreadCount(0);
    await api.markAllNotificationsRead().catch(() => undefined);
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushFeedback(null);
    const result = await subscribeBrowserPush();
    setPushBusy(false);
    setPushFeedback(result.message);
    if (result.ok) setPushSubscribed(true);
  };

  const hasBreach = (shiftSummary?.slaBreached || 0) > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadInbox();
        }}
        aria-expanded={open}
        aria-label={translateText('Notificações e alertas')}
        title={translateText('Notificações e alertas')}
        className={
          variant === 'rail'
            ? `relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${open ? 'bg-[#263548] text-[#FFAA00]' : 'text-slate-300 hover:bg-[#263548] hover:text-white'}`
            : 'relative flex items-center justify-center rounded-md border border-[#DCE3EB] bg-white p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'
        }
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span
            className={`absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] shadow-xs ${
              hasBreach ? 'bg-rose-600 text-white' : 'bg-[#FFAA00] text-[#151C25]'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : hasBreach ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        ) : null}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={translateText('Central de notificações')}
          className={`z-50 w-[min(92vw,370px)] overflow-hidden rounded-xl border border-[#DCE3EB] bg-white text-[#263548] shadow-2xl ${
            variant === 'rail'
              ? 'fixed bottom-16 left-3 md:bottom-auto md:left-20 md:top-16'
              : 'absolute right-0 mt-2'
          }`}
        >
          <div className="flex items-center justify-between border-b border-[#DCE3EB] bg-[#F8FAFC] px-4 py-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#151C25]">
                {translateText('Notificações')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} ${translateText(unreadCount === 1 ? 'não lida' : 'não lidas')}`
                  : translateText('Tudo em dia')}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 rounded-md border border-[#DCE3EB] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>{translateText('Marcar lidas')}</span>
              </button>
            )}
          </div>

          {shiftSummary && (
            <div className="border-b border-[#DCE3EB] bg-[#FFFDF7] px-4 py-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-2 font-semibold text-[#263548]">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-[#D97706]" />
                  {translateText('Turno atual')}: {shiftSummary.totalOpen} {translateText('em aberto')}
                </span>
                {shiftSummary.slaBreached > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    <AlertTriangle className="h-3 w-3" />
                    {shiftSummary.slaBreached} SLA
                  </span>
                )}
              </div>
              {shiftSummary.bySector.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {shiftSummary.bySector.map((sec) => (
                    <span
                      key={sec.sector}
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                        sec.breached > 0
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : 'border-[#DCE3EB] bg-white text-slate-600'
                      }`}
                    >
                      {sec.sector}: {sec.open}{sec.breached > 0 ? ` (${sec.breached} SLA)` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {allowPushOptIn && isPushSupported() && vapidEnabled && !pushSubscribed && permissionState !== 'denied' && (
            <div className="border-b border-amber-200 bg-amber-50/70 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-amber-950">
                  {translateText('Receba alertas mesmo fora do aplicativo neste aparelho.')}
                </p>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void handleEnablePush()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#151C25] px-2.5 py-1 text-[11px] font-semibold text-[#FFAA00] hover:bg-slate-800 disabled:opacity-60"
                >
                  <BellRing className="h-3 w-3" />
                  <span>{translateText(pushBusy ? 'Ativando…' : 'Ativar push')}</span>
                </button>
              </div>
              {pushFeedback && <p className="mt-1 text-[10px] text-slate-600">{pushFeedback}</p>}
            </div>
          )}

          {pushFeedback && pushSubscribed && (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] text-emerald-800">
              {pushFeedback}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto divide-y divide-[#F1F4F7]">
            {loading && items.length === 0 ? (
              <p className="p-5 text-center text-xs text-slate-500">{translateText('Carregando notificações…')}</p>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-xs font-medium text-slate-600">{translateText('Nenhuma notificação recente.')}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {translateText('Alertas de novas ocorrências, atribuições e SLA aparecerão aqui.')}
                </p>
              </div>
            ) : (
              items.map((item) => {
                const isSla = item.type === 'OCCURRENCE_SLA_BREACH';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleOpenItem(item)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      !item.isRead ? 'bg-[#FFFDF5]' : 'bg-white'
                    }`}
                  >
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        item.isRead
                          ? 'bg-slate-200'
                          : isSla
                            ? 'bg-rose-600'
                            : 'bg-[#FFAA00]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-xs ${!item.isRead ? 'font-bold text-[#151C25]' : 'font-medium text-slate-700'}`}>
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                        {item.bodyPreview}
                      </p>
                    </div>
                    {item.occurrenceId && (
                      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
