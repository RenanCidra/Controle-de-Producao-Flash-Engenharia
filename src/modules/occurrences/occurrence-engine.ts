export const OCCURRENCE_TYPES = [
  'SEM_SALDO',
  'EMPENHO',
  'TRANSFERENCIA',
  'BLOQUEIO_OP',
  'QUALIDADE',
  'OUTRO',
] as const;

export type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];

export const OCCURRENCE_SECTORS = ['ALMOX', 'PCP', 'PRODUCAO', 'QUALIDADE'] as const;
export type OccurrenceSector = (typeof OCCURRENCE_SECTORS)[number];

export const OCCURRENCE_PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type OccurrencePriority = (typeof OCCURRENCE_PRIORITIES)[number];

export const OCCURRENCE_STATUSES = [
  'ABERTA',
  'EM_ATENDIMENTO',
  'AGUARDANDO',
  'CONCLUIDA',
  'CANCELADA',
] as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const ALL_ACCEPTED_STATUS_INPUTS = [
  ...OCCURRENCE_STATUSES,
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
] as const;

const LEGACY_STATUS_MAP: Record<string, OccurrenceStatus> = {
  OPEN: 'ABERTA',
  IN_PROGRESS: 'EM_ATENDIMENTO',
  CLOSED: 'CONCLUIDA',
};

export interface RoutingRule {
  sector: OccurrenceSector;
  secondarySector: string | null;
  slaMinutes: number;
  priority: OccurrencePriority;
}

const ROUTING_RULES: Record<OccurrenceType, RoutingRule> = {
  SEM_SALDO: { sector: 'ALMOX', secondarySector: 'PCP', slaMinutes: 120, priority: 'ALTA' },
  EMPENHO: { sector: 'PCP', secondarySector: null, slaMinutes: 120, priority: 'MEDIA' },
  TRANSFERENCIA: { sector: 'ALMOX', secondarySector: null, slaMinutes: 60, priority: 'ALTA' },
  BLOQUEIO_OP: { sector: 'PRODUCAO', secondarySector: 'SUPERVISOR', slaMinutes: 240, priority: 'CRITICA' },
  QUALIDADE: { sector: 'QUALIDADE', secondarySector: null, slaMinutes: 240, priority: 'ALTA' },
  OUTRO: { sector: 'PCP', secondarySector: null, slaMinutes: 120, priority: 'MEDIA' },
};

export const OCCURRENCE_TYPE_LABELS: Record<OccurrenceType, string> = {
  SEM_SALDO: 'Sem Saldo',
  EMPENHO: 'Empenho',
  TRANSFERENCIA: 'Transferência',
  BLOQUEIO_OP: 'Bloqueio de OP',
  QUALIDADE: 'Qualidade',
  OUTRO: 'Outro',
};

export function normalizeOccurrenceStatus(raw?: string | null): OccurrenceStatus | null {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  if ((OCCURRENCE_STATUSES as readonly string[]).includes(upper)) {
    return upper as OccurrenceStatus;
  }
  return LEGACY_STATUS_MAP[upper] || null;
}

export function isClosedOccurrenceStatus(status: string | null | undefined): boolean {
  const normalized = normalizeOccurrenceStatus(status);
  return normalized === 'CONCLUIDA' || normalized === 'CANCELADA';
}

export function normalizeOccurrenceType(raw?: string | null): OccurrenceType | null {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if ((OCCURRENCE_TYPES as readonly string[]).includes(upper)) {
    return upper as OccurrenceType;
  }
  if (/SEM[_\s]?SALDO|FALTA|NEGATIV/.test(upper)) return 'SEM_SALDO';
  if (/EMPENH/.test(upper)) return 'EMPENHO';
  if (/TRANSFER/.test(upper)) return 'TRANSFERENCIA';
  if (/BLOQUE|PARADA/.test(upper)) return 'BLOQUEIO_OP';
  if (/QUALID|REFUGO|DEFEIT/.test(upper)) return 'QUALIDADE';
  return null;
}

export function getRoutingRule(type: OccurrenceType): RoutingRule {
  return ROUTING_RULES[type] || ROUTING_RULES.OUTRO;
}

export function computeSlaDueAt(openedAt: Date, slaMinutes: number): Date {
  return new Date(openedAt.getTime() + Math.max(1, slaMinutes) * 60_000);
}

export interface ExtractedOccurrenceFields {
  type: OccurrenceType | null;
  opNumber: string | null;
  pvNumber: string | null;
  parentProduct: string | null;
  componentCode: string | null;
  warehouse: string | null;
  currentBalance: string | null;
}

export function extractOccurrenceFieldsFromText(text: string): ExtractedOccurrenceFields {
  const source = String(text || '').trim();
  if (!source) {
    return {
      type: null,
      opNumber: null,
      pvNumber: null,
      parentProduct: null,
      componentCode: null,
      warehouse: null,
      currentBalance: null,
    };
  }

  const opMatch = source.match(/\bO\.?P\.?\s*(?:[:#-]|\bn[º°]?\.?)?\s*([0-9]{5,14}(?:[./-][0-9A-Za-z]+)?)\b/i);
  const pvMatch = source.match(/\bP\.?V\.?\s*(?:[:#-]|\bn[º°]?\.?)?\s*([0-9]{4,12}(?:[./-][0-9A-Za-z]+)?)\b/i);
  const warehouseMatch = source.match(/\b(?:armaz[eé]m|arm\.?|almox\.?|local)\s*(?:[:#-]|\bn[º°]?\.?)?\s*([A-Za-z0-9]{1,6})\b/i);
  const balanceMatch = source.match(/\b(?:saldo(?:\s+atual)?|dispon[ií]vel)\s*(?:[:=]|de)?\s*(-?\d+(?:[.,]\d+)?)\b/i);

  // Protheus hierarchical part codes e.g. 11.ETQ.DIVE.00005.00 or 41.SIR.CTRL.00002.00
  const dottedCodes = [...source.matchAll(/\b(\d{2}\.[A-Z0-9]{2,6}\.[A-Z0-9]{2,6}\.\d{3,7}(?:\.\d{2})?)\b/gi)]
    .map((m) => m[1].toUpperCase());

  let componentCode: string | null = null;
  let parentProduct: string | null = null;

  const compExplicit = source.match(/\b(?:componente|comp\.?|insumo|item)\s*[:#-]?\s*(\d{2}\.[A-Z0-9.]{5,30})\b/i);
  const parentExplicit = source.match(/\b(?:produto\s+pai|pai|produto)\s*[:#-]?\s*(\d{2}\.[A-Z0-9.]{5,30})\b/i);

  if (compExplicit) componentCode = compExplicit[1].toUpperCase();
  if (parentExplicit) parentProduct = parentExplicit[1].toUpperCase();

  if (!componentCode && dottedCodes.length > 0) {
    componentCode = dottedCodes.find((code) => code !== parentProduct) || dottedCodes[0];
  }
  if (!parentProduct && dottedCodes.length > 1) {
    parentProduct = dottedCodes.find((code) => code !== componentCode) || null;
  }

  let currentBalance: string | null = null;
  if (balanceMatch) {
    currentBalance = balanceMatch[1].replace(',', '.');
  }

  let detectedType: OccurrenceType | null = null;
  if (/sem\s+saldo|falt(?:a|ando)\s+(?:saldo|material|pe[çc]a)|saldo\s+negativo/i.test(source) || (currentBalance !== null && Number(currentBalance) < 0)) {
    detectedType = 'SEM_SALDO';
  } else if (/empenh/i.test(source)) {
    detectedType = 'EMPENHO';
  } else if (/transfer[eê]ncia|transferir/i.test(source)) {
    detectedType = 'TRANSFERENCIA';
  } else if (/bloque|op\s+parada|m[aá]quina\s+parada|linha\s+parada/i.test(source)) {
    detectedType = 'BLOQUEIO_OP';
  } else if (/qualidade|refugo|n[aã]o\s+conform|defeito|reprovad/i.test(source)) {
    detectedType = 'QUALIDADE';
  }

  return {
    type: detectedType,
    opNumber: opMatch ? opMatch[1] : null,
    pvNumber: pvMatch ? pvMatch[1] : null,
    parentProduct,
    componentCode,
    warehouse: warehouseMatch ? warehouseMatch[1].toUpperCase() : null,
    currentBalance,
  };
}
