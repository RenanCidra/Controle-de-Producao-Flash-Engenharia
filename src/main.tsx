import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((error) => {
      console.warn('Não foi possível ativar o cache offline de imagens.', error);
    });
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(<App />);
