import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { api } from '../../api.ts';

interface ProtheusTableBrowserProps {
  entity: string;
  tableLabel: string;
  onBack: () => void;
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const ProtheusTableBrowser: React.FC<ProtheusTableBrowserProps> = ({ entity, tableLabel, onBack }) => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 25;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getProtheusTableData(entity, { search, page, pageSize });
      setRows(result.rows);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || 'Não foi possível consultar os registros.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entity, page, search]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg border border-[#2D3A4B] bg-[#1D2733] p-2 text-slate-300 transition hover:bg-[#253242]" aria-label="Voltar às tabelas">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-lg font-bold text-white">Consulta da tabela {tableLabel}</h3>
            <p className="text-xs text-slate-400">Registros normalizados armazenados no espelho local do Protheus.</p>
          </div>
        </div>
        <button onClick={() => void loadRows()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2D3A4B] bg-[#1D2733] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#253242] disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <form onSubmit={submitSearch} className="flex flex-col gap-2 rounded-xl border border-[#202936] bg-[#141B24] p-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por código, descrição ou identificador" className="w-full rounded-lg border border-[#2D3A4B] bg-[#0F141C] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-[#FFAA00]" />
        </div>
        <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFAA00] px-4 py-2 text-xs font-bold text-[#151C25] transition hover:bg-[#e69900] disabled:opacity-60 sm:w-auto">
          <Search className="h-3.5 w-3.5" /> Buscar
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#202936] bg-[#141B24]">
        <div className="flex items-center justify-between border-b border-[#202936] px-4 py-3 text-xs text-slate-400">
          <span>{loading ? 'Consultando registros…' : `${total.toLocaleString('pt-BR')} registros encontrados`}</span>
          <span>Página {page} de {totalPages}</span>
        </div>
        {error ? <p role="alert" className="m-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p> : null}
        {!error && !loading && rows.length === 0 ? <p className="p-10 text-center text-xs text-slate-500">Nenhum registro nesta tabela para os filtros informados.</p> : null}
        {rows.length > 0 && (
          <div className="max-h-[58vh] overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#1B2430] text-[10px] uppercase tracking-wide text-slate-400">
                <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-[#2D3A4B] px-3 py-2.5">{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#202936]">
                {rows.map((row, index) => <tr key={String(row.id ?? `${page}-${index}`)} className="hover:bg-[#1A222D]">
                  {columns.map((column) => <td key={column} className="max-w-[320px] whitespace-nowrap px-3 py-2.5 text-slate-300" title={formatValue(row[column])}>{formatValue(row[column])}</td>)}
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[#202936] p-3">
          <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex items-center gap-1 rounded-md border border-[#2D3A4B] px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Anterior</button>
          <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="inline-flex items-center gap-1 rounded-md border border-[#2D3A4B] px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40">Próxima <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
};
