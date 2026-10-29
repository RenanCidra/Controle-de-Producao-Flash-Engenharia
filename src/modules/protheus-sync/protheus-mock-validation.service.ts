type MockDatasetStatus = 'OK' | 'FAILED';

export interface ProtheusMockDatasetCheck {
  entity: string;
  status: MockDatasetStatus;
  sourceFile?: string;
  sourceSheet?: string;
  sourceRows?: number;
  firstPageRecords?: number;
  cursorPaginationVerified?: boolean;
  fields?: string[];
  error?: string;
}

export interface ProtheusMockValidationReport {
  mode: 'SIMULATION_READ_ONLY';
  status: 'READY' | 'LIMITED' | 'BLOCKED';
  connected: boolean;
  simulation: true;
  readOnly: true;
  connectsToProtheus: false;
  writesToApplication: false;
  databaseWritePerformed: false;
  checkedAt: string;
  datasets: ProtheusMockDatasetCheck[];
  limitations: Array<{ endpoint: string; message: string }>;
}

const DATASETS = [
  'products',
  'product-groups',
  'resources',
  'structures',
  'routings',
  'production-orders',
  'commitments',
  'sales-order-headers',
  'sales-order-lines',
  'appointments',
] as const;

type JsonObject = Record<string, any>;

function getMockOrigin(): string {
  const configured = process.env.PROTHEUS_MOCK_API_URL?.trim()
    || (process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:4100' : '');
  if (!configured) {
    throw new Error('A API simulada está desativada. Configure PROTHEUS_MOCK_API_URL somente no ambiente local.');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('A URL da API simulada está inválida.');
  }

  const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]']);
  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.search || url.hash) {
    throw new Error('Por segurança, a validação só consulta a API simulada HTTP em loopback.');
  }
  return url.origin;
}

async function getJson(origin: string, path: string, timeoutMs = 8000): Promise<{ status: number; body: JsonObject }> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(new URL(path, origin), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    } catch {
      if (attempt === 2) throw new Error('Não foi possível acessar o mock local. Confirme se a API simulada está iniciada.');
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (!response) throw new Error('Não foi possível acessar o mock local. Confirme se a API simulada está iniciada.');

  let body: JsonObject;
  try {
    body = await response.json() as JsonObject;
  } catch {
    throw new Error(`A API simulada retornou uma resposta inválida em ${path}.`);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`A API simulada retornou um formato inesperado em ${path}.`);
  }
  return { status: response.status, body };
}

function assertReadOnlyPayload(entity: string, body: JsonObject): void {
  if (body.simulation !== true || body.readOnly !== true) {
    throw new Error(`${entity}: a resposta não se identificou como simulação somente leitura.`);
  }
  if ((body.writesToApplication !== undefined && body.writesToApplication !== false)
    || (body.connectsToProtheus !== undefined && body.connectsToProtheus !== false)) {
    throw new Error(`${entity}: a origem declarou escrita ou conexão com o Protheus real.`);
  }
}

async function checkDataset(origin: string, entity: string): Promise<ProtheusMockDatasetCheck> {
  try {
    const first = await getJson(origin, `/v1/${entity}?stream=true&pageSize=1`);
    if (first.status !== 200) throw new Error(`GET /v1/${entity} retornou HTTP ${first.status}.`);
    assertReadOnlyPayload(entity, first.body);
    if (!Array.isArray(first.body.records)) throw new Error(`${entity}: a lista de registros está ausente ou inválida.`);

    const sourceRows = Number(first.body.sourceRows);
    if (!Number.isSafeInteger(sourceRows) || sourceRows < 0) throw new Error(`${entity}: total de origem ausente ou inválido.`);
    const expectedFirstPageRecords = sourceRows > 0 ? 1 : 0;
    if (first.body.records.length !== expectedFirstPageRecords) throw new Error(`${entity}: a API não respeitou o total ou o tamanho da primeira página.`);

    let cursorPaginationVerified = sourceRows <= 1;
    if (sourceRows > 1) {
      const cursor = first.body.nextCursor;
      if (typeof cursor !== 'string' || !cursor) throw new Error(`${entity}: a primeira página não retornou cursor.`);
      const secondPath = `/v1/${entity}?stream=true&pageSize=1&cursor=${encodeURIComponent(cursor)}&probe=true`;
      const second = await getJson(origin, secondPath);
      if (second.status !== 200) throw new Error(`${entity}: a página com cursor retornou HTTP ${second.status}.`);
      assertReadOnlyPayload(entity, second.body);
      if (!Array.isArray(second.body.records) || second.body.records.length !== 1 || second.body.page !== 2 || second.body.cursorProbeComplete !== true || second.body.nextCursor) {
        throw new Error(`${entity}: a paginação com cursor retornou uma página inválida.`);
      }
      cursorPaginationVerified = true;
    }

    return {
      entity,
      status: 'OK',
      sourceFile: String(first.body.sourceFile || ''),
      sourceSheet: String(first.body.sourceSheet || ''),
      sourceRows,
      firstPageRecords: first.body.records.length,
      cursorPaginationVerified,
      fields: first.body.records.length ? Object.keys(first.body.records[0]) : [],
    };
  } catch (error: any) {
    return { entity, status: 'FAILED', error: error?.message || 'Falha ao verificar a origem.' };
  }
}

export class ProtheusMockValidationService {
  public static async runFlowCheck(): Promise<JsonObject> {
    const origin = getMockOrigin();
    const response = await getJson(origin, '/v1/flow-check', 360000);
    if (response.status !== 200) {
      throw new Error(String(response.body.message || 'A verificação completa dos relatórios não foi concluída.'));
    }
    const report = response.body;
    if (report.mode !== 'SIMULATION_DRY_RUN' || report.databaseWritePerformed !== false
      || !Array.isArray(report.blockers) || !Array.isArray(report.warnings)
      || !report.datasets || typeof report.datasets !== 'object') {
      throw new Error('A resposta da verificação completa não passou na checagem de segurança/formato.');
    }
    return report;
  }

  public static async readPage(entity: string, cursor?: string, pageSize = 10): Promise<JsonObject> {
    if (!DATASETS.includes(entity as typeof DATASETS[number])) {
      throw new Error('MOCK_ENTITY_NOT_AVAILABLE');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) {
      throw new Error('MOCK_PAGE_SIZE_INVALID');
    }
    if (cursor && !/^[a-f0-9]{32}$/i.test(cursor)) {
      throw new Error('MOCK_CURSOR_INVALID');
    }

    const query = new URLSearchParams({ stream: 'true', pageSize: String(pageSize) });
    if (cursor) query.set('cursor', cursor);
    const origin = getMockOrigin();
    const response = await getJson(origin, `/v1/${entity}?${query.toString()}`);
    if (response.status !== 200) {
      throw new Error(`Não foi possível ler o conjunto ${entity} na API simulada.`);
    }
    assertReadOnlyPayload(entity, response.body);
    if (!Array.isArray(response.body.records) || !Number.isSafeInteger(Number(response.body.sourceRows))) {
      throw new Error(`A API simulada retornou uma página inválida para ${entity}.`);
    }

    return {
      mode: 'SIMULATION_READ_ONLY',
      entity,
      simulation: true,
      readOnly: true,
      writesToApplication: false,
      sourceFile: response.body.sourceFile,
      sourceSheet: response.body.sourceSheet,
      sourceRows: Number(response.body.sourceRows),
      page: response.body.page,
      pageSize: response.body.pageSize,
      recordsReturned: response.body.recordsReturned,
      nextCursor: response.body.nextCursor || null,
      records: response.body.records,
      databaseWritePerformed: false,
    };
  }

  public static async run(): Promise<ProtheusMockValidationReport> {
    const origin = getMockOrigin();
    const health = await getJson(origin, '/v1/health');
    if (health.status !== 200) throw new Error(`O mock respondeu HTTP ${health.status} na verificação de saúde.`);
    assertReadOnlyPayload('health', health.body);
    if (health.body.status !== 'online') throw new Error('O mock não informou status online.');
    if (health.body.writesToApplication !== false || health.body.connectsToProtheus !== false) {
      throw new Error('A origem declara escrita na aplicação ou conexão com o Protheus real; a validação foi interrompida.');
    }

    const datasets: ProtheusMockDatasetCheck[] = [];
    for (const entity of DATASETS) datasets.push(await checkDataset(origin, entity));

    const limitations: ProtheusMockValidationReport['limitations'] = [];
    const salesOrders = await getJson(origin, '/v1/sales-orders');
    if (salesOrders.status === 501 && salesOrders.body.error === 'SOURCE_LINK_KEY_MISSING') {
      limitations.push({
        endpoint: '/v1/sales-orders',
        message: String(salesOrders.body.message || 'O SC6 não contém a chave para ligar itens aos cabeçalhos SC5.'),
      });
    } else if (salesOrders.status !== 200) {
      limitations.push({ endpoint: '/v1/sales-orders', message: `Resposta inesperada: HTTP ${salesOrders.status}.` });
    }

    const failures = datasets.filter((dataset) => dataset.status !== 'OK').length;
    if (failures) {
      limitations.push({ endpoint: 'datasets', message: `${failures} conjunto(s) não passaram na verificação de leitura/paginação.` });
    }

    return {
      mode: 'SIMULATION_READ_ONLY',
      status: failures ? 'BLOCKED' : limitations.length ? 'LIMITED' : 'READY',
      connected: true,
      simulation: true,
      readOnly: true,
      connectsToProtheus: false,
      writesToApplication: false,
      databaseWritePerformed: false,
      checkedAt: new Date().toISOString(),
      datasets,
      limitations,
    };
  }
}
