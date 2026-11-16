import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { api } from '../api.ts';
import { translateText } from '../i18n/index.ts';

interface ConvertMessageToOccurrenceModalProps {
  open: boolean;
  sourceKind?: 'group' | 'direct' | null;
  sourceMessageId?: number | null;
  initialText?: string;
  onClose: () => void;
  onCreated: (occurrence: any) => void;
}

const ROUTING_PREVIEW: Record<string, { sector: string; sectorLabel: string; sla: number; priority: string }> = {
  SEM_SALDO: { sector: 'ALMOX', sectorLabel: 'ALMOX (+ PCP)', sla: 120, priority: 'ALTA' },
  EMPENHO: { sector: 'PCP', sectorLabel: 'PCP', sla: 120, priority: 'MEDIA' },
  TRANSFERENCIA: { sector: 'ALMOX', sectorLabel: 'ALMOX', sla: 60, priority: 'ALTA' },
  BLOQUEIO_OP: { sector: 'PRODUCAO', sectorLabel: 'PRODUÇÃO (Supervisor)', sla: 240, priority: 'CRITICA' },
  QUALIDADE: { sector: 'QUALIDADE', sectorLabel: 'QUALIDADE', sla: 240, priority: 'ALTA' },
  OUTRO: { sector: 'PCP', sectorLabel: 'PCP', sla: 120, priority: 'MEDIA' },
};

function parseMessagePreview(text: string) {
  const source = String(text || '').trim();
  const opMatch = source.match(/\bO\.?P\.?\s*(?:[:#-]|\bn[º°]?\.?)?\s*([0-9]{5,14}(?:[./-][0-9A-Za-z]+)?)\b/i);
  const pvMatch = source.match(/\bP\.?V\.?\s*(?:[:#-]|\bn[º°]?\.?)?\s*([0-9]{4,12}(?:[./-][0-9A-Za-z]+)?)\b/i);
  const whMatch = source.match(/\b(?:armaz[eé]m|arm\.?|almox\.?|local)\s*(?:[:#-]|\bn[º°]?\.?)?\s*([A-Za-z0-9]{1,6})\b/i);
  const balMatch = source.match(/\b(?:saldo(?:\s+atual)?|dispon[ií]vel)\s*(?:[:=]|de)?\s*(-?\d+(?:[.,]\d+)?)\b/i);
  const dotted = [...source.matchAll(/\b(\d{2}\.[A-Z0-9]{2,6}\.[A-Z0-9]{2,6}\.\d{3,7}(?:\.\d{2})?)\b/gi)].map((m) => m[1].toUpperCase());

  const compExplicit = source.match(/\b(?:componente|comp\.?|insumo|item)\s*[:#-]?\s*(\d{2}\.[A-Z0-9.]{5,30})\b/i);
  const parentExplicit = source.match(/\b(?:produto\s+pai|pai|produto)\s*[:#-]?\s*(\d{2}\.[A-Z0-9.]{5,30})\b/i);

  const componentCode = compExplicit ? compExplicit[1].toUpperCase() : (dotted[0] || '');
  const parentProduct = parentExplicit ? parentExplicit[1].toUpperCase() : (dotted.find((c) => c !== componentCode) || '');
  const currentBalance = balMatch ? balMatch[1].replace(',', '.') : '';

  let type = 'OUTRO';
  if (/sem\s+saldo|falt(?:a|ando)\s+(?:saldo|material|pe[çc]a)|saldo\s+negativo/i.test(source) || (currentBalance && Number(currentBalance) < 0)) {
    type = 'SEM_SALDO';
  } else if (/empenh/i.test(source)) {
    type = 'EMPENHO';
  } else if (/transfer/i.test(source)) {
    type = 'TRANSFERENCIA';
  } else if (/bloque|parada/i.test(source)) {
    type = 'BLOQUEIO_OP';
  } else if (/qualidade|refugo|defeito/i.test(source)) {
    type = 'QUALIDADE';
  }

  return {
    type,
    opNumber: opMatch ? opMatch[1] : '',
    pvNumber: pvMatch ? pvMatch[1] : '',
    parentProduct,
    componentCode,
    warehouse: whMatch ? whMatch[1].toUpperCase() : '',
    currentBalance,
    description: source,
  };
}

export const ConvertMessageToOccurrenceModal: React.FC<ConvertMessageToOccurrenceModalProps> = ({
  open,
  sourceKind,
  sourceMessageId,
  initialText = '',
  onClose,
  onCreated,
}) => {
  const [type, setType] = useState('SEM_SALDO');
  const [opNumber, setOpNumber] = useState('');
  const [pvNumber, setPvNumber] = useState('');
  const [parentProduct, setParentProduct] = useState('');
  const [componentCode, setComponentCode] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [priority, setPriority] = useState('ALTA');
  const [sector, setSector] = useState('ALMOX');
  const [assigneeId, setAssigneeId] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<Array<{ id: number; name: string; department: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const parsed = parseMessagePreview(initialText);
    const rule = ROUTING_PREVIEW[parsed.type] || ROUTING_PREVIEW.OUTRO;
    setType(parsed.type);
    setOpNumber(parsed.opNumber);
    setPvNumber(parsed.pvNumber);
    setParentProduct(parsed.parentProduct);
    setComponentCode(parsed.componentCode);
    setWarehouse(parsed.warehouse);
    setCurrentBalance(parsed.currentBalance);
    setSector(rule.sector);
    setPriority(rule.priority);
    setAssigneeId('');
    setDescription(parsed.description);
    setError('');
    api.getOccurrenceAssignees()
      .then((rows) => setAssignees(Array.isArray(rows) ? rows : []))
      .catch(() => setAssignees([]));
  }, [open, initialText]);

  if (!open) return null;

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    const rule = ROUTING_PREVIEW[nextType] || ROUTING_PREVIEW.OUTRO;
    setSector(rule.sector);
    setPriority(rule.priority);
  };

  const rulePreview = ROUTING_PREVIEW[type] || ROUTING_PREVIEW.OUTRO;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await api.createOccurrenceFromMessage({
        messageKind: sourceKind || undefined,
        messageId: sourceMessageId || undefined,
        type,
        opNumber: opNumber.trim() || undefined,
        pvNumber: pvNumber.trim() || undefined,
        parentProduct: parentProduct.trim() || undefined,
        componentCode: componentCode.trim() || undefined,
        warehouse: warehouse.trim() || undefined,
        currentBalance: currentBalance.trim() || undefined,
        sector,
        priority,
        assigneeId: assigneeId ? Number(assigneeId) : undefined,
        description: description.trim() || undefined,
      });
      onCreated(created);
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível criar a ocorrência.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-occurrence-title"
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-[#263548] shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[#E7ECF1] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF4D6] text-[#916B19]">
              <AlertTriangle size={17} />
            </span>
            <div>
              <h3 id="convert-occurrence-title" className="text-sm font-bold text-[#263548]">
                {translateText('Transformar conversa em ocorrência')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {translateText('Revise os campos identificados ou salve diretamente com o contexto da mensagem.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label={translateText('Fechar')}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F1F4F7]"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-[#FFF9E9] px-3 py-2 text-[11px] text-[#76530B]">
            <span>
              {translateText('Roteamento automático')}: <strong>{rulePreview.sectorLabel}</strong>
            </span>
            <span>
              SLA: <strong>{rulePreview.sla} min</strong>
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Tipo *')}
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
              >
                <option value="SEM_SALDO">{translateText('Sem Saldo')}</option>
                <option value="EMPENHO">{translateText('Empenho')}</option>
                <option value="TRANSFERENCIA">{translateText('Transferência')}</option>
                <option value="BLOQUEIO_OP">{translateText('Bloqueio de OP')}</option>
                <option value="QUALIDADE">{translateText('Qualidade')}</option>
                <option value="OUTRO">{translateText('Outro')}</option>
              </select>
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Setor destino')}
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
              >
                <option value="ALMOX">ALMOX</option>
                <option value="PCP">PCP</option>
                <option value="PRODUCAO">PRODUCAO</option>
                <option value="QUALIDADE">QUALIDADE</option>
              </select>
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('OP (opcional)')}
              <input
                value={opNumber}
                maxLength={80}
                onChange={(e) => setOpNumber(e.target.value)}
                placeholder="Ex.: 06298301002"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('PV (opcional)')}
              <input
                value={pvNumber}
                maxLength={80}
                onChange={(e) => setPvNumber(e.target.value)}
                placeholder="Ex.: 012841"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Componente (opcional)')}
              <input
                value={componentCode}
                maxLength={80}
                onChange={(e) => setComponentCode(e.target.value)}
                placeholder="Ex.: 11.ETQ.DIVE.00005.00"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Produto pai (opcional)')}
              <input
                value={parentProduct}
                maxLength={80}
                onChange={(e) => setParentProduct(e.target.value)}
                placeholder="Ex.: 41.SIR.CTRL.00002.00"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Armazém (opcional)')}
              <input
                value={warehouse}
                maxLength={20}
                onChange={(e) => setWarehouse(e.target.value)}
                placeholder="Ex.: 50"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Saldo atual (opcional)')}
              <input
                value={currentBalance}
                maxLength={20}
                onChange={(e) => setCurrentBalance(e.target.value)}
                placeholder="Ex.: -13"
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#263548]"
              />
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Prioridade')}
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
              >
                <option value="BAIXA">{translateText('Baixa')}</option>
                <option value="MEDIA">{translateText('Média')}</option>
                <option value="ALTA">{translateText('Alta')}</option>
                <option value="CRITICA">{translateText('Crítica')}</option>
              </select>
            </label>

            <label className="text-[11px] font-semibold text-slate-600">
              {translateText('Responsável inicial (opcional)')}
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
              >
                <option value="">{translateText('Atribuir depois')}</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}{user.department ? ` · ${user.department}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[11px] font-semibold text-slate-600">
            {translateText('Descrição *')}
            <textarea
              required
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={translateText('Contexto da ocorrência…')}
              className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#263548]"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#E7ECF1] pt-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-[#DCE3EB] px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {translateText('Cancelar')}
            </button>
            <button
              type="submit"
              disabled={saving || !description.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFAA00] px-4 py-2 text-xs font-semibold text-[#151C25] transition hover:bg-amber-300 disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              {saving ? translateText('Registrando…') : translateText('Criar ocorrência')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
