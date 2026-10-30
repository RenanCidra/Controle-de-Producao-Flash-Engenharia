import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './src/routes.ts';
import { apiRateLimit } from './src/middleware/request-protection.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const localPreviewAuth = process.env.DEV_PREVIEW_AUTH === 'true';
  if (localPreviewAuth && process.env.NODE_ENV === 'production') {
    throw new Error('DEV_PREVIEW_AUTH não pode ser habilitado em produção.');
  }
  const PORT = process.env.NODE_ENV === 'production' && process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : 3000;
  const frameAncestors = new Set(["'self'", 'https://aistudio.google.com']);
  for (const origin of (process.env.CSP_FRAME_ANCESTORS || '').split(/\s+/).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'https:' && parsed.origin === origin) frameAncestors.add(origin);
    } catch {
      // Ignore malformed values instead of weakening the frame policy.
    }
  }
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
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${[...frameAncestors].join(' ')}`,
      "form-action 'self'",
    ].join('; '));
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  // Apply the IP limit before JSON/form parsing to reduce unauthenticated resource pressure.
  app.use('/api', apiRateLimit);
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
        hmr: false,
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

  const bindAddress = localPreviewAuth ? '127.0.0.1' : '0.0.0.0';
  app.listen(PORT, bindAddress, () => {
    console.log(`🚀 NexusERP Fullstack Server running at http://${bindAddress}:${PORT}`);
    console.log(`📦 Database: PostgreSQL Cloud SQL connected`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

