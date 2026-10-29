import { AppLanguage, catalogs } from './catalog.ts';

const STORAGE_KEY = 'flash-app-language';
const LANGUAGE_EVENT = 'flash-app-language-change';
const GLOBAL_LANGUAGE_KEY = '__flashAppLanguage';

export function getAppLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'pt-BR';
  const globalLanguage = (window as any)[GLOBAL_LANGUAGE_KEY] as AppLanguage | undefined;
  if (globalLanguage) return globalLanguage;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  const language = saved === 'en-US' || saved === 'es-ES' ? saved : 'pt-BR';
  (window as any)[GLOBAL_LANGUAGE_KEY] = language;
  return language;
}

export function getIntlLocale(): string {
  return getAppLanguage();
}

export function setAppLanguage(language: AppLanguage): void {
  if (typeof window === 'undefined') return;
  (window as any)[GLOBAL_LANGUAGE_KEY] = language;
  window.localStorage.setItem(STORAGE_KEY, language);
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}

export function subscribeToLanguageChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(LANGUAGE_EVENT, listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      (window as any)[GLOBAL_LANGUAGE_KEY] = undefined;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function translateText(value: string): string {
  const language = getAppLanguage();
  if (language === 'pt-BR') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const translated = catalogs[language][trimmed] ?? trimmed;
  if (translated === trimmed) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function refreshLocalizedAttributes(): void {
  if (typeof document === 'undefined') return;
  const attributes = ['title', 'placeholder', 'aria-label', 'alt', 'label'] as const;
  document.querySelectorAll<HTMLElement>('[data-i18n-option], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-alt], [data-i18n-label]').forEach((element) => {
    const optionSource = element.getAttribute('data-i18n-option');
    if (optionSource !== null && element instanceof HTMLOptionElement) element.textContent = translateText(optionSource);
    for (const attribute of attributes) {
      const source = element.getAttribute(`data-i18n-${attribute}`);
      if (source !== null) element.setAttribute(attribute, translateText(source));
    }
  });
}

if (typeof window !== 'undefined') window.addEventListener(LANGUAGE_EVENT, refreshLocalizedAttributes);

export function confirmInCurrentLanguage(message: string): boolean {
  return typeof window !== 'undefined' && window.confirm(translateText(message));
}

const textAttributes = ['title', 'placeholder', 'aria-label', 'alt', 'label'] as const;

function localizeChild(child: unknown, createTextElement: (source: string) => unknown): unknown {
  if (typeof child === 'string') return createTextElement(child);
  if (Array.isArray(child)) return child.map((item) => localizeChild(item, createTextElement));
  return child;
}

export function localizeJsxProps<T extends Record<string, any> | null>(
  props: T,
  type: unknown,
  createTextElement: (source: string) => unknown,
): T {
  if (!props) return props;
  const localized = { ...props } as Record<string, any>;
  if ('children' in localized) {
    if (type === 'option' && typeof localized.children === 'string') {
      localized['data-i18n-option'] = localized.children;
      localized.children = translateText(localized.children);
    } else {
      localized.children = localizeChild(localized.children, createTextElement);
    }
  }
  for (const attribute of textAttributes) {
    if (typeof localized[attribute] === 'string') {
      localized[`data-i18n-${attribute}`] = localized[attribute];
      localized[attribute] = translateText(localized[attribute]);
    }
  }
  return localized as T;
}
