import { AppLanguage } from '../../i18n/catalog.ts';

export interface UserPreferences {
  avatarDataUrl: string | null;
  language: AppLanguage | null;
}

const EVENT_NAME = 'flash-user-preferences-change';
const storageKey = (uid: string) => `flash-user-preferences:${uid}`;

export function readUserPreferences(uid?: string): UserPreferences {
  if (!uid || typeof window === 'undefined') return { avatarDataUrl: null, language: null };
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(uid)) || '{}');
    return {
      avatarDataUrl: typeof value.avatarDataUrl === 'string' ? value.avatarDataUrl : null,
      language: value.language === 'en-US' || value.language === 'es-ES' || value.language === 'pt-BR' ? value.language : null,
    };
  } catch {
    return { avatarDataUrl: null, language: null };
  }
}

export function saveUserPreferences(uid: string, preferences: UserPreferences): void {
  window.localStorage.setItem(storageKey(uid), JSON.stringify(preferences));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeToUserPreferences(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
