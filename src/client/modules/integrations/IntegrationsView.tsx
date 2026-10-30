import React, { useState } from 'react';
import { Webhook, Plus, Trash2, Activity } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Modal } from '../../components/Modal.tsx';
import { api } from '../../api.ts';
import { confirmInCurrentLanguage } from '../../i18n/index.ts';

interface IntegrationsViewProps {
  integrations: any[];
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onReload,
  onSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('IOT_SENSOR');
  const [authType, setAuthType] = useState('BEARER');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createIntegration({
        name,
        provider,
        authType,
        baseUrl,
        apiKey,
      });
      setModalOpen(false);
      setName('');
      setBaseUrl('');
      setApiKey('');
      onSuccess('Conector de API cadastrado com sucesso.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirmInCurrentLanguage('Deseja excluir este conector?')) return;
    try {
      await api.deleteIntegration(id);
      onSuccess('Conector excluído.');
      onReload();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const res = await api.testIntegration(id);
      onSuccess(res.message);
      onReload();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Sensores IoT e Integrações</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Conectores para telemetria de máquinas, CLPs e sistemas MES externos.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold rounded-lg text-xs transition flex items-center gap-2 shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Conector
        </button>
      </div>

      {integrations.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Nenhum conector cadastrado."
          actionLabel="Novo Conector"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-[#DCE3EB] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-[#FFAA00]/50 transition"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#2A2316] text-[#FFAA00] border border-[#FFAA00]/30 font-mono">
                    {item.provider}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      item.status === 'ACTIVE'
                        ? 'bg-[#132B25] text-[#159B72] border border-[#159B72]/30'
                        : item.status === 'ERROR'
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                        : 'bg-[#F8FAFC] text-[#64748B] border border-[#CBD5E1]'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <h4 className="text-base font-bold text-[#263548] mt-2">{item.name}</h4>
                <p className="text-xs font-mono text-[#64748B] truncate mt-1">
                  {item.baseUrl || '—'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#DCE3EB]">
                <button
                  onClick={() => handleTest(item.id)}
                  disabled={testingId === item.id}
                  className="px-3 py-1.5 bg-[#2A2316] hover:bg-[#382b17] border border-[#FFAA00]/40 text-[#FFAA00] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Activity className={`h-3.5 w-3.5 ${testingId === item.id ? 'animate-spin' : ''}`} />
                  {testingId === item.id ? 'Testando...' : 'Testar Conexão'}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-[#64748B] hover:text-rose-400 p-1.5 transition"
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
        title="Novo Conector de API"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="text-xs text-[#475569]">Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#475569]">Tipo</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              >
                <option value="IOT_SENSOR">IOT_SENSOR</option>
                <option value="WEBHOOK">WEBHOOK</option>
                <option value="MES_SYNC">MES_SYNC</option>
                <option value="CUSTOM_REST">CUSTOM_REST</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#475569]">Autenticação</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] focus:outline-none focus:border-amber-500"
              >
                <option value="BEARER">BEARER</option>
                <option value="HEADER">HEADER</option>
                <option value="BASIC">BASIC</option>
                <option value="NONE">NONE</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#475569]">URL Base</label>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-[#475569]">Chave de API / Token</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-[#263548] font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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
