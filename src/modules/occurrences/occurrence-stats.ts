import {
  OCCURRENCE_PRIORITIES,
  OCCURRENCE_SECTORS,
  OCCURRENCE_TYPES,
  type OccurrencePriority,
  type OccurrenceSector,
  type OccurrenceType,
} from './occurrence-engine.ts';

export type MirrorFreshnessStatus = 'FRESH' | 'STALE' | 'EMPTY';

export interface MirrorFreshnessSnapshot {
  status: MirrorFreshnessStatus;
  ageMinutes: number | null;
  staleThresholdMinutes: number;
  latestImportAt: string | null;
  latestBatchCode: string | null;
  latestEntityType: string | null;
  latestSourceType: string | null;
  latestRecordsCount: number | null;
}

export interface LatestBatchInput {
  batchCode: string;
  sourceType: string;
  entityType: string;
  recordsCount: number;
  status: string;
  createdAt: Date | string | null;
}

export interface OccurrenceAnalyticsSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  cancelled: number;
  activeBacklog: number;
  recurrenceCount: number;
  recurrenceRatePercent: number | null;
  slaBreachedActive: number;
  slaCompliancePercent: number | null;
}

export interface OccurrenceResponseMetrics {
  avgFirstResponseMinutes: number | null;
  medianFirstResponseMinutes: number | null;
  firstResponseSampleCount: number;
  avgMttrMinutes: number | null;
  medianMttrMinutes: number | null;
  mttrSampleCount: number;
}

export interface SectorBacklogItem {
  sector: OccurrenceSector;
  open: number;
  inProgress: number;
  totalActive: number;
  slaBreached: number;
  avgAgeMinutes: number | null;
}

export interface PriorityBacklogItem {
  priority: OccurrencePriority;
  totalActive: number;
  slaBreached: number;
}

export interface TypeBreakdownItem {
  type: OccurrenceType;
  total: number;
  active: number;
  resolved: number;
}

export interface TopComponentItem {
  componentCode: string;
  total: number;
  active: number;
  recurrences: number;
  impactedOps: number;
}

export interface TopPvItem {
  pvNumber: string;
  clienteNome: string | null;
  total: number;
  active: number;
  impactedOps: number;
}

export interface WeeklyOccurrenceTrendItem {
  week: string;
  opened: number;
  resolved: number;
}

export interface OccurrenceAnalyticsResponse {
  period: {
    from: string | null;
    to: string | null;
    sector: OccurrenceSector | null;
    type: OccurrenceType | null;
  };
  summary: OccurrenceAnalyticsSummary;
  responseMetrics: OccurrenceResponseMetrics;
  backlogBySector: SectorBacklogItem[];
  backlogByPriority: PriorityBacklogItem[];
  byType: TypeBreakdownItem[];
  topComponents: TopComponentItem[];
  topPvs: TopPvItem[];
  weeklyTrend: WeeklyOccurrenceTrendItem[];
  mirrorFreshness: MirrorFreshnessSnapshot;
}

export const DEFAULT_MIRROR_STALE_MINUTES = 60;

export function resolveMirrorStaleThresholdMinutes(raw?: string | null): number {
  if (!raw || !raw.trim()) return DEFAULT_MIRROR_STALE_MINUTES;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MIRROR_STALE_MINUTES;
  return Math.max(5, Math.min(10_080, parsed));
}

export function roundOneDecimal(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function evaluateMirrorFreshness(
  latestImport: LatestBatchInput | null | undefined,
  now = new Date(),
  staleThresholdMinutes = resolveMirrorStaleThresholdMinutes(process.env.PROTHEUS_STALE_ALERT_MINUTES),
): MirrorFreshnessSnapshot {
  if (!latestImport || !latestImport.createdAt) {
    return {
      status: 'EMPTY',
      ageMinutes: null,
      staleThresholdMinutes,
      latestImportAt: null,
      latestBatchCode: latestImport?.batchCode ?? null,
      latestEntityType: latestImport?.entityType ?? null,
      latestSourceType: latestImport?.sourceType ?? null,
      latestRecordsCount: latestImport ? Number(latestImport.recordsCount || 0) : null,
    };
  }

  const importedDate = latestImport.createdAt instanceof Date
    ? latestImport.createdAt
    : new Date(latestImport.createdAt);

  if (Number.isNaN(importedDate.getTime())) {
    return {
      status: 'EMPTY',
      ageMinutes: null,
      staleThresholdMinutes,
      latestImportAt: null,
      latestBatchCode: latestImport.batchCode,
      latestEntityType: latestImport.entityType,
      latestSourceType: latestImport.sourceType,
      latestRecordsCount: Number(latestImport.recordsCount || 0),
    };
  }

  const ageMinutes = Math.max(0, Math.round((now.getTime() - importedDate.getTime()) / 60_000));
  return {
    status: ageMinutes >= staleThresholdMinutes ? 'STALE' : 'FRESH',
    ageMinutes,
    staleThresholdMinutes,
    latestImportAt: importedDate.toISOString(),
    latestBatchCode: latestImport.batchCode,
    latestEntityType: latestImport.entityType,
    latestSourceType: latestImport.sourceType,
    latestRecordsCount: Number(latestImport.recordsCount || 0),
  };
}

export function normalizeSectorBuckets(
  rows: Array<{
    sector: string;
    open: number;
    inProgress: number;
    totalActive: number;
    slaBreached: number;
    avgAgeMinutes: number | null;
  }>,
): SectorBacklogItem[] {
  const bySector = new Map(rows.map((row) => [row.sector, row]));
  return OCCURRENCE_SECTORS.map((sector) => {
    const found = bySector.get(sector);
    return {
      sector,
      open: Number(found?.open || 0),
      inProgress: Number(found?.inProgress || 0),
      totalActive: Number(found?.totalActive || 0),
      slaBreached: Number(found?.slaBreached || 0),
      avgAgeMinutes: found && found.totalActive > 0 ? roundOneDecimal(found.avgAgeMinutes) : null,
    };
  });
}

export function normalizePriorityBuckets(
  rows: Array<{
    priority: string;
    totalActive: number;
    slaBreached: number;
  }>,
): PriorityBacklogItem[] {
  const byPriority = new Map(rows.map((row) => [row.priority, row]));
  const ordered: OccurrencePriority[] = [...OCCURRENCE_PRIORITIES].reverse();
  return ordered.map((priority) => {
    const found = byPriority.get(priority);
    return {
      priority,
      totalActive: Number(found?.totalActive || 0),
      slaBreached: Number(found?.slaBreached || 0),
    };
  });
}

export function normalizeTypeBuckets(
  rows: Array<{
    type: string;
    total: number;
    active: number;
    resolved: number;
  }>,
): TypeBreakdownItem[] {
  const byType = new Map(rows.map((row) => [row.type, row]));
  return OCCURRENCE_TYPES.map((type) => {
    const found = byType.get(type);
    return {
      type,
      total: Number(found?.total || 0),
      active: Number(found?.active || 0),
      resolved: Number(found?.resolved || 0),
    };
  }).sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));
}

export function mergeWeeklyTrends(
  openedRows: Array<{ week: string; count: number }>,
  resolvedRows: Array<{ week: string; count: number }>,
  maxWeeks = 10,
): WeeklyOccurrenceTrendItem[] {
  const merged = new Map<string, WeeklyOccurrenceTrendItem>();
  for (const row of openedRows) {
    if (!row.week) continue;
    merged.set(row.week, { week: row.week, opened: Number(row.count || 0), resolved: 0 });
  }
  for (const row of resolvedRows) {
    if (!row.week) continue;
    const existing = merged.get(row.week) || { week: row.week, opened: 0, resolved: 0 };
    existing.resolved = Number(row.count || 0);
    merged.set(row.week, existing);
  }
  return [...merged.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-maxWeeks);
}
