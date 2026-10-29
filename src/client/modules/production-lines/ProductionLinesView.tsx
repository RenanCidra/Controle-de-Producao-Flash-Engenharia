import React, { useState } from 'react';
import { Factory, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';

interface ProductionLinesViewProps {
  lines: any[];
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ProductionLinesView: React.FC<ProductionLinesViewProps> = ({
  lines,
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacityPerHour, setCapacityPerHour] = useState('0');
  const [status, setStatus] = useState<'OPERATIONAL' | 'MAINTENANCE' | 'IDLE'>('OPERATIONAL');
  const [supervisorName, setSupervisorName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProductionLine({
        code,
        name,
        description,
        capacityPerHour: parseInt(capacityPerHour, 10),
        status,
        supervisorName,
      });
      setModalOpen(false);
      setCode('');
      setName('');
      setDescription('');
      setCapacityPerHour('0');
      setSupervisorName('');
      onSuccess('Posto de trabalho cadastrado com sucesso.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja excluir este posto de trabalho?')) return;
    try {
      await api.deleteProductionLine(id);
      onSuccess('Posto de trabalho excluído.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Linhas e Postos de Trabalho</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Células de fabricação e capacidade instalada por hora.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Posto
        </button>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="Nenhum posto de trabalho cadastrado."
          actionLabel="Novo Posto de Trabalho"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lines.map((line) => (
            <div
              key={line.id}
              className="bg-[#151C25] border border-[#202936] rounded-xl p-5 flex flex-col justify-between space-y-3 shadow-sm hover:border-[#FFAA00]/50 transition"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#FFAA00] bg-[#2A2316] px-2 py-0.5 rounded border border-[#FFAA00]/30">
                    {line.code}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      line.status === 'OPERATIONAL'
                        ? 'bg-[#132B25] text-[#159B72] border border-[#159B72]/30'
                        : line.status === 'MAINTENANCE'
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                        : 'bg-[#1C2532] text-slate-400 border border-[#263342]'
                    }`}
                  >
                    {line.status}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white mt-2">{line.name}</h4>
                {line.description && (
                  <p className="text-xs text-slate-400 mt-1">{line.description}</p>
                )}
                <div className="mt-3 p-2.5 rounded bg-[#1C2532] border border-[#263342] space-y-1 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capacidade:</span>
                    <span className="font-mono font-bold text-white">
                      {line.capacityPerHour} un/h
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Supervisor:</span>
                    <span className="text-slate-200">{line.supervisorName || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#202936]">
                <button
                  onClick={() => handleDelete(line.id)}
                  className="text-slate-400 hover:text-rose-400 p-1 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cadastrar Posto de Trabalho"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Código</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
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
                <option value="OPERATIONAL">OPERATIONAL</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="IDLE">IDLE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300">Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Capacidade (un/h)</label>
              <input
                type="number"
                min="0"
                value={capacityPerHour}
                onChange={(e) => setCapacityPerHour(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Supervisor Responsável</label>
              <input
                type="text"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300">Descrição</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
