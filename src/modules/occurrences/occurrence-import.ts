import {
  computeSlaDueAt,
  isClosedOccurrenceStatus,
  normalizeOccurrenceStatus,
  normalizeOccurrenceType,
  OCCURRENCE_PRIORITIES,
  OCCURRENCE_SECTORS,
  OCCURRENCE_TYPE_LABELS,
  getRoutingRule,
  type OccurrencePriority,
  type OccurrenceSector,
  type OccurrenceStatus,
  type OccurrenceType,
} from './occurrence-engine.ts';

export const MAX_OCCURRENCE_IMPORT_ROWS = 300;
export const MAX_OCCURRENCE_IMPORT_CHARS = 512_000;

export interface OccurrenceCsvExportRow {
  id: number;
  code: string;
  openedAt: Date | string | null;
  type: string;
  occurrenceType: string;
  sector: string;
  priority: string;
  status: string;
  slaDueAt: Date | string | null;
  resolvedAt: Date | string | null;
  numeroOp: string | null;
  pvNumber: string | null;
  parentProduct: string | null;
  componentCode: string | null;
  warehouse: string | null;
  currentBalance: string | null;
  isRecurrence: boolean;
  requesterName: string | null;
  assigneeName: string | null;
  workstation: string | null;
  operation: string | null;
  description: string;
  resolutionText: string | null;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let raw = value instanceof Date ? value.toISOString() : String(value);
  // Neutralize spreadsheet formula execution (CWE-1236) on untrusted text values.
  if (typeof value === 'string' && /^[\u0000-\u0020]*[=+@-]/.test(raw)) {
    raw = `'${raw}`;
  }
  const escaped = raw.replace(/"/g, '""');
  if (escaped.includes(';') || escaped.includes('\n') || escaped.includes('\r') || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function buildOccurrencesCsv(rows: OccurrenceCsvExportRow[]): string {
  const headers = [
    'Codigo_OC',
    'Data_Abertura',
    'Tipo',
    'Assunto',
    'Setor',
    'Prioridade',
    'Situacao',
    'Prazo_SLA',
    'Data_Conclusao',
    'OP',
    'PV',
    'Produto_Pai',
    'Componente',
    'Armazem',
    'Saldo_Observado',
    'Reincidencia',
    'Solicitante',
    'Responsavel',
    'Posto_Recurso',
    'Operacao',
    'Descricao',
    'Resolucao',
  ];

  const lines = rows.map((row) => [
    escapeCsvCell(row.code || `#${row.id}`),
    escapeCsvCell(row.openedAt),
    escapeCsvCell(row.type),
    escapeCsvCell(row.occurrenceType),
    escapeCsvCell(row.sector),
    escapeCsvCell(row.priority),
    escapeCsvCell(row.status),
    escapeCsvCell(row.slaDueAt),
    escapeCsvCell(row.resolvedAt),
    escapeCsvCell(row.numeroOp),
    escapeCsvCell(row.pvNumber),
    escapeCsvCell(row.parentProduct),
    escapeCsvCell(row.componentCode),
    escapeCsvCell(row.warehouse),
    escapeCsvCell(row.currentBalance),
    escapeCsvCell(row.isRecurrence ? 'SIM' : 'NAO'),
    escapeCsvCell(row.requesterName),
    escapeCsvCell(row.assigneeName),
    escapeCsvCell(row.workstation),
    escapeCsvCell(row.operation),
    escapeCsvCell(row.description),
    escapeCsvCell(row.resolutionText),
  ].join(';'));

  return `\uFEFF${[headers.join(';'), ...lines].join('\r\n')}`;
}

export function buildOccurrenceImportTemplateCsv(): string {
  const headers = [
    'OP',
    'PV',
    'Tipo',
    'Setor',
    'Prioridade',
    'Situacao',
    'Componente',
    'Armazem',
    'Saldo',
    'Posto',
    'Operacao',
    'Data_Abertura',
    'Descricao',
    'Resolucao',
  ];
  const sample = [
    '000101',
    '012841',
    'SEM_SALDO',
    'ALMOX',
    'ALTA',
    'ABERTA',
    '11.ETQ.DIVE.00005.00',
    '50',
    '-13',
    'EST-01',
    '10',
    '2026-11-10',
    'Falta de etiqueta para finalizacao da OP 000101',
    '',
  ];
  return `\uFEFF${[headers.join(';'), sample.join(';')].join('\r\n')}`;
}

function normalizeHeaderName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(headerLine: string): '\t' | ';' | ',' {
  const counts: Record<'\t' | ';' | ',', number> = {
    '\t': (headerLine.match(/\t/g) || []).length,
    ';': (headerLine.match(/;/g) || []).length,
    ',': (headerLine.match(/,/g) || []).length,
  };
  if (counts['\t'] >= counts[';'] && counts['\t'] >= counts[','] && counts['\t'] > 0) return '\t';
  if (counts[';'] >= counts[','] && counts[';'] > 0) return ';';
  return ',';
}

function splitDelimitedLine(line: string, delimiter: '\t' | ';' | ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

const HEADER_ALIAS_MAP: Record<string, keyof ParsedImportRowRaw> = {
  codigo: 'code',
  codigo_oc: 'code',
  code: 'code',
  oc: 'code',
  op: 'numeroOp',
  numero_op: 'numeroOp',
  op_number: 'numeroOp',
  ordem: 'numeroOp',
  ordem_producao: 'numeroOp',
  pv: 'pvNumber',
  numero_pv: 'pvNumber',
  pv_number: 'pvNumber',
  pedido: 'pvNumber',
  tipo: 'type',
  type: 'type',
  categoria: 'type',
  assunto: 'occurrenceType',
  occurrence_type: 'occurrenceType',
  titulo: 'occurrenceType',
  setor: 'sector',
  sector: 'sector',
  setor_destino: 'sector',
  prioridade: 'priority',
  priority: 'priority',
  situacao: 'status',
  status: 'status',
  estado: 'status',
  produto_pai: 'parentProduct',
  parent_product: 'parentProduct',
  produto: 'parentProduct',
  componente: 'componentCode',
  component_code: 'componentCode',
  insumo: 'componentCode',
  armazem: 'warehouse',
  warehouse: 'warehouse',
  local: 'warehouse',
  saldo: 'currentBalance',
  saldo_observado: 'currentBalance',
  saldo_atual: 'currentBalance',
  current_balance: 'currentBalance',
  operacao: 'operation',
  operation: 'operation',
  posto: 'workstation',
  posto_recurso: 'workstation',
  recurso: 'workstation',
  workstation: 'workstation',
  descricao: 'description',
  description: 'description',
  ocorrencia: 'description',
  observacao: 'description',
  acao_imediata: 'immediateAction',
  immediate_action: 'immediateAction',
  resolucao: 'resolutionText',
  resolution_text: 'resolutionText',
  data_abertura: 'openedAt',
  abertura: 'openedAt',
  data: 'openedAt',
  opened_at: 'openedAt',
  data_conclusao: 'resolvedAt',
  conclusao: 'resolvedAt',
  resolved_at: 'resolvedAt',
};

export interface ParsedImportRowRaw {
  rowNumber: number;
  code?: string;
  numeroOp?: string;
  pvNumber?: string;
  type?: string;
  occurrenceType?: string;
  sector?: string;
  priority?: string;
  status?: string;
  parentProduct?: string;
  componentCode?: string;
  warehouse?: string;
  currentBalance?: string;
  operation?: string;
  workstation?: string;
  description?: string;
  immediateAction?: string;
  resolutionText?: string;
  openedAt?: string;
  resolvedAt?: string;
}

export function parseOccurrenceImportText(rawContent: string): {
  delimiter: '\t' | ';' | ',';
  headers: string[];
  rows: ParsedImportRowRaw[];
} {
  const cleaned = String(rawContent || '').replace(/^\uFEFF/, '');
  if (!cleaned.trim()) {
    throw new Error('O conteúdo para importação está vazio.');
  }
  if (cleaned.length > MAX_OCCURRENCE_IMPORT_CHARS) {
    throw new Error('O arquivo excede o limite de 500 KB por lote de importação.');
  }

  const rawLines = cleaned.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rawLines.length < 2) {
    throw new Error('Informe a linha de cabeçalho e ao menos uma linha de ocorrência.');
  }

  if (rawLines.length - 1 > MAX_OCCURRENCE_IMPORT_ROWS) {
    throw new Error(`Limite de ${MAX_OCCURRENCE_IMPORT_ROWS} ocorrências por lote excedido (${rawLines.length - 1} linhas).`);
  }

  const delimiter = detectDelimiter(rawLines[0]);
  const headerCells = splitDelimitedLine(rawLines[0], delimiter);
  const mappedFields = headerCells.map((cell) => HEADER_ALIAS_MAP[normalizeHeaderName(cell)] || null);

  if (!mappedFields.includes('description')) {
    throw new Error('Cabeçalho obrigatório ausente: inclua a coluna "Descricao" (ou "Description").');
  }

  const rows: ParsedImportRowRaw[] = [];
  for (let idx = 1; idx < rawLines.length; idx += 1) {
    const values = splitDelimitedLine(rawLines[idx], delimiter);
    const row: ParsedImportRowRaw = { rowNumber: idx + 1 };
    for (let col = 0; col < mappedFields.length; col += 1) {
      const targetField = mappedFields[col];
      if (!targetField) continue;
      const cellVal = (values[col] ?? '').trim();
      if (cellVal) {
        (row as unknown as Record<string, string>)[targetField] = cellVal;
      }
    }
    rows.push(row);
  }

  return { delimiter, headers: headerCells, rows };
}

export function parseFlexibleDateInput(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const [, dd, mm, yyyy, hh = '12', min = '00', ss = '00'] = brMatch;
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.000Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

function normalizeTextValue(raw?: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function parseSectorInput(raw: string | undefined, fallback: OccurrenceSector): OccurrenceSector | null {
  if (!raw || !raw.trim()) return fallback;
  const norm = normalizeTextValue(raw).replace(/[^A-Z]/g, '');
  if (norm === 'ALMOX' || norm === 'ALMOXARIFADO') return 'ALMOX';
  if (norm === 'PCP') return 'PCP';
  if (norm === 'PRODUCAO') return 'PRODUCAO';
  if (norm === 'QUALIDADE') return 'QUALIDADE';
  if ((OCCURRENCE_SECTORS as readonly string[]).includes(norm)) return norm as OccurrenceSector;
  return null;
}

function parsePriorityInput(raw: string | undefined, fallback: OccurrencePriority): OccurrencePriority | null {
  if (!raw || !raw.trim()) return fallback;
  const norm = normalizeTextValue(raw);
  if (norm === 'BAIXA' || norm === 'LOW') return 'BAIXA';
  if (norm === 'MEDIA' || norm === 'NORMAL' || norm === 'MEDIUM') return 'MEDIA';
  if (norm === 'ALTA' || norm === 'HIGH') return 'ALTA';
  if (norm === 'CRITICA' || norm === 'URGENTE' || norm === 'CRITICAL') return 'CRITICA';
  if ((OCCURRENCE_PRIORITIES as readonly string[]).includes(norm)) return norm as OccurrencePriority;
  return null;
}

export function buildOccurrenceDedupeSignature(input: {
  numeroOp?: string | null;
  componentCode?: string | null;
  type: string;
  description: string;
}): string {
  const op = normalizeTextValue(input.numeroOp || '');
  const comp = normalizeTextValue(input.componentCode || '');
  const type = normalizeTextValue(input.type);
  const desc = normalizeTextValue(input.description).slice(0, 160);
  return `${op}|${comp}|${type}|${desc}`;
}

export interface MirrorOrderLookupRow {
  numeroOp: string;
  numeroPv: string | null;
  codigoProduto: string | null;
}

export interface ExistingOccurrenceSignatureRow {
  id: number;
  code: string;
  numeroOp: string | null;
  componentCode: string | null;
  type: string;
  description: string;
}

export interface NormalizedOccurrenceImportRow {
  legacyCode: string | null;
  type: OccurrenceType;
  occurrenceType: string;
  sector: OccurrenceSector;
  priority: OccurrencePriority;
  status: OccurrenceStatus;
  slaMinutes: number;
  slaDueAt: string;
  numeroOp: string | null;
  pvNumber: string | null;
  parentProduct: string | null;
  componentCode: string | null;
  warehouse: string | null;
  currentBalance: string | null;
  operation: string | null;
  workstation: string | null;
  description: string;
  immediateAction: string | null;
  resolutionText: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface OccurrenceImportRowPreview {
  rowNumber: number;
  validationStatus: 'VALID' | 'DUPLICATE' | 'ERROR';
  opFoundInMirror: boolean | null;
  duplicateOfCode: string | null;
  issues: string[];
  warnings: string[];
  normalized: NormalizedOccurrenceImportRow | null;
}

export interface OccurrenceImportPreviewResult {
  delimiter: '\t' | ';' | ',';
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  missingOpInMirrorCount: number;
  rows: OccurrenceImportRowPreview[];
}

export function validateImportRows(
  parsed: ReturnType<typeof parseOccurrenceImportText>,
  mirrorOrdersMap: Map<string, MirrorOrderLookupRow>,
  existingRows: ExistingOccurrenceSignatureRow[],
  now = new Date(),
): OccurrenceImportPreviewResult {
  const existingByCode = new Map<string, string>();
  const existingBySignature = new Map<string, string>();

  for (const existing of existingRows) {
    if (existing.code) {
      existingByCode.set(existing.code.trim().toUpperCase(), existing.code);
    }
    const sig = buildOccurrenceDedupeSignature(existing);
    if (!existingBySignature.has(sig)) {
      existingBySignature.set(sig, existing.code);
    }
  }

  const seenFileCodes = new Map<string, number>();
  const seenFileSignatures = new Map<string, number>();

  const rows: OccurrenceImportRowPreview[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  let missingOpInMirrorCount = 0;

  for (const raw of parsed.rows) {
    const issues: string[] = [];
    const warnings: string[] = [];

    const description = (raw.description || '').trim().slice(0, 2000);
    if (!description) {
      issues.push('Descrição obrigatória.');
    }

    const parsedType: OccurrenceType =
      normalizeOccurrenceType(raw.type) ||
      normalizeOccurrenceType(raw.occurrenceType) ||
      'OUTRO';

    const rule = getRoutingRule(parsedType);

    const sector = parseSectorInput(raw.sector, rule.sector);
    if (!sector) {
      issues.push(`Setor inválido: "${raw.sector}".`);
    }

    const priority = parsePriorityInput(raw.priority, rule.priority);
    if (!priority) {
      issues.push(`Prioridade inválida: "${raw.priority}".`);
    }

    let status: OccurrenceStatus = 'ABERTA';
    if (raw.status) {
      const normalizedStatus = normalizeOccurrenceStatus(raw.status);
      if (!normalizedStatus) {
        issues.push(`Situação inválida: "${raw.status}".`);
      } else {
        status = normalizedStatus;
      }
    }

    let openedAt = now;
    if (raw.openedAt) {
      const parsedOpenedAt = parseFlexibleDateInput(raw.openedAt);
      if (!parsedOpenedAt) {
        issues.push(`Data de abertura inválida: "${raw.openedAt}".`);
      } else {
        openedAt = parsedOpenedAt;
      }
    }

    let resolvedAt: Date | null = null;
    if (raw.resolvedAt) {
      const parsedResolvedAt = parseFlexibleDateInput(raw.resolvedAt);
      if (!parsedResolvedAt) {
        issues.push(`Data de conclusão inválida: "${raw.resolvedAt}".`);
      } else {
        resolvedAt = parsedResolvedAt;
      }
    } else if (isClosedOccurrenceStatus(status)) {
      resolvedAt = openedAt;
    }

    let currentBalance: string | null = null;
    if (raw.currentBalance) {
      const normalizedBal = raw.currentBalance.replace(',', '.').trim();
      const num = Number(normalizedBal);
      if (!Number.isFinite(num)) {
        issues.push(`Saldo inválido: "${raw.currentBalance}".`);
      } else {
        currentBalance = String(num);
      }
    }

    const numeroOp = raw.numeroOp ? raw.numeroOp.trim().slice(0, 80) : null;
    let pvNumber = raw.pvNumber ? raw.pvNumber.trim().slice(0, 80) : null;
    let parentProduct = raw.parentProduct ? raw.parentProduct.trim().slice(0, 80) : null;

    let opFoundInMirror: boolean | null = null;
    if (numeroOp) {
      const mirrorOrder = mirrorOrdersMap.get(numeroOp.toUpperCase());
      if (mirrorOrder) {
        opFoundInMirror = true;
        if (!pvNumber && mirrorOrder.numeroPv) pvNumber = mirrorOrder.numeroPv;
        if (!parentProduct && mirrorOrder.codigoProduto) parentProduct = mirrorOrder.codigoProduto;
      } else {
        opFoundInMirror = false;
        missingOpInMirrorCount += 1;
        warnings.push(`OP ${numeroOp} não localizada no espelho Protheus atual.`);
      }
    }

    const componentCode = raw.componentCode ? raw.componentCode.trim().slice(0, 80) : null;
    const legacyCode = raw.code ? raw.code.trim().toUpperCase().slice(0, 40) : null;
    const resolutionText = raw.resolutionText
      ? raw.resolutionText.trim().slice(0, 2000)
      : status === 'CONCLUIDA'
        ? 'Encerrada em carga histórica.'
        : null;

    if (issues.length > 0 || !sector || !priority) {
      errorCount += 1;
      rows.push({
        rowNumber: raw.rowNumber,
        validationStatus: 'ERROR',
        opFoundInMirror,
        duplicateOfCode: null,
        issues,
        warnings,
        normalized: null,
      });
      continue;
    }

    const slaDueAt = computeSlaDueAt(openedAt, rule.slaMinutes);
    const normalized: NormalizedOccurrenceImportRow = {
      legacyCode,
      type: parsedType,
      occurrenceType: (raw.occurrenceType || OCCURRENCE_TYPE_LABELS[parsedType]).trim().slice(0, 80),
      sector,
      priority,
      status,
      slaMinutes: rule.slaMinutes,
      slaDueAt: slaDueAt.toISOString(),
      numeroOp,
      pvNumber,
      parentProduct,
      componentCode,
      warehouse: raw.warehouse ? raw.warehouse.trim().slice(0, 20) : null,
      currentBalance,
      operation: raw.operation ? raw.operation.trim().slice(0, 120) : null,
      workstation: raw.workstation ? raw.workstation.trim().slice(0, 120) : null,
      description,
      immediateAction: raw.immediateAction ? raw.immediateAction.trim().slice(0, 1000) : null,
      resolutionText,
      openedAt: openedAt.toISOString(),
      resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
    };

    const signature = buildOccurrenceDedupeSignature({
      numeroOp,
      componentCode,
      type: parsedType,
      description,
    });

    let duplicateOfCode: string | null = null;
    if (legacyCode && existingByCode.has(legacyCode)) {
      duplicateOfCode = existingByCode.get(legacyCode)!;
    } else if (existingBySignature.has(signature)) {
      duplicateOfCode = existingBySignature.get(signature)!;
    } else if (legacyCode && seenFileCodes.has(legacyCode)) {
      duplicateOfCode = `Linha ${seenFileCodes.get(legacyCode)}`;
    } else if (seenFileSignatures.has(signature)) {
      duplicateOfCode = `Linha ${seenFileSignatures.get(signature)}`;
    }

    if (legacyCode && !seenFileCodes.has(legacyCode)) seenFileCodes.set(legacyCode, raw.rowNumber);
    if (!seenFileSignatures.has(signature)) seenFileSignatures.set(signature, raw.rowNumber);

    if (duplicateOfCode) {
      duplicateCount += 1;
      warnings.push(`Duplicidade detectada com ${duplicateOfCode}.`);
      rows.push({
        rowNumber: raw.rowNumber,
        validationStatus: 'DUPLICATE',
        opFoundInMirror,
        duplicateOfCode,
        issues: [],
        warnings,
        normalized,
      });
      continue;
    }

    validCount += 1;
    rows.push({
      rowNumber: raw.rowNumber,
      validationStatus: 'VALID',
      opFoundInMirror,
      duplicateOfCode: null,
      issues: [],
      warnings,
      normalized,
    });
  }

  return {
    delimiter: parsed.delimiter,
    totalRows: parsed.rows.length,
    validCount,
    duplicateCount,
    errorCount,
    missingOpInMirrorCount,
    rows,
  };
}
