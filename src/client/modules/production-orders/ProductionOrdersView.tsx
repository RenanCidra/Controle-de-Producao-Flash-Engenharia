import React, { useState } from 'react';
import { ClipboardList, Plus, Play, CheckCircle2, Sliders, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';
import { confirmInCurrentLanguage } from '../../i18n/index.ts';

interface ProductionOrdersViewProps {
  orders: any[];
  items: any[];
  lines: any[];
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ProductionOrdersView: React.FC<ProductionOrdersViewProps> = ({
  orders,
  items,
  lines,
  onReload,
  onSuccess,
  onError,
}) => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Form states
  const [orderNumber, setOrderNumber] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [productionLineId, setProductionLineId] = useState('');
  const [quantityPlanned, setQuantityPlanned] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [plannedEndDate, setPlannedEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Progress form states
  const [quantityProduced, setQuantityProduced] = useState(0);
  const [quantityScrap, setQuantityScrap] = useState(0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProductionOrder({
        orderNumber,
        inventoryItemId: parseInt(inventoryItemId, 10),
        productionLineId: productionLineId ? parseInt(productionLineId, 10) : undefined,
        quantityPlanned: parseInt(quantityPlanned, 10),
        priority,
        plannedEndDate,
        notes,
      });
      setCreateModalOpen(false);
      setOrderNumber('');
      setInventoryItemId('');
      setProductionLineId('');
      setQuantityPlanned('');
      setNotes('');
      onSuccess('Ordem de Produção criada com sucesso.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.updateProductionOrder(id, { status });
      onSuccess('Status da Ordem de Produção atualizado.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.updateProductionOrder(selectedOrder.id, {
        quantityProduced,
        quantityScrap,
      });
      setProgressModalOpen(false);
      setSelectedOrder(null);
      onSuccess('Apontamento de produção salvo.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirmInCurrentLanguage('Deseja excluir esta Ordem de Produção?')) return;
    try {
      await api.deleteProductionOrder(id);
      onSuccess('Ordem de Produção excluída.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Ordens de Produção</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Planejamento, acompanhamento e apontamento de produção industrial.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Ordem
        </button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma ordem de produção cadastrada."
          actionLabel="Nova Ordem de Produção"
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const percent = order.quantityPlanned > 0
              ? Math.min(100, Math.round((order.quantityProduced / order.quantityPlanned) * 100))
              : 0;

            return (
              <div
                key={order.id}
                className="bg-white border border-[#DCE3EB] rounded-xl p-5 space-y-4 hover:border-[#FFAA00]/50 transition shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE3EB] pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-[#FFAA00] text-sm">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        order.status === 'COMPLETED'
                          ? 'bg-[#132B25] text-[#159B72] border border-[#159B72]/30'
                          : order.status === 'IN_PROGRESS'
                          ? 'bg-blue-950/60 text-blue-300 border border-blue-800'
                          : order.status === 'PAUSED'
                          ? 'bg-[#2A2316] text-[#FFAA00] border border-[#FFAA00]/40'
                          : 'bg-[#F8FAFC] text-[#64748B] border border-[#CBD5E1]'
                      }`}
                    >
                      {order.status}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#F8FAFC] text-[#64748B] border border-[#CBD5E1]">
                      Prioridade: {order.priority}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.status === 'PLANNED' && (
                      <button
                        onClick={() => handleStatusChange(order.id, 'IN_PROGRESS')}
                        className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800 rounded text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <Play className="h-3 w-3" /> Iniciar
                      </button>
                    )}
                    {order.status === 'IN_PROGRESS' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setQuantityProduced(order.quantityProduced);
                            setQuantityScrap(order.quantityScrap);
                            setProgressModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded text-xs flex items-center gap-1 transition shadow-xs"
                        >
                          <Sliders className="h-3 w-3" /> Apontar
                        </button>
                        <button
                          onClick={() => handleStatusChange(order.id, 'COMPLETED')}
                          className="px-2.5 py-1 bg-[#132B25] hover:bg-[#183931] text-[#159B72] border border-[#159B72]/40 rounded text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Concluir
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(order.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[#64748B]">Produto:</span>
                    <p className="font-semibold text-[#263548] mt-0.5">
                      {order.itemName || '—'}
                    </p>
                    <span className="font-mono text-[11px] text-slate-500">
                      {order.itemSku || ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#64748B]">Posto de Trabalho:</span>
                    <p className="font-semibold text-[#263548] mt-0.5">
                      {order.productionLineName || 'Não definido'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#64748B]">Datas:</span>
                    <p className="text-[#475569] mt-0.5 font-mono">
                      Início: {order.startDate || '—'}
                    </p>
                    <p className="text-[#64748B] font-mono text-[11px]">
                      Término: {order.plannedEndDate}
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#64748B]">Progresso ({percent}%):</span>
                      <span className="font-mono font-bold text-[#263548]">
                        {order.quantityProduced} / {order.quantityPlanned} {order.itemUnit || 'UN'}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F8FAFC] border border-[#CBD5E1] overflow-hidden">
                      <div
                        className="h-full bg-[#FFAA00] rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    {order.quantityScrap > 0 && (
                      <span className="text-[11px] text-rose-400 mt-1 inline-block font-mono">
                        Refugo: {order.quantityScrap} {order.itemUnit}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CREATE ORDER */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nova Ordem de Produção"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs text-[#475569]">Número da OP</label>
            <input
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] uppercase font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-[#475569]">Produto a Fabricar</label>
            {items.length === 0 ? (
              <p className="text-xs text-rose-400 mt-1">
                Cadastre itens no estoque antes de criar uma ordem de produção.
              </p>
            ) : (
              <select
                required
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              >
                <option value="">Selecione...</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} - {item.name} ({item.unit})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#475569]">Posto de Trabalho</label>
              <select
                value={productionLineId}
                onChange={(e) => setProductionLineId(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              >
                <option value="">Não atribuído</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.code} - {line.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#475569]">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              >
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#475569]">Quantidade Planejada</label>
              <input
                type="number"
                required
                min="1"
                value={quantityPlanned}
                onChange={(e) => setQuantityPlanned(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-[#475569]">Data Limite</label>
              <input
                type="date"
                required
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#475569]">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-3 py-1.5 text-xs text-[#64748B] hover:text-[#263548]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={items.length === 0}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-[#263548] rounded text-xs font-semibold"
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: PROGRESS */}
      <Modal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        title={`Apontamento - ${selectedOrder?.orderNumber || ''}`}
      >
        <form onSubmit={handleSaveProgress} className="space-y-4">
          <div>
            <label className="text-xs text-[#475569]">Quantidade Produzida (Total)</label>
            <input
              type="number"
              min="0"
              required
              value={quantityProduced}
              onChange={(e) => setQuantityProduced(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-[#263548] font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-[#475569]">Refugo / Perdas (Total)</label>
            <input
              type="number"
              min="0"
              required
              value={quantityScrap}
              onChange={(e) => setQuantityScrap(parseInt(e.target.value || '0', 10))}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-rose-300 font-mono focus:outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProgressModalOpen(false)}
              className="px-3 py-1.5 text-xs text-[#64748B] hover:text-[#263548]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-[#263548] rounded text-xs font-semibold"
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
