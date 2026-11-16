import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Repeat } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

export const OCCURRENCE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  ABERTA: 'Aberta',
  IN_PROGRESS: 'Em atendimento',
  EM_ATENDIMENTO: 'Em atendimento',
  AGUARDANDO: 'Aguardando',
  CLOSED: 'Concluída',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export const OCCURRENCE_TYPE_LABELS: Record<string, string> = {
  SEM_SALDO: 'Sem Saldo',
  EMPENHO: 'Empenho',
  TRANSFERENCIA: 'Transferência',
  BLOQUEIO_OP: 'Bloqueio de OP',
  QUALIDADE: 'Qualidade',
  OUTRO: 'Outro',
};

export interface OccurrenceContextData {
  id: number;
  code?: string | null;
  type?: string | null;
  numeroOp?: string | null;
  pvNumber?: string | null;
  parentProduct?: string | null;
  componentCode?: string | null;
  warehouse?: string | null;
  currentBalance?: string | number | null;
  status: string;
  sector?: string | null;
  priority?: string | null;
  slaMinutes?: number | null;
  slaDueAt?: string | null;
  openedAt?: string | null;
  resolvedAt?: string | null;
  isRecurrence?: boolean;
  assigneeName?: string | null;
  assignee?: { name: string } | null;
  op?: { numeroPv?: string | null; codigoProduto?: string | null } | null;
}

function formatDurationMinutes(totalMinutes: number): string {
  const abs = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function computeSlaDisplay(occurrence: OccurrenceContextData, nowMs: number) {
  const isClosed = ['CLOSED', 'CONCLUIDA', 'CANCELADA'].includes(occurrence.status);
  if (!occurrence.slaDueAt) {
    return {
      label: occurrence.slaMinutes ? `${occurrence.slaMinutes} min` : '—',
      tone: 'neutral' as const,
      breached: false,
    };
  }
  const dueMs = new Date(occurrence.slaDueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return { label: '—', tone: 'neutral' as const, breached: false };
  }
  if (isClosed) {
    const endMs = occurrence.resolvedAt ? new Date(occurrence.resolvedAt).getTime() : dueMs;
    const withinSla = endMs <= dueMs;
    return {
      label: withinSla ? 'No prazo' : `Estourado (${formatDurationMinutes((endMs - dueMs) / 60000)})`,
      tone: withinSla ? ('ok' as const) : ('danger' as const),
      breached: !withinSla,
    };
  }
  const diffMin = (dueMs - nowMs) / 60000;
  if (diffMin < 0) {
    return {
      label: `Estourado há ${formatDurationMinutes(diffMin)}`,
      tone: 'danger' as const,
      breached: true,
    };
  }
  if (diffMin <= 20) {
    return {
      label: `Vence em ${formatDurationMinutes(diffMin)}`,
      tone: 'warn' as const,
      breached: false,
    };
  }
  return {
    label: `Restam ${formatDurationMinutes(diffMin)}`,
    tone: 'ok' as const,
    breached: false,
  };
}

interface OccurrenceContextBarProps {
  occurrence: OccurrenceContextData;
  compact?: boolean;
  onOpenOccurrence?: () => void;
  onOpenOp?: (numeroOp: string) => void;
}

export const OccurrenceContextBar: React.FC<OccurrenceContextBarProps> = ({
  occurrence,
  compact = false,
  onOpenOccurrence,
  onOpenOp,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const opNumber = occurrence.numeroOp?.trim() || null;
  const pvNumber = occurrence.pvNumber?.trim() || occurrence.op?.numeroPv?.trim() || null;
  const componentCode = occurrence.componentCode?.trim() || occurrence.op?.codigoProduto?.trim() || null;
  const warehouse = occurrence.warehouse?.trim() || null;
  const balanceRaw = occurrence.currentBalance !== null && occurrence.currentBalance !== undefined && occurrence.currentBalance !== ''
    ? Number(occurrence.currentBalance)
    : null;
  const balanceFormatted = balanceRaw !== null && Number.isFinite(balanceRaw)
    ? balanceRaw.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
    : '—';
  const isNegativeBalance = balanceRaw !== null && Number.isFinite(balanceRaw) && balanceRaw < 0;

  const statusText = translateText(OCCURRENCE_STATUS_LABELS[occurrence.status] || occurrence.status);
  const sla = computeSlaDisplay(occurrence, nowMs);
  const assigneeName = occurrence.assignee?.name || occurrence.assigneeName || null;

  const slaColorClass = sla.tone === 'danger'
    ? 'text-rose-700 font-semibold'
    : sla.tone === 'warn'
      ? 'text-amber-700 font-semibold'
      : sla.tone === 'ok'
        ? 'text-emerald-700 font-medium'
        : 'text-slate-600';

  const items = [
    { label: 'OP', value: opNumber || '—', mono: true },
    { label: 'PV', value: pvNumber || '—', mono: true },
    { label: translateText('Componente'), value: componentCode || '—', mono: true },
    { label: translateText('Armazém'), value: warehouse || '—', mono: true },
    {
      label: translateText('Saldo'),
      value: balanceFormatted,
      mono: true,
      highlight: isNegativeBalance ? 'text-rose-700 font-semibold' : undefined,
    },
    { label: translateText('Status'), value: statusText, mono: false },
    { label: 'SLA', value: sla.label, mono: false, highlight: slaColorClass },
  ];

  return (
    <div
      data-occurrence-context-bar
      className={`shrink-0 border-b border-[#DCE3EB] bg-[#F8FAFC] px-3.5 sm:px-5 ${compact ? 'py-2' : 'py-2.5'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#263548]">
          {occurrence.code && (
            <span className="font-mono text-xs font-bold text-[#916B19]">{occurrence.code}</span>
          )}
          {occurrence.type && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-medium text-[#475569]">
                {translateText(OCCURRENCE_TYPE_LABELS[occurrence.type] || occurrence.type)}
              </span>
            </>
          )}
          {occurrence.sector && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-600">
                {translateText('Setor')}: <strong className="font-semibold text-[#263548]">{occurrence.sector}</strong>
              </span>
            </>
          )}
          {assigneeName && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-600">
                {translateText('Resp.')}: <strong className="font-medium text-[#263548]">{assigneeName}</strong>
              </span>
            </>
          )}
          {occurrence.isRecurrence && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                <Repeat size={12} />
                {translateText('Reincidência')}
              </span>
            </>
          )}
          {sla.breached && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                <AlertTriangle size={12} />
                {translateText('SLA estourado')}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {opNumber && onOpenOp && (
            <button
              type="button"
              onClick={() => onOpenOp(opNumber)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#916B19] hover:underline"
            >
              {translateText('Abrir OP')}
              <ExternalLink size={12} />
            </button>
          )}
          {onOpenOccurrence && (
            <button
              type="button"
              onClick={onOpenOccurrence}
              className="inline-flex items-center gap-1 rounded-md bg-[#FFAA00] px-2.5 py-1 text-[11px] font-semibold text-[#151C25] transition hover:bg-amber-300"
            >
              {translateText('Abrir ocorrência')}
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-x-2.5 gap-y-1 overflow-x-auto text-[11px] text-slate-600">
        {items.map((item, idx) => (
          <React.Fragment key={item.label}>
            {idx > 0 && <span aria-hidden="true" className="shrink-0 text-slate-300">|</span>}
            <span className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap">
              <span className="text-slate-500">{item.label}:</span>
              <span className={`${item.mono ? 'font-mono' : ''} ${item.highlight || 'font-semibold text-[#263548]'}`}>
                {item.value}
              </span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
