import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenericNotificationCopy,
  departmentMatchesSector,
  isWithinQuietHours,
  shouldNotifyUserForOccurrenceEvent,
  validatePushSubscriptionPayload,
} from './notification-rules.ts';

test('isWithinQuietHours handles overnight and daytime spans in America/Sao_Paulo', () => {
  // 2026-11-14T02:30:00Z = 23:30 in America/Sao_Paulo (-03:00)
  const lateNightSp = new Date('2026-11-14T02:30:00.000Z');
  // 2026-11-14T15:00:00Z = 12:00 in America/Sao_Paulo (-03:00)
  const noonSp = new Date('2026-11-14T15:00:00.000Z');

  assert.equal(isWithinQuietHours(lateNightSp, true, '22:00', '06:00', 'America/Sao_Paulo'), true);
  assert.equal(isWithinQuietHours(noonSp, true, '22:00', '06:00', 'America/Sao_Paulo'), false);
  assert.equal(isWithinQuietHours(noonSp, true, '11:30', '13:00', 'America/Sao_Paulo'), true);
  assert.equal(isWithinQuietHours(lateNightSp, false, '22:00', '06:00', 'America/Sao_Paulo'), false);
});

test('departmentMatchesSector aligns factory department names cleanly', () => {
  assert.equal(departmentMatchesSector('Almoxarifado', 'ALMOX'), true);
  assert.equal(departmentMatchesSector('Planejamento PCP', 'PCP'), true);
  assert.equal(departmentMatchesSector('Sinalização', 'PRODUCAO'), true);
  assert.equal(departmentMatchesSector('Qualidade', 'QUALIDADE'), true);
  assert.equal(departmentMatchesSector('Almoxarifado', 'QUALIDADE'), false);
});

test('shouldNotifyUserForOccurrenceEvent enforces scopes and escalation rules', () => {
  assert.equal(
    shouldNotifyUserForOccurrenceEvent({
      userId: 5,
      role: 'OPERATOR',
      department: 'Almoxarifado',
      scope: 'MINE',
      occurrenceSector: 'ALMOX',
      assigneeId: null,
      requesterId: 2,
      eventType: 'OCCURRENCE_CREATED',
      actorId: 2,
    }),
    false,
  );

  assert.equal(
    shouldNotifyUserForOccurrenceEvent({
      userId: 5,
      role: 'OPERATOR',
      department: 'Almoxarifado',
      scope: 'SECTOR',
      occurrenceSector: 'ALMOX',
      assigneeId: null,
      requesterId: 2,
      eventType: 'OCCURRENCE_CREATED',
      actorId: 2,
    }),
    true,
  );

  assert.equal(
    shouldNotifyUserForOccurrenceEvent({
      userId: 3,
      role: 'SUPERVISOR',
      department: 'Produção',
      scope: 'MINE',
      occurrenceSector: 'ALMOX',
      assigneeId: 7,
      requesterId: 2,
      eventType: 'OCCURRENCE_SLA_BREACH',
    }),
    true,
  );
});

test('buildGenericNotificationCopy never exposes OP, PV, balance, or component codes', () => {
  const copy = buildGenericNotificationCopy({
    eventType: 'OCCURRENCE_CREATED',
    sector: 'ALMOX',
    pendingCount: 2,
  });
  assert.equal(copy.bodyPreview, 'Você tem 2 ocorrências pendentes no setor ALMOX. Toque para ver.');
  assert.ok(!/062983|012841|11\.ETQ|-13/.test(copy.title + copy.bodyPreview));
});

test('validatePushSubscriptionPayload requires HTTPS endpoint and Web Push keys', () => {
  assert.equal(
    validatePushSubscriptionPayload({
      endpoint: 'http://insecure.example.com/push',
      keys: { p256dh: 'abc', auth: 'def' },
    }),
    null,
  );
  const valid = validatePushSubscriptionPayload({
    endpoint: 'https://fcm.googleapis.com/fcm/send/device-123',
    keys: { p256dh: 'key-1', auth: 'auth-1' },
    deviceLabel: 'Chrome Desktop',
  });
  assert.deepEqual(valid, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device-123',
    p256dh: 'key-1',
    auth: 'auth-1',
    deviceLabel: 'Chrome Desktop',
  });
});
