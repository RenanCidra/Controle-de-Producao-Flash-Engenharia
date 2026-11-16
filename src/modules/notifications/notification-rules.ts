export const NOTIFICATION_SCOPES = ['MINE', 'SECTOR', 'ALL'] as const;
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number];

export type NotificationEventType =
  | 'OCCURRENCE_CREATED'
  | 'OCCURRENCE_ASSIGNED'
  | 'OCCURRENCE_MESSAGE'
  | 'OCCURRENCE_ESCALATED_30M'
  | 'OCCURRENCE_SLA_BREACH'
  | 'OCCURRENCE_COMPLETED'
  | 'SHIFT_SUMMARY';

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidClockTime(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_RE.test(value.trim());
}

export function normalizeNotificationScope(value: unknown, fallback: NotificationScope = 'SECTOR'): NotificationScope {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if ((NOTIFICATION_SCOPES as readonly string[]).includes(upper)) {
      return upper as NotificationScope;
    }
  }
  return fallback;
}

export function defaultScopeForRole(role: string): NotificationScope {
  if (role === 'ADMIN' || role === 'SUPERVISOR') return 'ALL';
  if (role === 'AUDITOR') return 'MINE';
  return 'SECTOR';
}

function clockToMinutes(clock: string): number {
  const match = CLOCK_RE.exec(clock.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getMinutesInTimeZone(date: Date, timeZone = 'America/Sao_Paulo'): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function isWithinQuietHours(
  now: Date,
  enabled: boolean,
  startClock: string | null | undefined,
  endClock: string | null | undefined,
  timeZone = 'America/Sao_Paulo',
): boolean {
  if (!enabled) return false;
  if (!isValidClockTime(startClock) || !isValidClockTime(endClock)) return false;
  const start = clockToMinutes(startClock);
  const end = clockToMinutes(endClock);
  if (start === end) return false;
  const current = getMinutesInTimeZone(now, timeZone);
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function departmentMatchesSector(department: string | null | undefined, sector: string | null | undefined): boolean {
  const dept = normalizeText(department);
  const target = normalizeText(sector);
  if (!dept || !target) return false;
  if (dept === target || dept.includes(target)) return true;

  if (target === 'ALMOX') {
    return /ALMOX|ESTOQ|LOGIST|MATERIA/.test(dept);
  }
  if (target === 'PCP') {
    return /PCP|PLANEJ|PROGRAM/.test(dept);
  }
  if (target === 'PRODUCAO') {
    return /PROD|FABRIC|MONTAG|SINAL|LINHA/.test(dept);
  }
  if (target === 'QUALIDADE') {
    return /QUALID|INSPEC|CQ\b/.test(dept);
  }
  return false;
}

export function shouldNotifyUserForOccurrenceEvent(input: {
  userId: number;
  role: string;
  department: string | null;
  scope: NotificationScope;
  occurrenceSector: string;
  assigneeId: number | null;
  requesterId: number | null;
  eventType: NotificationEventType;
  actorId?: number | null;
}): boolean {
  if (input.actorId && input.userId === input.actorId) return false;

  const isAssignee = input.assigneeId !== null && input.userId === input.assigneeId;
  const isRequester = input.requesterId !== null && input.userId === input.requesterId;
  const isLeader = input.role === 'ADMIN' || input.role === 'SUPERVISOR';

  if (input.eventType === 'OCCURRENCE_SLA_BREACH') {
    return isLeader || isAssignee;
  }
  if (input.eventType === 'OCCURRENCE_ASSIGNED') {
    return isAssignee;
  }
  if (input.eventType === 'OCCURRENCE_COMPLETED') {
    if (input.scope === 'ALL') return true;
    return isRequester || isAssignee;
  }
  if (input.eventType === 'OCCURRENCE_ESCALATED_30M') {
    if (isAssignee || isLeader) return true;
    if (input.scope === 'ALL') return true;
    if (input.scope === 'SECTOR') return departmentMatchesSector(input.department, input.occurrenceSector);
    return false;
  }
  if (input.eventType === 'OCCURRENCE_MESSAGE') {
    if (isAssignee || isRequester) return true;
    if (input.scope === 'ALL') return true;
    if (input.scope === 'SECTOR') return departmentMatchesSector(input.department, input.occurrenceSector);
    return false;
  }
  if (input.eventType === 'OCCURRENCE_CREATED') {
    if (isAssignee) return true;
    if (input.scope === 'ALL') return true;
    if (input.scope === 'SECTOR') return departmentMatchesSector(input.department, input.occurrenceSector) || isLeader;
    return false;
  }

  return false;
}

const VALID_SECTORS = new Set(['ALMOX', 'PCP', 'PRODUCAO', 'QUALIDADE']);

export function safeSectorLabel(sector: string | null | undefined): string {
  const normalized = normalizeText(sector);
  if (VALID_SECTORS.has(normalized)) return normalized;
  return 'PCP';
}

// Push and notification previews are strictly generic so OP, PV, component codes,
// and stock balances are only visible after authenticated login inside the app.
export function buildGenericNotificationCopy(input: {
  eventType: NotificationEventType;
  sector?: string | null;
  pendingCount?: number;
}): { title: string; bodyPreview: string } {
  const sector = safeSectorLabel(input.sector);
  const count = typeof input.pendingCount === 'number' && input.pendingCount > 1 ? input.pendingCount : 1;

  switch (input.eventType) {
    case 'OCCURRENCE_CREATED':
      return {
        title: 'Nova ocorrência pendente',
        bodyPreview:
          count > 1
            ? `Você tem ${count} ocorrências pendentes no setor ${sector}. Toque para ver.`
            : `Nova ocorrência aberta para o setor ${sector}. Toque para ver.`,
      };
    case 'OCCURRENCE_ASSIGNED':
      return {
        title: 'Ocorrência atribuída a você',
        bodyPreview: `Uma ocorrência do setor ${sector} foi direcionada para seu atendimento. Toque para ver.`,
      };
    case 'OCCURRENCE_MESSAGE':
      return {
        title: 'Atualização em ocorrência',
        bodyPreview: `Há uma nova mensagem em uma ocorrência do setor ${sector}. Toque para ver.`,
      };
    case 'OCCURRENCE_ESCALATED_30M':
      return {
        title: 'Ocorrência sem retorno há 30 min',
        bodyPreview: `Ocorrência pendente no setor ${sector} aguarda atendimento há mais de 30 minutos. Toque para ver.`,
      };
    case 'OCCURRENCE_SLA_BREACH':
      return {
        title: 'SLA de ocorrência excedido',
        bodyPreview: `Uma ocorrência do setor ${sector} ultrapassou o prazo de SLA e requer atenção. Toque para ver.`,
      };
    case 'OCCURRENCE_COMPLETED':
      return {
        title: 'Ocorrência concluída',
        bodyPreview: `Uma ocorrência do setor ${sector} foi concluída. Toque para conferir.`,
      };
    case 'SHIFT_SUMMARY':
      return {
        title: 'Resumo da virada de turno',
        bodyPreview:
          count > 1
            ? `Existem ${count} ocorrências em aberto aguardando acompanhamento. Toque para ver.`
            : 'Existe 1 ocorrência em aberto aguardando acompanhamento. Toque para ver.',
      };
  }
}

export function validatePushSubscriptionPayload(input: Record<string, unknown>): {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string | null;
} | null {
  const endpointRaw = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
  const keys = input.keys && typeof input.keys === 'object' ? (input.keys as Record<string, unknown>) : null;
  const p256dhRaw = typeof input.p256dh === 'string' ? input.p256dh.trim() : typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const authRaw = typeof input.auth === 'string' ? input.auth.trim() : typeof keys?.auth === 'string' ? keys.auth.trim() : '';
  const deviceLabelRaw =
    typeof input.deviceLabel === 'string'
      ? input.deviceLabel.trim()
      : typeof input.device_label === 'string'
        ? input.device_label.trim()
        : '';

  if (!endpointRaw || endpointRaw.length > 2048 || !p256dhRaw || p256dhRaw.length > 512 || !authRaw || authRaw.length > 512) {
    return null;
  }

  try {
    const parsed = new URL(endpointRaw);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    endpoint: endpointRaw,
    p256dh: p256dhRaw,
    auth: authRaw,
    deviceLabel: deviceLabelRaw ? deviceLabelRaw.slice(0, 80) : null,
  };
}
