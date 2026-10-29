import React from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.tsx';

interface AuditViewProps {
  logs: any[];
  onReload: () => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ logs, onReload }) => {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#151C25]">Auditoria de Eventos</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Rastreamento de ações, apontamentos e alterações de status industrial.
          </p>
        </div>
        <button
          onClick={onReload}
          className="px-3.5 py-2 bg-[#1C2532] hover:bg-[#253242] text-slate-200 border border-[#263342] rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
        >
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum evento registrado."
        />
      ) : (
        <div className="bg-[#151C25] border border-[#202936] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#121820] text-slate-400 uppercase font-semibold border-b border-[#202936]">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Entidade</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">IP</th>
                <th className="py-3 px-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202936]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#1C2532] transition">
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#FFAA00]">{log.action}</td>
                  <td className="py-3 px-4 font-semibold text-white">{log.entity}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {log.userEmail || log.userId || '—'}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">{log.ipAddress || '—'}</td>
                  <td className="py-3 px-4 max-w-xs truncate font-mono text-slate-400">
                    {log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
