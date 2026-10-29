import React, { useState } from 'react';
import {
  X,
  Printer,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Building,
  User,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Package,
} from 'lucide-react';

interface TraceabilityDetailModalProps {
  detail: any;
  onClose: () => void;
}

export const TraceabilityDetailModal: React.FC<TraceabilityDetailModalProps> = ({
  detail,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'roteiro' | 'apontamentos' | 'estrutura' | 'pv'>('roteiro');

  if (!detail) return null;
  const { op, produto, estrutura, roteiroComProgresso, apontamentos, pedidoVendaCompleto } = detail;

  const handlePrint = () => {
    window.print();
  };

  const getPrazoBadge = (status: string, dias: number | null) => {
    if (status === 'CONCLUIDO') {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Concluída</span>;
    }
    if (status === 'ATRASADO') {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          Atrasado ({Math.abs(dias || 0)}d)
        </span>
      );
    }
    if (status === 'RISCO_ATRASO') {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          Risco de Atraso ({dias}d)
        </span>
      );
    }
    if (status === 'NO_PRAZO') {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
          No Prazo ({dias}d)
        </span>
      );
    }
    return <span className="px-2 py-0.5 rounded text-xs text-slate-400 bg-slate-800">Sem previsão</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:m-0 print:max-h-none print:border-none print:bg-white print:text-black">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/90 print:bg-white print:border-b-2">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                OP Protheus: {op.numeroOp}
              </span>
              {getPrazoBadge(op.statusPrazo, op.diasAtrasoOuFolga)}
              <span className="text-xs text-slate-400 font-mono">Status: {op.statusProtheusOp}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2 print:text-black">
              {op.codigoProduto} - {op.descricaoProduto}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-4 print:text-slate-600">
              <span>Emissão: <strong className="text-slate-200 print:text-black font-mono">{op.dataEmissaoOp}</strong></span>
              <span>Previsão Fim: <strong className="text-slate-200 print:text-black font-mono">{op.dataPrevisaoFimOp}</strong></span>
              {op.etapaAtual && (
                <span>Etapa Atual: <strong className="text-amber-400 print:text-black font-medium">{op.etapaAtual}</strong></span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1.5 transition"
              title="Imprimir Ficha de Rastreabilidade"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-950/60 border-b border-slate-800 text-xs print:grid-cols-5 print:bg-slate-100">
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Qtd Planejada</span>
            <span className="text-base font-bold text-slate-100 font-mono print:text-black">
              {op.quantidadePlanejada.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Qtd Produzida</span>
            <span className="text-base font-bold text-emerald-400 font-mono print:text-black">
              {op.quantidadeProduzida.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Saldo a Produzir</span>
            <span className="text-base font-bold text-amber-400 font-mono print:text-black">
              {op.saldoAProduzir.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Refugo / Perda</span>
            <span className={`text-base font-bold font-mono ${op.quantidadeRefugo > 0 ? 'text-rose-400' : 'text-slate-400'} print:text-black`}>
              {op.quantidadeRefugo.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 col-span-2 md:col-span-1">
            <span className="text-slate-400 text-[11px] block">Avanço Físico</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"
                  style={{ width: `${op.percentualConclusao}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-slate-200 print:text-black">{op.percentualConclusao}%</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900 px-5 gap-2 print:hidden">
          <button
            onClick={() => setActiveTab('roteiro')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'roteiro'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            Roteiro & Operações ({roteiroComProgresso?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('apontamentos')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'apontamentos'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4" />
            Histórico Apontamentos ({apontamentos?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('estrutura')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'estrutura'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-4 w-4" />
            Estrutura BOM ({estrutura?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('pv')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'pv'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="h-4 w-4" />
            Pedido de Venda {op.numeroPv ? `(PV ${op.numeroPv})` : '(Sem vínculo)'}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 print:p-0">
          {/* TAB 1: ROTEIRO */}
          {(activeTab === 'roteiro' || typeof window !== 'undefined') && (
            <div className={activeTab === 'roteiro' ? 'block' : 'hidden print:block'}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 print:text-black">
                  <span>Sequenciamento Operacional & Avanço Físico (SG2 + SH6)</span>
                </h3>
                <span className="text-xs text-slate-400">Roteiro: {op.codigoRoteiro || 'Padrão'}</span>
              </div>

              {(!roteiroComProgresso || roteiroComProgresso.length === 0) ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  Nenhum roteiro de fabricação registrado para o produto {op.codigoProduto} no Protheus.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Seq</th>
                        <th className="py-2.5 px-3">Operação</th>
                        <th className="py-2.5 px-3">Posto / Recurso</th>
                        <th className="py-2.5 px-3 text-right">Qtd Apontada</th>
                        <th className="py-2.5 px-3 text-right">Refugo</th>
                        <th className="py-2.5 px-3 text-center">Status da Etapa</th>
                        <th className="py-2.5 px-3">Operadores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {roteiroComProgresso.map((opItem: any, idx: number) => {
                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-800/30 transition ${
                              opItem.emAndamento ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="py-3 px-3 font-mono font-bold text-amber-400">{opItem.sequenciaOperacao}</td>
                            <td className="py-3 px-3">
                              <span className="font-semibold text-slate-200">{opItem.codigoOperacao}</span>
                              <p className="text-slate-400 text-[11px]">{opItem.descricaoOperacao}</p>
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-300">{opItem.postoTrabalho || '-'}</td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                              {opItem.quantidadeApontada.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-rose-400">
                              {opItem.quantidadeRefugo > 0 ? opItem.quantidadeRefugo.toLocaleString('pt-BR') : '-'}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {opItem.concluida ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  <CheckCircle2 className="h-3 w-3" /> Concluída
                                </span>
                              ) : opItem.emAndamento ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                                  <Clock className="h-3 w-3" /> Em Andamento
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500 font-mono">Pendente</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-400 text-[11px]">
                              {opItem.operadores?.length > 0 ? opItem.operadores.join(', ') : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: APONTAMENTOS */}
          {(activeTab === 'apontamentos' || typeof window !== 'undefined') && (
            <div className={activeTab === 'apontamentos' ? 'block' : 'hidden print:block print:mt-6'}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 print:text-black">
                  <span>Registros Físicos de Apontamento de Produção (SH6)</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Total de Lançamentos: {apontamentos?.length || 0}</span>
              </div>

              {(!apontamentos || apontamentos.length === 0) ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  Nenhum apontamento físico registrado para esta ordem no Protheus.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Data / Hora</th>
                        <th className="py-2.5 px-3">Seq / Operação</th>
                        <th className="py-2.5 px-3">Posto</th>
                        <th className="py-2.5 px-3">Operador</th>
                        <th className="py-2.5 px-3 text-right">Qtd Produzida</th>
                        <th className="py-2.5 px-3 text-right">Refugo</th>
                        <th className="py-2.5 px-3">Tipo / Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {apontamentos.map((a: any) => (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            {a.dataApontamento} {a.horaInicio ? `${a.horaInicio} - ${a.horaFim || ''}` : ''}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-amber-400 mr-2">{a.sequenciaOperacao}</span>
                            <span className="text-slate-300">{a.descricaoOperacao || a.codigoOperacao || '-'}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{a.postoTrabalho || '-'}</td>
                          <td className="py-2.5 px-3 text-slate-300 flex items-center gap-1.5">
                            <User className="h-3 w-3 text-slate-500" />
                            {a.operador || 'Operador não informado'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                            {a.quantidadeProduzida.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                            {a.quantidadeRefugo > 0 ? a.quantidadeRefugo.toLocaleString('pt-BR') : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {a.tipoApontamento}
                            {a.motivoRefugo ? ` (${a.motivoRefugo})` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ESTRUTURA BOM */}
          {(activeTab === 'estrutura' || typeof window !== 'undefined') && (
            <div className={activeTab === 'estrutura' ? 'block' : 'hidden print:block print:mt-6'}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 print:text-black">
                  <span>Estrutura de Materiais e Subconjuntos (SG1)</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Produto Pai: {op.codigoProduto}</span>
              </div>

              {(!estrutura || estrutura.length === 0) ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  Nenhuma lista de materiais (BOM) registrada para o produto {op.codigoProduto} no Protheus.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Componente / Insumo</th>
                        <th className="py-2.5 px-3 text-right">Qtd Unitária</th>
                        <th className="py-2.5 px-3 text-right">Perda %</th>
                        <th className="py-2.5 px-3">OP Filha de Subconjunto</th>
                        <th className="py-2.5 px-3">Etapa Atual da Filha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {estrutura.map((comp: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-semibold text-slate-200">{comp.codigoComponente}</span>
                            <p className="text-slate-400 text-[11px]">{comp.descricaoComponente || 'Sem descrição'}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                            {comp.quantidadeNecessaria} {comp.unidadeComponente}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            {comp.perdaPercentual ? `${comp.perdaPercentual}%` : '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            {comp.opFilhaRelacionada ? (
                              <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {comp.opFilhaRelacionada.numeroOp}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Insumo / Matéria-prima</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-xs">
                            {comp.opFilhaRelacionada ? (
                              <span className="text-slate-300 font-medium">
                                {comp.opFilhaRelacionada.etapaAtual} ({comp.opFilhaRelacionada.quantidadeProduzida}/{comp.opFilhaRelacionada.quantidadePlanejada})
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PEDIDO DE VENDA */}
          {(activeTab === 'pv' || typeof window !== 'undefined') && (
            <div className={activeTab === 'pv' ? 'block' : 'hidden print:block print:mt-6'}>
              {!pedidoVendaCompleto ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                  Esta ordem de produção não possui vínculo direto informado a um Pedido de Venda (SC5/SC6) no Protheus (Pode ser OP para estoque ou intermediária).
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Número PV Protheus</span>
                      <span className="font-mono text-base font-bold text-amber-400">{pedidoVendaCompleto.numeroPv}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Cliente / Razão Social</span>
                      <span className="font-semibold text-slate-200">{pedidoVendaCompleto.clienteNome}</span>
                      {pedidoVendaCompleto.clienteCnpj && (
                        <p className="font-mono text-slate-400 text-[10px]">CNPJ: {pedidoVendaCompleto.clienteCnpj}</p>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Data Emissão</span>
                      <span className="font-mono text-slate-200">{pedidoVendaCompleto.dataEmissao}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Data de Entrega Acordada</span>
                      <span className="font-mono font-bold text-blue-400">{pedidoVendaCompleto.dataEntrega}</span>
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Itens do Pedido de Venda
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Item</th>
                          <th className="py-2.5 px-3">Produto</th>
                          <th className="py-2.5 px-3 text-right">Qtd Pedida</th>
                          <th className="py-2.5 px-3 text-right">Qtd Entregue</th>
                          <th className="py-2.5 px-3">Data Entrega</th>
                          <th className="py-2.5 px-3">OPs Vinculadas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {pedidoVendaCompleto.itens.map((it: any, idx: number) => (
                          <tr key={idx} className={it.itemPv === op.itemPv ? 'bg-amber-500/10' : ''}>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{it.itemPv}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono font-semibold text-slate-200">{it.codigoProduto}</span>
                              <p className="text-slate-400 text-[11px]">{it.descricaoProduto || '-'}</p>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-200">
                              {it.quantidadePedida.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                              {it.quantidadeEntregue.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">{it.dataEntrega}</td>
                            <td className="py-2.5 px-3">
                              {it.opsRelacionadas?.length > 0 ? (
                                <span className="font-mono text-xs font-bold text-amber-300 bg-slate-800 px-2 py-0.5 rounded">
                                  {it.opsRelacionadas.join(', ')}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">Nenhuma OP vinculada</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400 print:hidden">
          <span>Origem dos Dados: Registros Reais TOTVS Protheus (Tabelas SC2, SC5, SC6, SG1, SG2, SH6)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
