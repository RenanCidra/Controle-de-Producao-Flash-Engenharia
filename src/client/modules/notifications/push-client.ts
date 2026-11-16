import { api } from '../../api.ts';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  return `${isMobile ? 'Celular' : 'Desktop'} (${browser})`;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeBrowserPush(): Promise<{
  ok: boolean;
  reason?: 'unsupported' | 'denied' | 'vapid_unconfigured' | 'error';
  message: string;
}> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'Este navegador não suporta notificações Push.' };
  }

  const vapidInfo = await api.getVapidPublicKey();
  if (!vapidInfo.enabled || !vapidInfo.publicKey) {
    return {
      ok: false,
      reason: 'vapid_unconfigured',
      message: 'Notificações Push ainda não foram configuradas no servidor (chaves VAPID ausentes).',
    };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Permissão de notificação recusada no navegador. Você ainda pode acompanhar os alertas pelo sino e painel.',
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidInfo.publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Dados de inscrição Web Push incompletos.');
    }

    await api.subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceLabel: detectDeviceLabel(),
    });

    return { ok: true, message: 'Notificações Push ativadas neste aparelho.' };
  } catch (err: any) {
    return {
      ok: false,
      reason: 'error',
      message: err?.message || 'Não foi possível ativar as notificações neste aparelho.',
    };
  }
}

export async function unsubscribeBrowserPush(): Promise<void> {
  const sub = await getExistingPushSubscription();
  const endpoint = sub?.endpoint || null;
  if (sub) {
    try {
      await sub.unsubscribe();
    } catch {
      // Continue clearing server subscription even if browser cleanup failed.
    }
  }
  await api.unsubscribePush(endpoint).catch(() => undefined);
}
