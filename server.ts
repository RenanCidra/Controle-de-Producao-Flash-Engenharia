import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './src/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const trustedProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
  app.set('trust proxy', Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 ? trustedProxyHops : false);
  app.disable('x-powered-by');

  const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => {
      try { return new URL(origin).origin === origin; } catch { return false; }
    }));
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.use(express.json({ limit: '10mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));

  // Mount ERP API
  app.use('/api', apiRouter);

  // Frontend Integration (Vite Middleware in dev / Static files in prod)
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In development mode, dynamically mount Vite dev server as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Erro interno no servidor. Consulte os logs do sistema.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NexusERP Fullstack Server running at http://0.0.0.0:${PORT}`);
    console.log(`📦 Database: PostgreSQL Cloud SQL connected`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

