import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateMirrorFreshness,
  mergeWeeklyTrends,
  normalizePriorityBuckets,
  normalizeSectorBuckets,
  normalizeTypeBuckets,
  resolveMirrorStaleThresholdMinutes,
  roundOneDecimal,
} from './occurrence-stats.ts';

test('resolveMirrorStaleThresholdMinutes clamps bounds and defaults to 60', () => {
  assert.equal(resolveMirrorStaleThresholdMinutes(undefined), 60);
  assert.equal(resolveMirrorStaleThresholdMinutes('invalid'), 60);
  assert.equal(resolveMirrorStaleThresholdMinutes('1'), 5);
  assert.equal(resolveMirrorStaleThresholdMinutes('180'), 180);
  assert.equal(resolveMirrorStaleThresholdMinutes('99999'), 10_080);
});

test('evaluateMirrorFreshness classifies EMPTY, FRESH, and STALE accurately', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');

  const empty = evaluateMirrorFreshness(null, now, 60);
  assert.equal(empty.status, 'EMPTY');
  assert.equal(empty.ageMinutes, null);

  const fresh = evaluateMirrorFreshness({
    batchCode: 'BATCH-1',
    sourceType: 'REST_API',
    entityType: 'SC2',
    recordsCount: 42,
    status: 'PROCESSED',
    createdAt: new Date('2026-11-16T11:30:00.000Z'),
  }, now, 60);
  assert.equal(fresh.status, 'FRESH');
  assert.equal(fresh.ageMinutes, 30);

  const stale = evaluateMirrorFreshness({
    batchCode: 'BATCH-2',
    sourceType: 'FILE_IMPORT',
    entityType: 'SC2',
    recordsCount: 15,
    status: 'PROCESSED',
    createdAt: new Date('2026-11-16T10:45:00.000Z'),
  }, now, 60);
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.ageMinutes, 75);
});

test('normalizeSectorBuckets preserves all 4 plant sectors with nulls when empty', () => {
  const result = normalizeSectorBuckets([
    { sector: 'ALMOX', open: 2, inProgress: 1, totalActive: 3, slaBreached: 1, avgAgeMinutes: 45.67 },
    { sector: 'PCP', open: 0, inProgress: 0, totalActive: 0, slaBreached: 0, avgAgeMinutes: 0 },
  ]);
  assert.equal(result.length, 4);
  assert.deepEqual(result[0], {
    sector: 'ALMOX',
    open: 2,
    inProgress: 1,
    totalActive: 3,
    slaBreached: 1,
    avgAgeMinutes: 45.7,
  });
  assert.equal(result[1].avgAgeMinutes, null);
  assert.equal(result[2].sector, 'PRODUCAO');
  assert.equal(result[3].sector, 'QUALIDADE');
});

test('normalizePriorityBuckets orders from CRITICA down to BAIXA', () => {
  const result = normalizePriorityBuckets([
    { priority: 'ALTA', totalActive: 4, slaBreached: 2 },
  ]);
  assert.deepEqual(result.map((item) => item.priority), ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA']);
  assert.equal(result[1].totalActive, 4);
  assert.equal(result[1].slaBreached, 2);
});

test('normalizeTypeBuckets sorts by total descending', () => {
  const result = normalizeTypeBuckets([
    { type: 'EMPENHO', total: 2, active: 1, resolved: 1 },
    { type: 'SEM_SALDO', total: 5, active: 3, resolved: 2 },
  ]);
  assert.equal(result[0].type, 'SEM_SALDO');
  assert.equal(result[1].type, 'EMPENHO');
  assert.equal(result.length, 6);
});

test('mergeWeeklyTrends merges opened and resolved counts chronologically', () => {
  const merged = mergeWeeklyTrends(
    [{ week: '2026-11-02', count: 4 }, { week: '2026-11-09', count: 2 }],
    [{ week: '2026-11-09', count: 3 }, { week: '2026-10-26', count: 1 }],
  );
  assert.deepEqual(merged, [
    { week: '2026-10-26', opened: 0, resolved: 1 },
    { week: '2026-11-02', opened: 4, resolved: 0 },
    { week: '2026-11-09', opened: 2, resolved: 3 },
  ]);
});

test('roundOneDecimal handles nullish and finite values cleanly', () => {
  assert.equal(roundOneDecimal(null), null);
  assert.equal(roundOneDecimal(Number.NaN), null);
  assert.equal(roundOneDecimal(12.349), 12.3);
});
