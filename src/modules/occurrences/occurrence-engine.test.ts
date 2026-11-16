import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSlaDueAt,
  extractOccurrenceFieldsFromText,
  getRoutingRule,
  normalizeOccurrenceStatus,
} from './occurrence-engine.ts';

test('getRoutingRule applies default MVP routing and SLA per occurrence type', () => {
  assert.deepEqual(getRoutingRule('SEM_SALDO'), {
    sector: 'ALMOX',
    secondarySector: 'PCP',
    slaMinutes: 120,
    priority: 'ALTA',
  });
  assert.deepEqual(getRoutingRule('EMPENHO'), {
    sector: 'PCP',
    secondarySector: null,
    slaMinutes: 120,
    priority: 'MEDIA',
  });
  assert.deepEqual(getRoutingRule('TRANSFERENCIA'), {
    sector: 'ALMOX',
    secondarySector: null,
    slaMinutes: 60,
    priority: 'ALTA',
  });
  assert.deepEqual(getRoutingRule('BLOQUEIO_OP'), {
    sector: 'PRODUCAO',
    secondarySector: 'SUPERVISOR',
    slaMinutes: 240,
    priority: 'CRITICA',
  });
  assert.deepEqual(getRoutingRule('QUALIDADE'), {
    sector: 'QUALIDADE',
    secondarySector: null,
    slaMinutes: 240,
    priority: 'ALTA',
  });
});

test('computeSlaDueAt adds exact slaMinutes to openedAt', () => {
  const openedAt = new Date('2026-11-13T10:00:00.000Z');
  const due = computeSlaDueAt(openedAt, 120);
  assert.equal(due.toISOString(), '2026-11-13T12:00:00.000Z');
});

test('normalizeOccurrenceStatus maps legacy and new statuses consistently', () => {
  assert.equal(normalizeOccurrenceStatus('OPEN'), 'ABERTA');
  assert.equal(normalizeOccurrenceStatus('IN_PROGRESS'), 'EM_ATENDIMENTO');
  assert.equal(normalizeOccurrenceStatus('CLOSED'), 'CONCLUIDA');
  assert.equal(normalizeOccurrenceStatus('AGUARDANDO'), 'AGUARDANDO');
  assert.equal(normalizeOccurrenceStatus('CANCELADA'), 'CANCELADA');
  assert.equal(normalizeOccurrenceStatus('INVALID'), null);
});

test('extractOccurrenceFieldsFromText parses factory floor message cleanly', () => {
  const msg = 'OP 06298301002 parada, PV 012841. Produto pai 41.SIR.CTRL.00002.00 sem saldo do componente 11.ETQ.DIVE.00005.00 no armazém 50, saldo -13.';
  const extracted = extractOccurrenceFieldsFromText(msg);
  assert.equal(extracted.type, 'SEM_SALDO');
  assert.equal(extracted.opNumber, '06298301002');
  assert.equal(extracted.pvNumber, '012841');
  assert.equal(extracted.parentProduct, '41.SIR.CTRL.00002.00');
  assert.equal(extracted.componentCode, '11.ETQ.DIVE.00005.00');
  assert.equal(extracted.warehouse, '50');
  assert.equal(extracted.currentBalance, '-13');
});

test('extractOccurrenceFieldsFromText leaves unrecognized fields null without inventing data', () => {
  const extracted = extractOccurrenceFieldsFromText('Linha parou por falta de instrução.');
  assert.equal(extracted.opNumber, null);
  assert.equal(extracted.pvNumber, null);
  assert.equal(extracted.componentCode, null);
  assert.equal(extracted.warehouse, null);
  assert.equal(extracted.currentBalance, null);
});
