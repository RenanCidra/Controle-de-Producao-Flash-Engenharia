import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  GitBranch,
  RefreshCw,
  Eye,
  X,
  FileText,
  Workflow,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { api, ProtheusMockFlowCheck, ProtheusMockValidationReport, ProtheusSyncResult } from '../../api.ts';
import { getIntlLocale, translateText } from '../../i18n/index.ts';

interface ProtheusSyncViewProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshStats: () => void;
}

const mockDatasetLabels: Record<string, string> = {
  products: 'Produtos',
  'product-groups': 'Grupos de produtos',
  resources: 'Recursos (SH1)',
  structures: 'Estruturas (SG1)',
  routings: 'Roteiros (SG2)',
  'production-orders': 'Ordens de produção (SC2)',
  commitments: 'Empenhos',
  'sales-order-headers': 'Cabeçalhos de PV (SC5)',
  'sales-order-lines': 'Itens de PV (SC6)',
  appointments: 'Apontamentos (SH6)',
};

export const ProtheusSyncView: React.FC<ProtheusSyncViewProps> = ({
  onSuccess,
  onError,
  onRefreshStats,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'upload' | 'pvs' | 'ops' | 'batches' | 'mock'>('upload');
  const [loading, setLoading] = useState(false);
  const [mockValidation, setMockValidation] = useState<ProtheusMockValidationReport | null>(null);
  const [mockValidationError, setMockValidationError] = useState<string | null>(null);
  const [mockPreviewEntity, setMockPreviewEntity] = useState('production-orders');
  const [mockPreview, setMockPreview] = useState<Awaited<ReturnType<typeof api.getProtheusMockData>> | null>(null);
  const [mockPreviewLoading, setMockPreviewLoading] = useState(false);
  const [mockPreviewError, setMockPreviewError] = useState<string | null>(null);
  const [mockFlowCheck, setMockFlowCheck] = useState<ProtheusMockFlowCheck | null>(null);
  const [mockFlowCheckLoading, setMockFlowCheckLoading] = useState(false);
  const [mockFlowCheckError, setMockFlowCheckError] = useState<string | null>(null);

  const runMockFlowCheck = async () => {
    setMockFlowCheckLoading(true);
    setMockFlowCheckError(null);
    try {
      setMockFlowCheck(await api.getProtheusMockFlowCheck());
    } catch (err: any) {
      setMockFlowCheckError(err.message || 'Não foi possível concluir a verificação completa.');
    } finally {
      setMockFlowCheckLoading(false);
    }
  };

  const loadMockPreview = async (entity: string, cursor?: string, append = false) => {
    setMockPreviewLoading(true);
    setMockPreviewError(null);
    try {
      const page = await api.getProtheusMockData(entity, cursor, 10);
      setMockPreview((previous) => append && previous?.entity === entity
        ? { ...page, records: [...previous.records, ...page.records] }
        : page);
    } catch (err: any) {
      setMockPreviewError(err.message || 'Não foi possível carregar os registros da origem.');
    } finally {
      setMockPreviewLoading(false);
    }
  };

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [explicitEntityType, setExplicitEntityType] = useState<string>('AUTO');
  const [uploadResult, setUploadResult] = useState<ProtheusSyncResult | null>(null);

  // REST API JSON State
  const [restJsonText, setRestJsonText] = useState<string>('');

  // Traceability Data State
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Inspection Modals
  const [selectedPvDetail, setSelectedPvDetail] = useState<any | null>(null);
  const [selectedOpDetail, setSelectedOpDetail] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'pvs') {
        const pvs = await api.getProtheusSalesOrders({
          search: searchFilter,
          status: statusFilter,
        });
        setSalesOrders(pvs);
      } else if (activeSubTab === 'ops') {
        const ops = await api.getProtheusProductionOrders({
          search: searchFilter,
          status: statusFilter,
        });
        setProductionOrders(ops);
      } else if (activeSubTab === 'batches') {
        const b = await api.getProtheusBatches();
        setBatches(b);
      } else if (activeSubTab === 'mock') {
        setMockValidationError(null);
        const report = await api.validateProtheusMock();
        setMockValidation(report);
        const available = report.datasets.find((dataset) => dataset.status === 'OK');
        if (available) {
          const entity = report.datasets.some((dataset) => dataset.entity === mockPreviewEntity && dataset.status === 'OK')
            ? mockPreviewEntity : available.entity;
          setMockPreviewEntity(entity);
          await loadMockPreview(entity);
        }
      }
    } catch (err: any) {
      if (activeSubTab === 'mock') setMockValidationError(err.message || 'Não foi possível validar a API simulada.');
      else onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubTab]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content || '');
    };
    reader.readAsText(file);
  };

  const handleProcessFile = async () => {
    if (!fileContent) {
      onError('Selecione um arquivo válido para processar.');
      return;
    }

    setLoading(true);
    try {
      const entity = explicitEntityType === 'AUTO' ? undefined : explicitEntityType;
      const res = await api.syncProtheusUpload(
        fileContent,
        selectedFile?.name || 'dados_protheus.csv',
        entity
      );
      setUploadResult(res);
      onSuccess(`Arquivo processado com sucesso. Lote: ${res.batchCode}`);
      onRefreshStats();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRestJson = async () => {
    if (!restJsonText.trim()) {
      onError('Insira o payload JSON para envio.');
      return;
    }

    setLoading(true);
    try {
      const parsed = JSON.parse(restJsonText);
      const res = await api.syncProtheusRest(parsed);
      setUploadResult(res);
      onSuccess(`Payload REST sincronizado com sucesso. Lote: ${res.batchCode}`);
      onRefreshStats();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPvDetail = async (numeroPv: string) => {
    setLoading(true);
    try {
      const detail = await api.getProtheusSalesOrderDetail(numeroPv);
      setSelectedPvDetail(detail);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenOpDetail = async (numeroOp: string) => {
    setLoading(true);
    try {
      const detail = await api.getProtheusProductionOrderDetail(numeroOp);
      setSelectedOpDetail(detail);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Workflow className="h-5 w-5 text-amber-500" />
            Módulo 1: Normalização & Rastreabilidade Protheus
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Ingestão direta via REST API ou Arquivos (CSV/JSON) com mapeamento de tabelas TOTVS (SC5, SC6, SB1, SG1, SG2, SC2, SH6).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadData();
              if (activeSubTab !== 'mock') onRefreshStats();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Module Tabs */}
        <div className="flex flex-wrap border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveSubTab('upload')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'upload'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          Ingestão (Arquivos & API REST)
        </button>
        <button
          onClick={() => setActiveSubTab('pvs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'pvs'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Pedidos de Venda (PVs)
        </button>
        <button
          onClick={() => setActiveSubTab('ops')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'ops'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          Ordens de Produção (OPs) & Roteiro
        </button>
        <button
          onClick={() => setActiveSubTab('batches')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'batches'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          Auditoria de Lotes Ingeridos
        </button>
        <button
          onClick={() => setActiveSubTab('mock')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'mock'
              ? 'border-amber-500 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          {translateText('Teste da API simulada')}
        </button>
      </div>

      {/* TAB 1: INGESTION (FILES & REST API) */}
      {activeSubTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* File Upload Section */}
          <div className="rounded-xl border border-[#202936] bg-[#151C25] p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Importação de Arquivo (CSV / JSON)</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Protheus Export</span>
            </div>

            <p className="text-xs text-slate-400">
              Selecione uma extração em formato CSV (delimitador ';' ou ',') ou JSON contendo tabelas Protheus (SC5/SC6, SB1, SG1, SG2, SC2 ou SH6).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mapeamento da Entidade
                </label>
                <select
                  value={explicitEntityType}
                  onChange={(e) => setExplicitEntityType(e.target.value)}
                  className="w-full bg-[#1C2532] border border-[#263342] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#FFAA00]"
                >
                  <option value="AUTO">Identificação Automática por Cabeçalhos</option>
                  <option value="SALES_ORDERS">Pedidos de Venda (SC5 / SC6)</option>
                  <option value="PRODUCTION_ORDERS">Ordens de Produção (SC2)</option>
                  <option value="PRODUCTS">Cadastro de Produtos (SB1)</option>
                  <option value="STRUCTURES">Estrutura de Produtos / BOM (SG1)</option>
                  <option value="ROUTINGS">Roteiros e Operações (SG2)</option>
                  <option value="APPOINTMENTS">Apontamentos de Chão de Fábrica (SH6)</option>
                </select>
              </div>

              <div className="border-2 border-dashed border-[#263342] hover:border-[#FFAA00]/50 rounded-xl p-6 text-center transition bg-[#1C2532]/40">
                <input
                  type="file"
                  id="protheusFileInput"
                  accept=".csv,.txt,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="protheusFileInput" className="cursor-pointer flex flex-col items-center">
                  <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
                  <span className="text-xs font-semibold text-slate-200">
                    {selectedFile ? selectedFile.name : 'Clique para selecionar o arquivo Protheus'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Suporta arquivos CSV e JSON'}
                  </span>
                </label>
              </div>

              {fileContent && (
                <div className="rounded-lg bg-[#121820] p-3 border border-[#202936]">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-mono">
                    <span>Pré-visualização das Primeiras Linhas</span>
                    <span>{fileContent.split('\n').length} linhas</span>
                  </div>
                  <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto max-h-32 whitespace-pre-wrap">
                    {fileContent.split('\n').slice(0, 5).join('\n')}
                  </pre>
                </div>
              )}

              <button
                onClick={handleProcessFile}
                disabled={loading || !fileContent}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#FFAA00] hover:bg-[#e69900] text-[#151C25] font-bold text-xs transition disabled:opacity-50 shadow-xs"
              >
                <CheckCircle2 className="h-4 w-4" />
                Processar e Normalizar Arquivo
              </button>
            </div>
          </div>

          {/* REST API Ingestion Section */}
          <div className="rounded-xl border border-[#202936] bg-[#151C25] p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Ingestão via Endpoint REST API</h3>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">POST /api/protheus/sync/rest</span>
            </div>

            <p className="text-xs text-slate-400">
              Envio direto de payloads estruturados em JSON via integração de sistema externo, webhook ou cliente REST.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Payload JSON (Pacote de Entidades ou Array)
                </label>
                <textarea
                  value={restJsonText}
                  onChange={(e) => setRestJsonText(e.target.value)}
                  rows={8}
                  className="w-full bg-[#1C2532] border border-[#263342] rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#FFAA00]"
                />
              </div>

              <button
                onClick={handleProcessRestJson}
                disabled={loading || !restJsonText.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4" />
                Executar Ingestão REST
              </button>
            </div>
          </div>

          {/* Result Card */}
          {uploadResult && (
            <div className="lg:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <h4 className="text-sm font-bold text-emerald-200">
                    Lote Processado: {uploadResult.batchCode}
                  </h4>
                </div>
                <span className="text-xs font-mono text-emerald-300">
                  {uploadResult.totalRecordsProcessed} registros normalizados
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {Object.entries(uploadResult.details).map(([key, count]) => (
                  <div key={key} className="rounded-lg bg-slate-900/80 p-3 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">{key}</span>
                    <span className="text-base font-bold text-white">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PEDIDOS DE VENDA (PVs) */}
      {activeSubTab === 'pvs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={loadData}
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Filtrar
            </button>
          </div>

          {salesOrders.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <FileSpreadsheet className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Nenhum Pedido de Venda registrado</p>
              <p className="text-xs text-slate-500 mt-1">
                Utilize a aba de Ingestão para importar o arquivo CSV ou payload REST de Pedidos de Venda do Protheus.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Número PV</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Itens</th>
                    <th className="py-3 px-4">Emissão</th>
                    <th className="py-3 px-4">Entrega</th>
                    <th className="py-3 px-4">Status Protheus</th>
                    <th className="py-3 px-4 text-right">Rastreabilidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {salesOrders.map((pv) => (
                    <tr key={pv.numeroPv} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-amber-400">
                        {pv.numeroPv}
                      </td>
                      <td className="py-3 px-4 text-slate-200 font-medium">
                        {pv.clienteNome}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {pv.itemsCount} {pv.itemsCount === 1 ? 'item' : 'itens'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono">{pv.dataEmissao}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono">{pv.dataEntrega}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
                          {pv.statusProtheus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenPvDetail(pv.numeroPv)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver Vínculos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ORDENS DE PRODUÇÃO (OPs) */}
      {activeSubTab === 'ops' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={loadData}
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Filtrar
            </button>
          </div>

          {productionOrders.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <GitBranch className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Nenhuma Ordem de Produção registrada</p>
              <p className="text-xs text-slate-500 mt-1">
                Utilize a aba de Ingestão para importar arquivos ou payloads de Ordens de Produção (SC2) do Protheus.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Número OP</th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">PV Vinculado</th>
                    <th className="py-3 px-4">Qtd Planejada</th>
                    <th className="py-3 px-4">Qtd Produzida</th>
                    <th className="py-3 px-4">Etapa Operacional</th>
                    <th className="py-3 px-4 text-right">Rastreabilidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {productionOrders.map((op) => (
                    <tr key={op.numeroOp} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-amber-400">
                        {op.numeroOp}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-300 font-medium block">
                          {op.codigoProduto}
                        </span>
                        {op.descricaoProduto && (
                          <span className="text-[11px] text-slate-400 block">
                            {op.descricaoProduto}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {op.numeroPv ? (
                          <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold">
                            PV {op.numeroPv} {op.itemPv && `(Item ${op.itemPv})`}
                          </span>
                        ) : (
                          <span className="text-slate-500">Sem PV direto</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-200">
                        {Number(op.quantidadePlanejada)}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">
                        {Number(op.quantidadeProduzida)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/40 border border-amber-500/30 text-amber-300">
                          {op.etapaAtual || 'Etapa não informada'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenOpDetail(op.numeroOp)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Rastrear
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AUDITORIA DE LOTES */}
      {activeSubTab === 'batches' && (
        <div className="space-y-4">
          {batches.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <Clock className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Nenhum lote ingerido até o momento</p>
              <p className="text-xs text-slate-500 mt-1">
                O histórico de importação registrará automaticamente cada ingestão via arquivo ou API REST.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Código do Lote</th>
                    <th className="py-3 px-4">Origem</th>
                    <th className="py-3 px-4">Entidade</th>
                    <th className="py-3 px-4">Registros</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Resumo da Execução</th>
                    <th className="py-3 px-4">Data / Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                        {b.batchCode}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                          {b.sourceType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">{b.entityType}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        {b.recordsCount}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            b.status === 'PROCESSED'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-[11px] font-mono truncate max-w-xs">
                        {b.summary || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {new Date(b.createdAt).toLocaleString(getIntlLocale())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'mock' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-cyan-500/20 bg-[#151C25] p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{translateText('Validação de leitura da API simulada')}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {translateText('Confere conexão, origem, campos e paginação da API local usando no máximo duas linhas por conjunto.')}
                  </p>
                </div>
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {translateText(loading ? 'Verificando…' : 'Verificar API simulada')}
              </button>
            </div>
            <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
              {translateText('Somente leitura: não executa ingestão, não envia POST e não grava dados operacionais.')}
            </div>
          </section>

          {mockValidationError && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{translateText('Não foi possível validar a API simulada')}</div>
              <p className="mt-1 text-xs text-rose-200/80">{mockValidationError}</p>
            </div>
          )}

          {mockValidation && (
            <>
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {mockValidation.status === 'READY'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {mockValidation.status === 'READY'
                          ? translateText('Leitura validada')
                          : mockValidation.status === 'LIMITED'
                            ? translateText('API simulada acessível com limitações')
                            : translateText('Validação bloqueada')}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {translateText('Última verificação:')} {new Date(mockValidation.checkedAt).toLocaleString(getIntlLocale())}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1 text-cyan-200">{translateText('SIMULAÇÃO')}</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-emerald-200">{translateText('SOMENTE LEITURA')}</span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-slate-300">{translateText('Sem gravação no banco')}</span>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">{translateText('Conjunto')}</th>
                        <th className="px-4 py-3">{translateText('Arquivo de origem')}</th>
                        <th className="px-4 py-3 text-right">{translateText('Registros na origem')}</th>
                        <th className="px-4 py-3 text-center">{translateText('Cursor')}</th>
                        <th className="px-4 py-3 text-center">{translateText('Leitura')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {mockValidation.datasets.map((dataset) => (
                        <tr key={dataset.entity}>
                          <td className="px-4 py-3 font-medium text-slate-200">{translateText(mockDatasetLabels[dataset.entity] || dataset.entity)}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{dataset.sourceFile || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">
                            {dataset.sourceRows == null ? '—' : dataset.sourceRows.toLocaleString(getIntlLocale())}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {dataset.cursorPaginationVerified
                              ? <span className="text-emerald-300">{translateText('Validado')}</span>
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {dataset.status === 'OK'
                              ? <span className="text-emerald-300">{translateText('OK')}</span>
                              : <span className="text-rose-300" title={dataset.error}>{translateText('Falhou')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
                  {translateText('A verificação de tela testa conectividade e duas páginas. A pré-validação completa dos relatórios continua disponível no fluxo de desenvolvimento.')}
                </p>
              </section>

              <section className="rounded-xl border border-violet-500/20 bg-slate-900/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{translateText('Consistência do fluxo de dados')}</h4>
                    <p className="mt-1 text-[11px] text-slate-400">{translateText('Percorre todas as páginas e verifica chaves, referências e campos entre os relatórios. Pode levar alguns minutos.')}</p>
                  </div>
                  <button type="button" onClick={() => void runMockFlowCheck()} disabled={mockFlowCheckLoading} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${mockFlowCheckLoading ? 'animate-spin' : ''}`} />
                    {translateText(mockFlowCheckLoading ? 'Verificando todos os registros…' : 'Executar verificação completa')}
                  </button>
                </div>
                {mockFlowCheckError && <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">{mockFlowCheckError}</p>}
                {mockFlowCheck && (
                  <div className="mt-4 space-y-3">
                    <div className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-xs ${mockFlowCheck.status === 'READY' ? 'border border-emerald-500/20 bg-emerald-950/20 text-emerald-200' : 'border border-amber-500/20 bg-amber-950/20 text-amber-100'}`}>
                      {mockFlowCheck.status === 'READY' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      <strong>{mockFlowCheck.status === 'READY' ? translateText('Fluxo validado para a simulação') : translateText('Fluxo bloqueado para integração real')}</strong>
                      <span className="text-[11px] opacity-80">{translateText('Somente leitura · banco não alterado')}</span>
                    </div>
                    {mockFlowCheck.blockers.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">{translateText('Pontos que precisam de definição')}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">{mockFlowCheck.blockers.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                      </div>
                    )}
                    {mockFlowCheck.warnings.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{translateText('Observações da verificação')}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">{mockFlowCheck.warnings.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500">{translateText('Este resultado valida a qualidade das amostras simuladas. Não confirma conectividade nem compatibilidade com uma API real do Protheus.')}</p>
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-xl border border-cyan-500/20 bg-[#151C25]">
                <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{translateText('Prévia dos dados de origem')}</h4>
                    <p className="mt-1 text-[11px] text-slate-400">{translateText('Amostra somente leitura dos relatórios; estes registros não são gravados no sistema.')}</p>
                  </div>
                  <select
                    value={mockPreviewEntity}
                    onChange={(event) => {
                      const entity = event.target.value;
                      setMockPreviewEntity(entity);
                      void loadMockPreview(entity);
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                    aria-label={translateText('Conjunto de dados')}
                  >
                    {(mockValidation?.datasets || []).filter((dataset) => dataset.status === 'OK').map((dataset) => (
                      <option key={dataset.entity} value={dataset.entity}>{translateText(mockDatasetLabels[dataset.entity] || dataset.entity)}</option>
                    ))}
                  </select>
                </div>
                {mockPreviewError && <p role="alert" className="px-4 py-3 text-xs text-rose-300">{mockPreviewError}</p>}
                {mockPreview && (
                  <>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-800 px-4 py-3 text-[11px] text-slate-400">
                      <span>{translateText('Origem')}: <strong className="font-medium text-slate-200">{mockPreview.sourceFile} · {mockPreview.sourceSheet}</strong></span>
                      <span>{translateText('Registros na origem')}: <strong className="font-mono text-slate-200">{mockPreview.sourceRows.toLocaleString(getIntlLocale())}</strong></span>
                      <span>{translateText('Exibidos')}: <strong className="font-mono text-slate-200">{mockPreview.records.length.toLocaleString(getIntlLocale())}</strong></span>
                    </div>
                    {mockPreview.records.length ? (
                      <div className="max-h-[520px] overflow-auto">
                        <table className="w-full min-w-max text-left text-xs">
                          <thead className="sticky top-0 border-b border-slate-800 bg-slate-950 text-[10px] uppercase tracking-wide text-slate-400">
                            <tr>{Object.keys(mockPreview.records[0]).map((field) => <th key={field} className="whitespace-nowrap px-3 py-2">{field}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {mockPreview.records.map((record, index) => (
                              <tr key={`${mockPreview.page}-${index}`} className="hover:bg-slate-800/40">
                                {Object.keys(mockPreview.records[0]).map((field) => {
                                  const value = record[field];
                                  const shown = value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
                                  return <td key={field} className="max-w-[320px] whitespace-nowrap px-3 py-2 text-slate-300" title={shown}>{shown}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="px-4 py-6 text-center text-xs text-slate-400">{translateText('A origem não contém registros para este conjunto.')}</p>}
                    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
                      <span className="text-[11px] text-slate-500">{translateText('Somente leitura · nenhuma gravação no banco')}</span>
                      {mockPreview.nextCursor && <button disabled={mockPreviewLoading} onClick={() => void loadMockPreview(mockPreviewEntity, mockPreview.nextCursor || undefined, true)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-50">{translateText(mockPreviewLoading ? 'Carregando…' : 'Carregar mais registros')}</button>}
                      {mockPreviewLoading && !mockPreview.nextCursor && <span className="text-xs text-cyan-200">{translateText('Carregando…')}</span>}
                    </div>
                  </>
                )}
                {!mockPreview && mockPreviewLoading && <p className="px-4 py-6 text-center text-xs text-cyan-200">{translateText('Carregando…')}</p>}
              </section>

              {mockValidation.limitations.length > 0 && (
                <section className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-4">
                  <h4 className="text-xs font-semibold text-amber-200">{translateText('Limitações encontradas')}</h4>
                  <ul className="mt-2 space-y-2">
                    {mockValidation.limitations.map((limitation) => (
                      <li key={limitation.endpoint} className="text-xs text-amber-100/80">
                        <span className="font-mono text-[10px] text-amber-300">{limitation.endpoint}</span>
                        <span className="ml-2">{limitation.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL: DETALHES DO PEDIDO DE VENDA (PV) & VÍNCULOS COM OPs */}
      {selectedPvDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Pedido de Venda: {selectedPvDetail.pvHeader.numeroPv}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cliente: {selectedPvDetail.pvHeader.clienteNome}{' '}
                    {selectedPvDetail.pvHeader.clienteCnpj && `| CNPJ: ${selectedPvDetail.pvHeader.clienteCnpj}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPvDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Items do PV */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">
                  Itens do Pedido de Venda (SC6)
                </h4>
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-mono">
                      <tr>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-3">Descrição</th>
                        <th className="py-2.5 px-3">Qtd Pedida</th>
                        <th className="py-2.5 px-3">Qtd Entregue</th>
                        <th className="py-2.5 px-3">Previsão Entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedPvDetail.items.map((it: any) => (
                        <tr key={it.id}>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-200">
                            {it.itemPv}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-amber-400">
                            {it.codigoProduto}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{it.descricaoProduto || '-'}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-white">
                            {Number(it.quantidadePedida)} {it.unidadeMedida}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-400">
                            {Number(it.quantidadeEntregue)} {it.unidadeMedida}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{it.dataEntrega}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ordens de Produção Vinculadas */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">
                  Ordens de Produção Vinculadas (SC2)
                </h4>
                {selectedPvDetail.linkedProductionOrders.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                    Nenhuma ordem de produção vinculada a este pedido no ERP Protheus.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono">
                        <tr>
                          <th className="py-2.5 px-3">Número OP</th>
                          <th className="py-2.5 px-3">Produto</th>
                          <th className="py-2.5 px-3">Qtd Planejada</th>
                          <th className="py-2.5 px-3">Qtd Produzida</th>
                          <th className="py-2.5 px-3">Etapa Atual</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedPvDetail.linkedProductionOrders.map((op: any) => (
                          <tr key={op.id}>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                              {op.numeroOp}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-200">
                              {op.codigoProduto}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-white">
                              {Number(op.quantidadePlanejada)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                              {Number(op.quantidadeProduzida)}
                            </td>
                            <td className="py-2.5 px-3 text-amber-300 font-medium">
                              {op.etapaAtual || 'Etapa não informada'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedPvDetail(null);
                                  handleOpenOpDetail(op.numeroOp);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px]"
                              >
                                Rastrear OP
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RASTREABILIDADE TOTAL DA OP (ROTEIRO, BOM, APONTAMENTOS) */}
      {selectedOpDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <GitBranch className="h-6 w-6 text-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Rastreabilidade da OP: {selectedOpDetail.order.numeroOp}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Produto: {selectedOpDetail.order.codigoProduto}{' '}
                    {selectedOpDetail.order.descricaoProduto && `- ${selectedOpDetail.order.descricaoProduto}`}
                    {selectedOpDetail.order.numeroPv && ` | PV: ${selectedOpDetail.order.numeroPv}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOpDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status Header Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">
                    Etapa Atual Calculada
                  </span>
                  <span className="text-xs font-bold text-amber-300 block mt-1">
                    {selectedOpDetail.order.etapaAtual || 'Etapa não informada'}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">
                    Qtd Planejada
                  </span>
                  <span className="text-sm font-bold font-mono text-white block mt-1">
                    {Number(selectedOpDetail.order.quantidadePlanejada)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">
                    Qtd Produzida
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-400 block mt-1">
                    {Number(selectedOpDetail.order.quantidadeProduzida)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">
                    Saldo a Produzir
                  </span>
                  <span className="text-sm font-bold font-mono text-rose-400 block mt-1">
                    {Number(selectedOpDetail.order.saldoAProduzir)}
                  </span>
                </div>
              </div>

              {/* Roteiro de Fabricação (SG2) com visual de etapas */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-cyan-400" />
                  Roteiro de Fabricação & Operações (SG2)
                </h4>
                {selectedOpDetail.routings.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                    Nenhum roteiro cadastrado no Protheus para o produto {selectedOpDetail.order.codigoProduto}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedOpDetail.routings.map((rt: any, idx: number) => {
                      const hasAppointments = selectedOpDetail.appointments.some(
                        (a: any) => a.sequenciaOperacao === rt.sequenciaOperacao
                      );
                      return (
                        <div
                          key={rt.id}
                          className={`flex items-center justify-between p-3 rounded-xl border ${
                            hasAppointments
                              ? 'border-emerald-500/40 bg-emerald-950/20'
                              : 'border-slate-800 bg-slate-950/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`h-6 w-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                                hasAppointments
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {rt.sequenciaOperacao}
                            </span>
                            <div>
                              <span className="text-xs font-semibold text-slate-200">
                                {rt.descricaoOperacao}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                <span>Código: {rt.codigoOperacao}</span>
                                {rt.postoTrabalho && <span>| Posto: {rt.postoTrabalho}</span>}
                                {rt.tempoPadraoMinutos && (
                                  <span>| Tempo Padrão: {rt.tempoPadraoMinutos} min</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            {hasAppointments ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Apontado
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-slate-500">
                                Aguardando Apontamento
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Apontamentos de Produção (SH6) */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  Histórico de Apontamentos de Chão de Fábrica (SH6)
                </h4>
                {selectedOpDetail.appointments.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                    Nenhum apontamento de chão de fábrica registrado até o momento para esta OP.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono">
                        <tr>
                          <th className="py-2.5 px-3">Sequência</th>
                          <th className="py-2.5 px-3">Operação</th>
                          <th className="py-2.5 px-3">Operador</th>
                          <th className="py-2.5 px-3">Posto / Recurso</th>
                          <th className="py-2.5 px-3">Qtd Produzida</th>
                          <th className="py-2.5 px-3">Refugo</th>
                          <th className="py-2.5 px-3">Data Apontamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedOpDetail.appointments.map((ap: any) => (
                          <tr key={ap.id}>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                              {ap.sequenciaOperacao}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {ap.descricaoOperacao || ap.codigoOperacao || '-'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">{ap.operador || '-'}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {ap.postoTrabalho || '-'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                              {Number(ap.quantidadeProduzida)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-rose-400">
                              {Number(ap.quantidadeRefugo)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {ap.dataApontamento} {ap.horaInicio && `às ${ap.horaInicio}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Estrutura do Produto / BOM (SG1) */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono flex items-center gap-2">
                  <Layers className="h-4 w-4 text-amber-400" />
                  Estrutura do Produto / Lista de Materiais (SG1)
                </h4>
                {selectedOpDetail.structure.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                    Nenhuma estrutura cadastrada para este produto no Protheus.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono">
                        <tr>
                          <th className="py-2.5 px-3">Componente</th>
                          <th className="py-2.5 px-3">Descrição</th>
                          <th className="py-2.5 px-3">Qtd Necessária (Unitária)</th>
                          <th className="py-2.5 px-3">Qtd Total para esta OP</th>
                          <th className="py-2.5 px-3">Perda (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedOpDetail.structure.map((st: any) => {
                          const totalNecessario =
                            Number(st.quantidadeNecessaria) *
                            Number(selectedOpDetail.order.quantidadePlanejada);
                          return (
                            <tr key={st.id}>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                                {st.codigoComponente}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                {st.descricaoComponente || '-'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-300">
                                {Number(st.quantidadeNecessaria)} {st.unidadeComponente}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-white">
                                {totalNecessario.toFixed(2)} {st.unidadeComponente}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                {st.perdaPercentual ? `${st.perdaPercentual}%` : '0%'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
