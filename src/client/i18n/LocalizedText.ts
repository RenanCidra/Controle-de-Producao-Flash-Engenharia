import { useSyncExternalStore } from 'react';
import { getAppLanguage, subscribeToLanguageChange, translateText } from './index.ts';

export function LocalizedText({ source }: { source: string }) {
  useSyncExternalStore(subscribeToLanguageChange, getAppLanguage, () => 'pt-BR');
  return translateText(source);
}
