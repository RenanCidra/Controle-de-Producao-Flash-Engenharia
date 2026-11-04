import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { api } from './client/api.ts';
import { applyThemePreference, readUserPreferences } from './client/modules/auth/user-preferences.ts';

const initialUser = api.getUser();
if (initialUser) applyThemePreference(readUserPreferences(initialUser.uid).theme);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((error) => {
      console.warn('Não foi possível ativar o cache offline de imagens.', error);
    });
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(<App />);
