import { createHmac, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;
const HASH_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');

function fingerprint(value: string): string {
  return createHmac('sha256', HASH_SECRET).update(value).digest('hex');
}

function checkLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= MAX_BUCKETS) {
      for (const [storedKey, storedBucket] of buckets) {
        if (storedBucket.resetAt <= now) buckets.delete(storedKey);
      }
      if (buckets.size >= MAX_BUCKETS) return { allowed: false, retryAfterSeconds: 60 };
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000);
cleanupTimer.unref?.();

function ipFingerprint(req: Request): string {
  return fingerprint(req.ip || req.socket.remoteAddress || 'unknown');
}

function rejectRateLimit(res: Response, retryAfterSeconds: number) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const result = checkLimit(`api:${ipFingerprint(req)}`, 900, 15 * 60_000);
  if (!result.allowed) return rejectRateLimit(res, result.retryAfterSeconds);
  return next();
}

export function mutationRateLimit(req: Request, res: Response, next: NextFunction) {
  const result = checkLimit(`mutation:${ipFingerprint(req)}`, 120, 15 * 60_000);
  if (!result.allowed) return rejectRateLimit(res, result.retryAfterSeconds);
  return next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = checkLimit(`login-ip:${ipFingerprint(req)}`, 20, 15 * 60_000);
  if (!ip.allowed) return rejectRateLimit(res, ip.retryAfterSeconds);

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const identifier = body.identifier ?? body.loginName ?? body.username ?? body.email;
  if (typeof identifier === 'string' && identifier.trim()) {
    const account = checkLimit(`login-account:${fingerprint(identifier.trim().toLowerCase())}`, 30, 15 * 60_000);
    if (!account.allowed) return rejectRateLimit(res, account.retryAfterSeconds);
  }
  return next();
}

export function bootstrapRateLimit(req: Request, res: Response, next: NextFunction) {
  const result = checkLimit(`bootstrap:${ipFingerprint(req)}`, 3, 30 * 60_000);
  if (!result.allowed) return rejectRateLimit(res, result.retryAfterSeconds);
  return next();
}

export function passwordChangeRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = checkLimit(`password-ip:${ipFingerprint(req)}`, 20, 60 * 60_000);
  if (!ip.allowed) return rejectRateLimit(res, ip.retryAfterSeconds);
  const userId = (req as Request & { user?: { uid?: string } }).user?.uid;
  if (userId) {
    const account = checkLimit(`password-account:${fingerprint(userId)}`, 5, 60 * 60_000);
    if (!account.allowed) return rejectRateLimit(res, account.retryAfterSeconds);
  }
  return next();
}

export function validateRequestBody(req: Request, res: Response, next: NextFunction) {
  const body = req.body;
  if (body === undefined || body === null) return next();
  if (typeof body !== 'object') return res.status(400).json({ error: 'Corpo da solicitação inválido.' });

  const stack: Array<{ value: unknown; depth: number }> = [{ value: body, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > 50_000 || current.depth > 12) {
      return res.status(400).json({ error: 'A solicitação excede os limites de estrutura permitidos.' });
    }
    if (typeof current.value === 'string' && current.value.length > 10_000) {
      return res.status(400).json({ error: 'Um campo de texto excede o limite permitido.' });
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > 20_000) return res.status(400).json({ error: 'A lista contém registros demais.' });
      for (const value of current.value) stack.push({ value, depth: current.depth + 1 });
      continue;
    }
    if (current.value && typeof current.value === 'object') {
      for (const [key, value] of Object.entries(current.value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          return res.status(400).json({ error: 'A solicitação contém um campo não permitido.' });
        }
        stack.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return next();
}

export function allowBodyFields(...allowedFields: string[]) {
  const allowed = new Set(allowedFields);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'O formulário enviado é inválido.' });
    }
    const unknownField = Object.keys(req.body).find((field) => !allowed.has(field));
    if (unknownField) return res.status(400).json({ error: 'O formulário contém um campo não permitido.' });
    return next();
  };
}

