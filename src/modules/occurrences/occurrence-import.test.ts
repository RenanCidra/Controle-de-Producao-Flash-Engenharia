import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOccurrenceImportTemplateCsv,
  buildOccurrencesCsv,
  escapeCsvCell,
  parseOccurrenceImportText,
  validateImportRows,
  type ExistingOccurrenceSignatureRow,
  type MirrorOrderLookupRow,
} from './occurrence-import.ts';

test('escapeCsvCell prevents spreadsheet formula injection (CWE-1236)', () => {
  assert.equal(escapeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('-13'), "'-13");
  assert.equal(escapeCsvCell('@HYPERLINK("http://x")'), '"\'@HYPERLINK(""http://x"")"');
  assert.equal(escapeCsvCell(-13), '-13');
  assert.equal(escapeCsvCell('texto;com;ponto'), '"texto;com;ponto"');
});

test('buildOccurrencesCsv includes UTF-8 BOM and all columns safely', () => {
  const csv = buildOccurrencesCsv([
    {
      id: 7,
      code: 'OC-2026-007',
      openedAt: '2026-11-10T12:00:00.000Z',
      type: 'SEM_SALDO',
      occurrenceType: 'Sem Saldo',
      sector: 'ALMOX',
      priority: 'ALTA',
      status: 'ABERTA',
      slaDueAt: '2026-11-10T14:00:00.000Z',
      resolvedAt: null,
      numeroOp: '000101',
      pvNumber: '012841',
      parentProduct: '41.SIR.001',
      componentCode: '11.ETQ.001',
      warehouse: '50',
      currentBalance: '-13',
      isRecurrence: false,
      requesterName: 'Operador A',
      assigneeName: null,
      workstation: 'EST-01',
      operation: '10',
      description: '=Falta de material no almoxarifado',
      resolutionText: null,
    },
  ]);

  assert.ok(csv.startsWith('\uFEFFCodigo_OC;Data_Abertura;'));
  assert.ok(csv.includes('OC-2026-007'));
  assert.ok(csv.includes("'=Falta de material no almoxarifado"));
});

test('parseOccurrenceImportText supports semicolon CSV and tab-separated Excel paste', () => {
  const templateCsv = buildOccurrenceImportTemplateCsv();
  const parsedCsv = parseOccurrenceImportText(templateCsv);
  assert.equal(parsedCsv.delimiter, ';');
  assert.equal(parsedCsv.rows.length, 1);
  assert.equal(parsedCsv.rows[0].numeroOp, '000101');
  assert.equal(parsedCsv.rows[0].componentCode, '11.ETQ.DIVE.00005.00');

  const tsv = 'OP\tTipo\tDescricao\tAbertura\n000202\tQualidade\tPeca com risco superficial\t12/11/2026';
  const parsedTsv = parseOccurrenceImportText(tsv);
  assert.equal(parsedTsv.delimiter, '\t');
  assert.equal(parsedTsv.rows[0].numeroOp, '000202');
  assert.equal(parsedTsv.rows[0].openedAt, '12/11/2026');
});

test('validateImportRows validates OP mirror, detects intra-file and DB duplicates, and flags errors', () => {
  const content = [
    'Codigo;OP;Tipo;Setor;Situacao;Componente;Data;Descricao',
    ';000101;Sem Saldo;;;11.ETQ.001;10/11/2026;Falta etiqueta OP 101',
    ';000101;Sem Saldo;;;11.ETQ.001;10/11/2026;Falta etiqueta OP 101',
    'OC-2026-005;000999;Bloqueio de OP;PRODUCAO;CONCLUIDA;;2026-11-01;Bloqueio antigo na linha',
    ';000777;Outro;;;;2026-11-02;',
    ';000555;Qualidade;SETOR_INVALIDO;ABERTA;;2026-11-03;Teste setor invalido',
  ].join('\n');

  const parsed = parseOccurrenceImportText(content);
  const mirrorMap = new Map<string, MirrorOrderLookupRow>([
    ['000101', { numeroOp: '000101', numeroPv: '012841', codigoProduto: '41.PROD.101' }],
  ]);
  const existing: ExistingOccurrenceSignatureRow[] = [
    {
      id: 5,
      code: 'OC-2026-005',
      numeroOp: '000999',
      componentCode: null,
      type: 'BLOQUEIO_OP',
      description: 'Outro texto',
    },
  ];

  const preview = validateImportRows(parsed, mirrorMap, existing);
  assert.equal(preview.totalRows, 5);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.duplicateCount, 2);
  assert.equal(preview.errorCount, 2);
  assert.equal(preview.missingOpInMirrorCount, 3);

  assert.equal(preview.rows[0].validationStatus, 'VALID');
  assert.equal(preview.rows[0].opFoundInMirror, true);
  assert.equal(preview.rows[0].normalized?.pvNumber, '012841');
  assert.equal(preview.rows[0].normalized?.parentProduct, '41.PROD.101');
  assert.equal(preview.rows[0].normalized?.sector, 'ALMOX');

  assert.equal(preview.rows[1].validationStatus, 'DUPLICATE');
  assert.equal(preview.rows[1].duplicateOfCode, 'Linha 2');

  assert.equal(preview.rows[2].validationStatus, 'DUPLICATE');
  assert.equal(preview.rows[2].duplicateOfCode, 'OC-2026-005');

  assert.equal(preview.rows[3].validationStatus, 'ERROR');
  assert.equal(preview.rows[4].validationStatus, 'ERROR');
});
