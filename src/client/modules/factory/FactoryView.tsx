import React, { useState } from 'react';
import { Building } from 'lucide-react';
import { Modal } from '../../components/Modal.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { api } from '../../api.ts';

interface FactoryViewProps {
  profile: any;
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const FactoryView: React.FC<FactoryViewProps> = ({
  profile,
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState(profile?.name || '');
  const [plantCode, setPlantCode] = useState(profile?.plantCode || 'PLANTA-01');
  const [taxId, setTaxId] = useState(profile?.taxId || '');
  const [address, setAddress] = useState(profile?.address || '');

  const handleOpenModal = () => {
    setName(profile?.name || '');
    setPlantCode(profile?.plantCode || 'PLANTA-01');
    setTaxId(profile?.taxId || '');
    setAddress(profile?.address || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveOrg({
        name,
        plantCode,
        taxId,
        address,
      });
      setModalOpen(false);
      onSuccess('Dados da planta industrial atualizados.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#151C25] border border-[#202936] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#202936] pb-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">Planta Industrial</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Identificação da fábrica e parâmetros da unidade produtiva.
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
          >
            <Building className="h-3.5 w-3.5" />
            {profile ? 'Editar' : 'Cadastrar'}
          </button>
        </div>

        {profile ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3.5 rounded-lg bg-[#1C2532] border border-[#263342]">
              <span className="text-xs text-slate-400">Nome da Fábrica:</span>
              <p className="font-semibold text-white mt-0.5">{profile.name}</p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#1C2532] border border-[#263342]">
              <span className="text-xs text-slate-400">Código da Planta:</span>
              <p className="font-mono text-[#FFAA00] font-bold mt-0.5">
                {profile.plantCode || '—'}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#1C2532] border border-[#263342]">
              <span className="text-xs text-slate-400">CNPJ / ID Fiscal:</span>
              <p className="font-mono text-white mt-0.5">{profile.taxId || '—'}</p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#1C2532] border border-[#263342]">
              <span className="text-xs text-slate-400">Fuso Horário:</span>
              <p className="font-mono text-white mt-0.5">{profile.timezone}</p>
            </div>
            <div className="md:col-span-2 p-3.5 rounded-lg bg-[#1C2532] border border-[#263342]">
              <span className="text-xs text-slate-400">Endereço:</span>
              <p className="text-white mt-0.5">{profile.address || '—'}</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Building}
            title="Planta industrial não cadastrada."
            actionLabel="Cadastrar Planta"
            onAction={handleOpenModal}
          />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Dados da Planta Industrial"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs text-slate-300">Razão Social / Nome</label>
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
              <label className="text-xs text-slate-300">Código da Planta</label>
              <input
                type="text"
                value={plantCode}
                onChange={(e) => setPlantCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">CNPJ / ID Fiscal</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-300">Endereço</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
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
