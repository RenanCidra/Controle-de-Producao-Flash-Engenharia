import React, { useState } from 'react';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';
import { confirmInCurrentLanguage } from '../../i18n/index.ts';

interface InventoryViewProps {
  items: any[];
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState('RAW_MATERIAL');
  const [unit, setUnit] = useState('UN');
  const [costPrice, setCostPrice] = useState('0.00');
  const [quantityOnHand, setQuantityOnHand] = useState(0);
  const [minimumStock, setMinimumStock] = useState(10);
  const [description, setDescription] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createInventoryItem({
        sku,
        name,
        itemType,
        unit,
        costPrice,
        quantityOnHand,
        minimumStock,
        description,
      });
      setModalOpen(false);
      setSku('');
      setName('');
      setCostPrice('0.00');
      setQuantityOnHand(0);
      setDescription('');
      onSuccess('Item cadastrado no estoque com sucesso.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirmInCurrentLanguage('Deseja excluir este item do inventário?')) return;
    try {
      await api.deleteInventoryItem(id);
      onSuccess('Item excluído.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Estoque de Insumos e Produtos</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Matérias-primas, componentes, embalagens e produtos acabados.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Item
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum item em estoque."
          actionLabel="Novo Item"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#121820] text-slate-400 uppercase font-semibold border-b border-[#202936]">
              <tr>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4 text-center">Saldo</th>
                <th className="py-3 px-4 text-center">Mínimo</th>
                <th className="py-3 px-4 text-right">Custo</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202936]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#1C2532] transition">
                  <td className="py-3 px-4 font-mono font-bold text-[#FFAA00]">{item.sku}</td>
                  <td className="py-3 px-4 font-medium text-white">{item.name}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1C2532] text-slate-300 border border-[#263342]">
                      {item.itemType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-white">
                    {item.quantityOnHand} {item.unit}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-400">
                    {item.minimumStock} {item.unit}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    R$ {parseFloat(item.costPrice).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
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
        title="Cadastrar Insumo / Item"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Código SKU</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Tipo de Item</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="RAW_MATERIAL">RAW_MATERIAL</option>
                <option value="FINISHED_GOOD">FINISHED_GOOD</option>
                <option value="COMPONENT">COMPONENT</option>
                <option value="PACKAGING">PACKAGING</option>
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
              <label className="text-xs text-slate-300">Unidade</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Custo Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">Saldo Atual</label>
              <input
                type="number"
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">Estoque Mínimo</label>
              <input
                type="number"
                value={minimumStock}
                onChange={(e) => setMinimumStock(parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
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
