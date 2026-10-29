import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, type ProtheusMockDataPage } from '../../api.ts';

interface ProtheusSimulationTableBrowserProps {
  entity: 'commitments' | 'resources';
  tableLabel: string;
  onBack: () => void;
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const ProtheusSimulationTableBrowser: React.FC<ProtheusSimulationTableBrowserProps> = ({ entity, tableLabel, onBack }) => {
  const [page, setPage] = useState<ProtheusMockDataPage | null>(null);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (cursor?: string, append = false) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getProtheusMockData(entity, cursor, 25);
      if (result.mode !== 'SIMULATION_READ_ONLY' || result.simulation !== true || result.readOnly !== true
        || result.writesToApplication !== false || result.databaseWritePerformed !== false
        || !Array.isArray(result.records) || !Number.isSafeInteger(result.sourceRows)) {
        throw new Error('A origem retornou uma resposta incompleta ou incompatível com a consulta somente leitura.');
      }
      setPage(result);
      setRecords((current) => append ? [...current, ...result.records] : result.records);
    } catch (requestError: any) {
      setPage(null);
      setRecords([]);
      setError(requestError?.message || 'Não foi possível consultar a origem simulada. Confirme se a API local está ativa e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const columns = records.length > 0 ? Object.keys(records[0]) : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg border border-[#2D3A4B] bg-[#1D2733] p-2 text-slate-300 transition hover:bg-[#253242]" aria-label="Voltar às tabelas">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-lg font-bold text-white">Consulta simulada: {tableLabel}</h3>
            <p className="text-xs text-slate-400">Consulta somente leitura à API local, alimentada pelo relatório selecionado.</p>
          </div>
        </div>
        <button onClick={() => void loadPage()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2D3A4B] bg-[#1D2733] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#253242] disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 px-4 py-3 text-xs text-cyan-100">
        <span className="inline-flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Simulação · somente leitura</span>
        {page && <>
          <span>Origem: <strong className="font-medium text-white">{page.sourceFile} · {page.sourceSheet}</strong></span>
          <span>Registros na origem: <strong className="font-mono text-white">{page.sourceRows.toLocaleString('pt-BR')}</strong></span>
          <span>Carregados: <strong className="font-mono text-white">{records.length.toLocaleString('pt-BR')}</strong></span>
        </>}
      </div>

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
        Esses registros vêm da API simulada baseada em relatório Excel. Eles não são gravados no banco operacional, não comprovam conexão ao Protheus real e não devem ser tratados como carga oficial.
      </p>

      <div className="overflow-hidden rounded-xl border border-[#202936] bg-[#141B24]">
        {error && <div className="m-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">{error}</div>}
        {!error && loading && records.length === 0 && <p className="px-4 py-10 text-center text-xs text-slate-400">Consultando a API simulada…</p>}
        {!error && !loading && records.length === 0 && <p className="px-4 py-10 text-center text-xs text-slate-400">A origem respondeu sem registros para esta consulta.</p>}
        {records.length > 0 && (
          <div className="max-h-[58vh] overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#1B2430] text-[10px] uppercase tracking-wide text-slate-400">
                <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-[#2D3A4B] px-3 py-2.5">{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#202936]">
                {records.map((record, index) => <tr key={`${record.sourceCompositeKey ?? record.resourceCode ?? record.productionOrder ?? index}-${index}`} className="hover:bg-[#1A222D]">
                  {columns.map((column) => <td key={column} className="max-w-[320px] whitespace-nowrap px-3 py-2.5 text-slate-300" title={formatValue(record[column])}>{formatValue(record[column])}</td>)}
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
        {page?.nextCursor && <div className="flex justify-center border-t border-[#202936] p-3">
          <button onClick={() => void loadPage(page.nextCursor || undefined, true)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">
            <ChevronDown className="h-4 w-4" /> {loading ? 'Carregando…' : 'Carregar próxima página'}
          </button>
        </div>}
      </div>
    </section>
  );
};
