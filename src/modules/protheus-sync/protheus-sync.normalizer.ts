import {
  NormalizedProduct,
  NormalizedStructure,
  NormalizedRouting,
  NormalizedSalesOrder,
  NormalizedProductionOrder,
  NormalizedAppointment,
  ProtheusEntityType,
} from './protheus-sync.types.ts';

export class ProtheusNormalizer {
  public static parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    // Detect delimiter (; or , or \t)
    const firstLine = lines[0];
    const semiCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ',';
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          if (inQuotes && line[i + 1] === char) {
            current += char;
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (inQuotes) {
        throw new Error('CSV contém campo entre aspas com quebra de linha, formato ainda não suportado. Exporte novamente sem quebra de linha em células.');
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(firstLine).map((h) => h.toUpperCase().replace(/^["']|["']$/g, '').trim());
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      if (values.length !== headers.length) {
        throw new Error(`CSV inválido na linha ${i + 1}: esperadas ${headers.length} colunas, recebidas ${values.length}.`);
      }
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index].replace(/^["']|["']$/g, '').trim() : '';
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  public static normalizeNumber(value: any, defaultValue?: number): number {
    if (value === undefined || value === null || String(value).trim() === '') {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error('valor numérico ausente');
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      throw new Error('valor numérico inválido');
    }

    let str = String(value).trim();
    // Handle Brazilian format (e.g. "1.500,50" -> "1500.50")
    if (str.includes(',') && str.includes('.')) {
      if (str.indexOf('.') < str.indexOf(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }

    const parsed = parseFloat(str);
    if (!Number.isFinite(parsed)) throw new Error(`valor numérico inválido: ${String(value)}`);
    return parsed;
  }

  public static normalizeDate(value: any): string {
    if (!value || !String(value).trim()) throw new Error('data obrigatória ausente');
    const str = String(value).trim();

    // Protheus YYYYMMDD format (e.g. 20261025)
    if (/^\d{8}$/.test(str)) {
      const date = `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
      if (!this.isValidDate(date)) throw new Error(`data inválida: ${str}`);
      return date;
    }

    // DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [d, m, y] = str.split('/');
      const date = `${y}-${m}-${d}`;
      if (!this.isValidDate(date)) throw new Error(`data inválida: ${str}`);
      return date;
    }

    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const date = str.substring(0, 10);
      if (!this.isValidDate(date)) throw new Error(`data inválida: ${str}`);
      return date;
    }

    throw new Error(`formato de data não reconhecido: ${str}`);
  }

  private static isValidDate(value: string): boolean {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  public static detectEntityTypeFromHeaders(headers: string[]): ProtheusEntityType {
    const headerStr = headers.join(' ').toUpperCase();

    if (headerStr.includes('C5_') || headerStr.includes('C6_') || headerStr.includes('PEDIDO_VENDA') || (headerStr.includes('PV') && headerStr.includes('CLIENTE'))) {
      return 'SALES_ORDERS';
    }
    if (headerStr.includes('H6_') || headerStr.includes('APONTAMENTO') || headerStr.includes('QTDPROD')) {
      return 'APPOINTMENTS';
    }
    if (headerStr.includes('C2_') || headerStr.includes('ORDEM_PRODUCAO') || headerStr.includes('NUMERO_OP') || /\bOP\b/.test(headerStr)) {
      return 'PRODUCTION_ORDERS';
    }
    if (headerStr.includes('G1_') || headerStr.includes('ESTRUTURA') || headerStr.includes('BOM') || headerStr.includes('COMPONENTE')) {
      return 'STRUCTURES';
    }
    if (headerStr.includes('G2_') || headerStr.includes('ROTEIRO') || headerStr.includes('OPERACAO')) {
      return 'ROUTINGS';
    }
    if (headerStr.includes('B1_') || headerStr.includes('CODIGO_PRODUTO') || headerStr.includes('COD_PRODUTO') || /\bPRODUTO\b/.test(headerStr)) {
      return 'PRODUCTS';
    }

    throw new Error('Não foi possível identificar o tipo de dado pelos campos do arquivo. Selecione a entidade antes de importar.');
  }

  public static normalizeProduct(raw: Record<string, any>): NormalizedProduct {
    const codigoProduto = String(
      raw.codigoProduto || raw.B1_COD || raw.CODIGO || raw.COD_PRODUTO || raw.codigo || ''
    ).trim();

    const descricao = String(
      raw.descricao || raw.B1_DESC || raw.DESCRICAO || raw.DESC || ''
    ).trim();

    const tipo = String(
      raw.tipo || raw.B1_TIPO || raw.TIPO || ''
    ).trim().toUpperCase();

    const unidadeMedida = String(
      raw.unidadeMedida || raw.B1_UM || raw.UNIDADE || raw.UM || ''
    ).trim().toUpperCase();

    const revisao = raw.revisao || raw.B1_REV || raw.REVISAO ? String(raw.revisao || raw.B1_REV || raw.REVISAO).trim() : undefined;
    const armazemPadrao = raw.armazemPadrao || raw.B1_LOCPAD || raw.ARMAZEM ? String(raw.armazemPadrao || raw.B1_LOCPAD || raw.ARMAZEM).trim() : undefined;

    return {
      codigoProduto,
      descricao,
      tipo,
      unidadeMedida,
      revisao,
      armazemPadrao,
    };
  }

  public static normalizeStructure(raw: Record<string, any>): NormalizedStructure {
    const codigoProdutoPai = String(
      raw.codigoProdutoPai || raw.G1_COD || raw.PRODUTO_PAI || raw.COD_PAI || ''
    ).trim();

    const codigoComponente = String(
      raw.codigoComponente || raw.G1_COMP || raw.COMPONENTE || raw.COD_COMP || ''
    ).trim();

    const descricaoComponente = raw.descricaoComponente || raw.G1_DESC || raw.DESC_COMP
      ? String(raw.descricaoComponente || raw.G1_DESC || raw.DESC_COMP).trim()
      : undefined;

    const quantidadeNecessaria = this.normalizeNumber(
      raw.quantidadeNecessaria !== undefined ? raw.quantidadeNecessaria : (raw.G1_QUANT ?? raw.QUANTIDADE)
    );

    const unidadeComponente = String(
      raw.unidadeComponente || raw.G1_UM || raw.UM_COMP || raw.UM || ''
    ).trim().toUpperCase();

    const rawPerda = raw.perdaPercentual !== undefined ? raw.perdaPercentual : raw.G1_PERDA;
    const perdaPercentual = rawPerda !== undefined && rawPerda !== null && String(rawPerda).trim() !== ''
      ? this.normalizeNumber(rawPerda)
      : undefined;

    const revisao = raw.revisao || raw.G1_REV || raw.G1_REVINI ? String(raw.revisao || raw.G1_REV || raw.G1_REVINI).trim() : undefined;

    return {
      codigoProdutoPai,
      codigoComponente,
      descricaoComponente,
      quantidadeNecessaria,
      unidadeComponente,
      perdaPercentual,
      revisao,
    };
  }

  public static normalizeRouting(raw: Record<string, any>): NormalizedRouting {
    const codigoProduto = String(
      raw.codigoProduto || raw.G2_PRODUTO || raw.PRODUTO || raw.COD_PRODUTO || ''
    ).trim();

    const codigoRoteiro = String(
      raw.codigoRoteiro || raw.G2_ROTEIRO || raw.ROTEIRO || ''
    ).trim();

    const sequenciaOperacao = String(
      raw.sequenciaOperacao || raw.G2_OPERAC || raw.OPERAC || raw.SEQ || ''
    ).trim();

    const codigoOperacao = String(
      raw.codigoOperacao || raw.G2_CODIGO || raw.OPERACAO || raw.COD_OPER || ''
    ).trim();

    const descricaoOperacao = String(
      raw.descricaoOperacao || raw.G2_DESC || raw.DESCRICAO || ''
    ).trim();

    const postoTrabalho = raw.postoTrabalho || raw.G2_RECURSO || raw.G2_POSTO || raw.POSTO || raw.RECURSO
      ? String(raw.postoTrabalho || raw.G2_RECURSO || raw.G2_POSTO || raw.POSTO || raw.RECURSO).trim()
      : undefined;

    const rawTempo = raw.tempoPadraoMinutos !== undefined ? raw.tempoPadraoMinutos : raw.G2_TEMPO;
    const tempoPadraoMinutos = rawTempo !== undefined && rawTempo !== null && String(rawTempo).trim() !== ''
      ? this.normalizeNumber(rawTempo)
      : undefined;

    return {
      codigoProduto,
      codigoRoteiro,
      sequenciaOperacao,
      codigoOperacao,
      descricaoOperacao,
      postoTrabalho,
      tempoPadraoMinutos,
    };
  }

  public static normalizeSalesOrder(raw: Record<string, any>): NormalizedSalesOrder {
    const numeroPv = String(
      raw.numeroPv || raw.C5_NUM || raw.NUMERO_PV || raw.PEDIDO || raw.NUMERO || ''
    ).trim();

    const itemPv = String(
      raw.itemPv || raw.C6_ITEM || raw.ITEM_PV || raw.ITEM || ''
    ).trim();

    const clienteCodigo = raw.clienteCodigo || raw.C5_CLIENTE || raw.COD_CLIENTE
      ? String(raw.clienteCodigo || raw.C5_CLIENTE || raw.COD_CLIENTE).trim()
      : undefined;

    const clienteNome = String(
      raw.clienteNome || raw.A1_NOME || raw.CLIENTE || raw.NOME_CLIENTE || ''
    ).trim();

    const clienteCnpj = raw.clienteCnpj || raw.A1_CGC || raw.CNPJ
      ? String(raw.clienteCnpj || raw.A1_CGC || raw.CNPJ).trim()
      : undefined;

    const codigoProduto = String(
      raw.codigoProduto || raw.C6_PRODUTO || raw.PRODUTO || raw.COD_PROD || ''
    ).trim();

    const descricaoProduto = raw.descricaoProduto || raw.C6_DESCRI || raw.DESCRICAO
      ? String(raw.descricaoProduto || raw.C6_DESCRI || raw.DESCRICAO).trim()
      : undefined;

    const quantidadePedida = this.normalizeNumber(
      raw.quantidadePedida !== undefined ? raw.quantidadePedida : (raw.C6_QTDVEN || raw.QTD_PEDIDA || raw.QUANTIDADE)
    );

    const quantidadeEntregue = this.normalizeNumber(
      raw.quantidadeEntregue !== undefined ? raw.quantidadeEntregue : (raw.C6_QTDENT ?? raw.QTD_ENTREGUE)
    );

    const unidadeMedida = String(
      raw.unidadeMedida || raw.C6_UM || raw.UM || ''
    ).trim().toUpperCase();

    const dataEmissao = this.normalizeDate(raw.dataEmissao || raw.C5_EMISSAO || raw.EMISSAO);
    const dataEntrega = this.normalizeDate(raw.dataEntrega || raw.C6_ENTREG || raw.ENTREGA || raw.PREVISAO);
    const statusProtheus = String(
      raw.statusProtheus || raw.C6_BLQ || raw.STATUS || ''
    ).trim();

    return {
      numeroPv,
      itemPv,
      clienteCodigo,
      clienteNome,
      clienteCnpj,
      codigoProduto,
      descricaoProduto,
      quantidadePedida,
      quantidadeEntregue,
      unidadeMedida,
      dataEmissao,
      dataEntrega,
      statusProtheus,
    };
  }

  public static normalizeProductionOrder(raw: Record<string, any>): NormalizedProductionOrder {
    // Protheus OP can be C2_NUM + C2_ITEM + C2_SEQUEN or combined
    let numeroOp = String(raw.numeroOp || raw.C2_NUM || raw.OP || raw.NUMERO_OP || '').trim();
    if (raw.C2_ITEM && raw.C2_SEQUEN && !numeroOp.includes(raw.C2_ITEM)) {
      numeroOp = `${numeroOp}${String(raw.C2_ITEM).trim()}${String(raw.C2_SEQUEN).trim()}`;
    }

    const codigoProduto = String(
      raw.codigoProduto || raw.C2_PRODUTO || raw.PRODUTO || raw.COD_PROD || ''
    ).trim();

    const descricaoProduto = raw.descricaoProduto || raw.C2_DESC || raw.DESCRICAO
      ? String(raw.descricaoProduto || raw.C2_DESC || raw.DESCRICAO).trim()
      : undefined;

    const numeroPv = raw.numeroPv || raw.C2_PEDIDO || raw.PEDIDO_VENDA || raw.PV
      ? String(raw.numeroPv || raw.C2_PEDIDO || raw.PEDIDO_VENDA || raw.PV).trim()
      : undefined;

    const itemPv = raw.itemPv || raw.C2_ITEMPV || raw.ITEM_PV
      ? String(raw.itemPv || raw.C2_ITEMPV || raw.ITEM_PV).trim()
      : undefined;

    const codigoRoteiro = raw.codigoRoteiro || raw.C2_ROTEIRO || raw.ROTEIRO
      ? String(raw.codigoRoteiro || raw.C2_ROTEIRO || raw.ROTEIRO).trim()
      : undefined;

    const quantidadePlanejada = this.normalizeNumber(
      raw.quantidadePlanejada !== undefined ? raw.quantidadePlanejada : (raw.C2_QUANT ?? raw.QUANTIDADE)
    );

    const quantidadeProduzida = this.normalizeNumber(
      raw.quantidadeProduzida !== undefined ? raw.quantidadeProduzida : (raw.C2_QUJE ?? raw.QTD_PRODUZIDA)
    );

    const quantidadeRefugo = this.normalizeNumber(
      raw.quantidadeRefugo !== undefined ? raw.quantidadeRefugo : (raw.C2_PERDA ?? raw.REFUGO)
    );

    const saldoAProduzir = this.normalizeNumber(
      raw.saldoAProduzir !== undefined ? raw.saldoAProduzir : raw.C2_SALDO
    );

    const statusProtheus = String(
      raw.statusProtheus || raw.C2_STATUS || raw.STATUS || ''
    ).trim();

    const etapaAtual = raw.etapaAtual ? String(raw.etapaAtual).trim() : undefined;

    const dataEmissao = this.normalizeDate(raw.dataEmissao || raw.C2_EMISSAO || raw.EMISSAO);
    const dataInicioReal = raw.dataInicioReal || raw.C2_DATRF
      ? this.normalizeDate(raw.dataInicioReal || raw.C2_DATRF)
      : undefined;

    const dataPrevisaoFim = this.normalizeDate(
      raw.dataPrevisaoFim || raw.C2_DATPRF || raw.PREVISAO_FIM || raw.PREVISAO
    );

    const dataConclusaoReal = raw.dataConclusaoReal || raw.C2_DATPRI
      ? this.normalizeDate(raw.dataConclusaoReal || raw.C2_DATPRI)
      : undefined;

    return {
      numeroOp,
      codigoProduto,
      descricaoProduto,
      numeroPv,
      itemPv,
      codigoRoteiro,
      quantidadePlanejada,
      quantidadeProduzida,
      quantidadeRefugo,
      saldoAProduzir,
      statusProtheus,
      etapaAtual,
      dataEmissao,
      dataInicioReal,
      dataPrevisaoFim,
      dataConclusaoReal,
    };
  }

  public static normalizeAppointment(raw: Record<string, any>): NormalizedAppointment {
    const numeroOp = String(
      raw.numeroOp || raw.H6_OP || raw.OP || raw.NUMERO_OP || ''
    ).trim();

    const sequenciaOperacao = String(
      raw.sequenciaOperacao || raw.H6_OPERAC || raw.OPERAC || raw.SEQ || ''
    ).trim();

    const codigoOperacao = raw.codigoOperacao || raw.H6_CODOPER || raw.OPERACAO
      ? String(raw.codigoOperacao || raw.H6_CODOPER || raw.OPERACAO).trim()
      : undefined;

    const descricaoOperacao = raw.descricaoOperacao || raw.H6_DESCOPER || raw.DESCRICAO
      ? String(raw.descricaoOperacao || raw.H6_DESCOPER || raw.DESCRICAO).trim()
      : undefined;

    const postoTrabalho = raw.postoTrabalho || raw.H6_RECURSO || raw.RECURSO || raw.POSTO
      ? String(raw.postoTrabalho || raw.H6_RECURSO || raw.RECURSO || raw.POSTO).trim()
      : undefined;

    const operador = raw.operador || raw.H6_OPERADO || raw.OPERADOR
      ? String(raw.operador || raw.H6_OPERADO || raw.OPERADOR).trim()
      : undefined;

    const quantidadeProduzida = this.normalizeNumber(
      raw.quantidadeProduzida !== undefined ? raw.quantidadeProduzida : (raw.H6_QTDPROD ?? raw.QTD_PRODUZIDA)
    );

    const quantidadeRefugo = this.normalizeNumber(
      raw.quantidadeRefugo !== undefined ? raw.quantidadeRefugo : (raw.H6_QTDPERD ?? raw.REFUGO)
    );

    const dataApontamento = this.normalizeDate(
      raw.dataApontamento || raw.H6_DTAPONT || raw.DATA || raw.DATA_APONTAMENTO
    );

    const horaInicio = raw.horaInicio || raw.H6_HORAINI ? String(raw.horaInicio || raw.H6_HORAINI).trim() : undefined;
    const horaFim = raw.horaFim || raw.H6_HORAFIN ? String(raw.horaFim || raw.H6_HORAFIN).trim() : undefined;

    const tipoApontamento = String(
      raw.tipoApontamento || raw.H6_TIPO || raw.TIPO || ''
    ).trim().toUpperCase();

    const motivoRefugo = raw.motivoRefugo || raw.H6_MOTIVO
      ? String(raw.motivoRefugo || raw.H6_MOTIVO).trim()
      : undefined;

    return {
      numeroOp,
      sequenciaOperacao,
      codigoOperacao,
      descricaoOperacao,
      postoTrabalho,
      operador,
      quantidadeProduzida,
      quantidadeRefugo,
      dataApontamento,
      horaInicio,
      horaFim,
      tipoApontamento,
      motivoRefugo,
    };
  }
}
