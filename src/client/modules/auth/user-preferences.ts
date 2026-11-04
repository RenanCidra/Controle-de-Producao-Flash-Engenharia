import { AppLanguage } from '../../i18n/catalog.ts';

export interface UserPreferences {
  avatarDataUrl: string | null;
  language: AppLanguage | null;
  theme: ThemePreference;
}

export type ThemePreference = 'mixed' | 'light' | 'dark' | 'system';

const EVENT_NAME = 'flash-user-preferences-change';
const PREFERENCES_VERSION = 2;
const storageKey = (uid: string) => `flash-user-preferences:${uid}`;
let stopSystemThemeSync: () => void = () => {};

export function readUserPreferences(uid?: string): UserPreferences {
  if (!uid || typeof window === 'undefined') return { avatarDataUrl: null, language: null, theme: 'mixed' };
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(uid)) || '{}');
    return {
      avatarDataUrl: typeof value.avatarDataUrl === 'string' ? value.avatarDataUrl : null,
      language: value.language === 'en-US' || value.language === 'es-ES' || value.language === 'pt-BR' ? value.language : null,
      theme: isThemePreference(value.theme) ? value.theme : 'mixed',
    };
  } catch {
    return { avatarDataUrl: null, language: null, theme: 'mixed' };
  }
}

export function saveUserPreferences(uid: string, preferences: Partial<UserPreferences>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = readUserPreferences(uid);
    window.localStorage.setItem(storageKey(uid), JSON.stringify({ version: PREFERENCES_VERSION, ...current, ...preferences }));
    window.dispatchEvent(new Event(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

export function subscribeToUserPreferences(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'mixed' || value === 'light' || value === 'dark' || value === 'system';
}

export function applyThemePreference(preference: ThemePreference): () => void {
  if (typeof window === 'undefined') return () => undefined;
  stopSystemThemeSync();
  stopSystemThemeSync = () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  };
  apply();
  if (preference !== 'system') return () => undefined;
  media.addEventListener('change', apply);
  const cleanup = () => media.removeEventListener('change', apply);
  stopSystemThemeSync = cleanup;
  return () => {
    if (stopSystemThemeSync === cleanup) {
      cleanup();
      stopSystemThemeSync = () => {};
    }
  };
}
