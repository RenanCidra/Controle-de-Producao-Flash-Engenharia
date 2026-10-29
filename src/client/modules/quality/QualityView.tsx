import React, { useState } from 'react';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';

interface QualityViewProps {
  inspections: any[];
  orders: any[];
  defaultInspector?: string;
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const QualityView: React.FC<QualityViewProps> = ({
  inspections,
  orders,
  defaultInspector = '',
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [productionOrderId, setProductionOrderId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [sampleSize, setSampleSize] = useState('1');
  const [approvedCount, setApprovedCount] = useState('0');
  const [rejectedCount, setRejectedCount] = useState('0');
  const [status, setStatus] = useState<'PASSED' | 'FAILED' | 'PENDING'>('PASSED');
  const [inspectorName, setInspectorName] = useState(defaultInspector);
  const [notes, setNotes] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createQualityInspection({
        productionOrderId: parseInt(productionOrderId, 10),
        batchNumber,
        sampleSize: parseInt(sampleSize, 10),
        approvedCount: parseInt(approvedCount, 10),
        rejectedCount: parseInt(rejectedCount, 10),
        status,
        inspectorName,
        notes,
      });
      setModalOpen(false);
      setProductionOrderId('');
      setBatchNumber('');
      setSampleSize('1');
      setApprovedCount('0');
      setRejectedCount('0');
      setNotes('');
      onSuccess('Inspeção de qualidade registrada.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir este laudo de inspeção?')) return;
    try {
      await api.deleteQualityInspection(id);
      onSuccess('Laudo excluído.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Controle de Qualidade</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspeção técnica e conformidade de lotes fabricados.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Inspeção
        </button>
      </div>

      {inspections.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma inspeção de qualidade registrada."
          actionLabel="Nova Inspeção"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#121820] text-slate-400 uppercase font-semibold border-b border-[#202936]">
              <tr>
                <th className="py-3 px-4">Lote / OP</th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Amostra</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Inspetor</th>
                <th className="py-3 px-4">Observações</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202936]">
              {inspections.map((q) => (
                <tr key={q.id} className="hover:bg-[#1C2532] transition">
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-[#FFAA00]">{q.batchNumber}</span>
                    <span className="block text-[11px] text-slate-400 font-mono">{q.orderNumber}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-white">{q.itemName || '—'}</td>
                  <td className="py-3 px-4 font-mono">
                    <span className="text-slate-300">Total: {q.sampleSize}</span> |{' '}
                    <span className="text-emerald-400">Aprov: {q.approvedCount}</span> |{' '}
                    <span className="text-rose-400">Rej: {q.rejectedCount}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        q.status === 'PASSED'
                          ? 'bg-[#132B25] text-[#159B72] border border-[#159B72]/30'
                          : q.status === 'FAILED'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                          : 'bg-[#2A2316] text-[#FFAA00] border border-[#FFAA00]/40'
                      }`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{q.inspectorName}</td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                    {q.notes || '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Laudo de Inspeção"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">Ordem de Produção</label>
            {orders.length === 0 ? (
              <p className="text-xs text-rose-400 mt-1">Nenhuma OP disponível para inspeção.</p>
            ) : (
              <select
                required
                value={productionOrderId}
                onChange={(e) => setProductionOrderId(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">Selecione...</option>
                {orders.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.orderNumber} - {op.itemName}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Número do Lote</label>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="PASSED">PASSED</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-300">Amostra</label>
              <input
                type="number"
                min="1"
                required
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Aprovadas</label>
              <input
                type="number"
                min="0"
                required
                value={approvedCount}
                onChange={(e) => setApprovedCount(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Rejeitadas</label>
              <input
                type="number"
                min="0"
                required
                value={rejectedCount}
                onChange={(e) => setRejectedCount(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300">Inspetor</label>
            <input
              type="text"
              required
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={orders.length === 0}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
