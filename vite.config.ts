import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    plugins: [react({ jsxImportSource: '@i18n' }), tailwindcss()],
    resolve: {
      alias: {
        '@i18n': path.resolve(__dirname, 'src/client/i18n'),
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio preview environment
      hmr: false,
      watch: null,
    },
  };
});
