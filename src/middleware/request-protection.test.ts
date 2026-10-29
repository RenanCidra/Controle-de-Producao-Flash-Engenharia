import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowBodyFields,
  apiRateLimit,
  loginRateLimit,
  validateRequestBody,
} from './request-protection.ts';
import { validatePassword } from '../modules/auth/credentials.ts';

function request(ip: string, body: unknown = {}) {
  return { ip, socket: { remoteAddress: ip }, body } as any;
}

function response() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  return res;
}

test('body validator accepts a bounded object', () => {
  const req = request('127.0.0.1', { name: 'Ordem 123', details: { priority: 'HIGH' } });
  const res = response();
  let continued = false;
  validateRequestBody(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(res.statusCode, 200);
});

test('body validator rejects prototype-pollution keys and oversized fields', () => {
  for (const body of [JSON.parse('{"constructor":{"prototype":{"isAdmin":true}}}'), { notes: 'x'.repeat(10_001) }]) {
    const req = request('127.0.0.1', body);
    const res = response();
    let continued = false;
    validateRequestBody(req, res, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 400);
  }
});

test('field allowlist rejects unexpected form properties', () => {
  const middleware = allowBodyFields('name', 'email');
  const res = response();
  let continued = false;
  middleware(request('127.0.0.1', { name: 'Operador', role: 'ADMIN' }), res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 400);
});

test('login limiter returns 429 and Retry-After after the per-IP threshold', () => {
  const uniqueIp = `test-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 20; i += 1) {
    const res = response();
    loginRateLimit(request(uniqueIp, { loginName: 'operador' }), res, () => {});
    assert.equal(res.statusCode, 200);
  }
  const blocked = response();
  loginRateLimit(request(uniqueIp, { loginName: 'operador' }), blocked, () => {});
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('general API limiter blocks excess requests from one IP', () => {
  const uniqueIp = `api-test-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 900; i += 1) apiRateLimit(request(uniqueIp), response(), () => {});
  const blocked = response();
  apiRateLimit(request(uniqueIp), blocked, () => {});
  assert.equal(blocked.statusCode, 429);
});

test('new passwords fit bcrypt byte limits while legacy login remains possible', () => {
  assert.doesNotThrow(() => validatePassword('Senha-forte-123'));
  assert.throws(() => validatePassword('curta'));
  assert.throws(() => validatePassword('á'.repeat(37))); // 74 UTF-8 bytes
});
