const TOKEN_KEY = 'nexus_erp_jwt_token';
const USER_KEY = 'nexus_erp_user_data';
const CONNECTOR_ISSUE_KEY = 'nexus_protheus_connector_issue';

export interface ConnectorIssue {
  message: string;
  occurredAt: string;
}

export interface AuthUser {
  id: number;
  uid: string;
  loginName: string;
  email?: string | null;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR';
  department?: string | null;
  avatarUrl?: string | null;
}

export type FeedbackCategory = 'IDEA' | 'BUG' | 'QUESTION' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'IN_REVIEW' | 'PLANNED' | 'COMPLETED' | 'DECLINED';
export interface FeedbackSubmission {
  id: number;
  category: FeedbackCategory;
  title: string;
  description: string;
  sourceScreen: string | null;
  status: FeedbackStatus;
  submitterUid: string;
  submitterName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProtheusSyncResult {
  batchId: number;
  batchCode: string;
  sourceType: 'REST_API' | 'FILE_IMPORT';
  entityType: string;
  totalRecordsProcessed: number;
  details: {
    products?: number;
    structures?: number;
    routings?: number;
    salesOrders?: number;
    productionOrders?: number;
    appointments?: number;
    resources?: number;
    commitments?: number;
  };
  errors: string[];
  createdAt: string;
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
  datasets: Array<{
    entity: string;
    status: 'OK' | 'FAILED';
    sourceFile?: string;
    sourceSheet?: string;
    sourceRows?: number;
    firstPageRecords?: number;
    cursorPaginationVerified?: boolean;
    fields?: string[];
    error?: string;
  }>;
  limitations: Array<{ endpoint: string; message: string }>;
}

export interface ProtheusMockDataPage {
  mode: 'SIMULATION_READ_ONLY';
  entity: string;
  simulation: true;
  readOnly: true;
  writesToApplication: false;
  databaseWritePerformed: false;
  sourceFile: string;
  sourceSheet: string;
  sourceRows: number;
  page: number;
  pageSize: number;
  recordsReturned: number;
  nextCursor: string | null;
  records: Array<Record<string, unknown>>;
}

export interface ProtheusMockFlowCheck {
  mode: 'SIMULATION_DRY_RUN';
  status: 'READY' | 'BLOCKED';
  databaseWritePerformed: false;
  sourceConnection: string;
  datasets: Record<string, Record<string, unknown>>;
  checks: Record<string, Record<string, unknown>>;
  blockers: string[];
  warnings: string[];
}

export interface MirrorFreshness {
  status: 'FRESH' | 'STALE' | 'EMPTY';
  ageMinutes: number | null;
  staleThresholdMinutes: number;
  latestImportAt: string | null;
  latestBatchCode: string | null;
  latestEntityType: string | null;
  latestSourceType: string | null;
  latestRecordsCount: number | null;
}

export interface OccurrenceAnalyticsStats {
  period: {
    from: string | null;
    to: string | null;
    sector: string | null;
    type: string | null;
  };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    cancelled: number;
    activeBacklog: number;
    recurrenceCount: number;
    recurrenceRatePercent: number | null;
    slaBreachedActive: number;
    slaCompliancePercent: number | null;
  };
  responseMetrics: {
    avgFirstResponseMinutes: number | null;
    medianFirstResponseMinutes: number | null;
    firstResponseSampleCount: number;
    avgMttrMinutes: number | null;
    medianMttrMinutes: number | null;
    mttrSampleCount: number;
  };
  backlogBySector: Array<{
    sector: string;
    open: number;
    inProgress: number;
    totalActive: number;
    slaBreached: number;
    avgAgeMinutes: number | null;
  }>;
  backlogByPriority: Array<{
    priority: string;
    totalActive: number;
    slaBreached: number;
  }>;
  byType: Array<{
    type: string;
    total: number;
    active: number;
    resolved: number;
  }>;
  topComponents: Array<{
    componentCode: string;
    total: number;
    active: number;
    recurrences: number;
    impactedOps: number;
  }>;
  topPvs: Array<{
    pvNumber: string;
    clienteNome: string | null;
    total: number;
    active: number;
    impactedOps: number;
  }>;
  weeklyTrend: Array<{
    week: string;
    opened: number;
    resolved: number;
  }>;
  mirrorFreshness: MirrorFreshness;
}

export interface OccurrenceImportRowPreview {
  rowNumber: number;
  validationStatus: 'VALID' | 'DUPLICATE' | 'ERROR';
  opFoundInMirror: boolean | null;
  duplicateOfCode: string | null;
  issues: string[];
  warnings: string[];
  normalized: {
    legacyCode: string | null;
    type: string;
    occurrenceType: string;
    sector: string;
    priority: string;
    status: string;
    numeroOp: string | null;
    pvNumber: string | null;
    parentProduct: string | null;
    componentCode: string | null;
    warehouse: string | null;
    currentBalance: string | null;
    description: string;
    openedAt: string;
  } | null;
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

export interface OccurrenceImportConfirmResult {
  insertedCount: number;
  skippedDuplicates: number;
  missingOpInMirrorCount: number;
  codes: string[];
}

class ApiService {
  private token: string | null = null;
  private user: AuthUser | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = sessionStorage.getItem(TOKEN_KEY);
      const userStr = sessionStorage.getItem(USER_KEY);
      if (userStr) {
        try {
          this.user = JSON.parse(userStr);
        } catch {
          this.user = null;
        }
      }
    }
  }

  public setSession(token: string, user: AuthUser) {
    this.token = token;
    this.user = user;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }

  public clearSession() {
    this.token = null;
    this.user = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  }

  public getToken() {
    return this.token;
  }

  public getUser() {
    return this.user;
  }

  public isAuthenticated() {
    return !!this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(`/api${endpoint}`, { ...options, headers });
    } catch (error) {
      if (endpoint.startsWith('/protheus/sync/')) {
        const message = 'Não foi possível conectar ao serviço de importação. Verifique a API e tente novamente em Configurações > Conectores Protheus.';
        this.saveConnectorIssue(message);
        throw new Error(message);
      }
      throw error;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const rawError = String(data?.error || '');
      const isTechnicalDatabaseError = /Failed query:|DrizzleQueryError|ECONNREFUSED|ECONNRESET|ETIMEDOUT|relation .* does not exist|column .* does not exist|SQLSTATE/i.test(rawError);
      const isProtheusImport = endpoint.startsWith('/protheus/sync/');
      const userMessage = isTechnicalDatabaseError
        ? 'Não foi possível consultar o espelho de produção. Verifique a conexão e as tabelas em Configurações > Conectores Protheus.'
        : isProtheusImport
          ? 'A importação não foi concluída. Revise o arquivo e o mapeamento em Configurações > Conectores Protheus.'
          : rawError || `Erro HTTP ${response.status}: ${response.statusText}`;

      if (isTechnicalDatabaseError || isProtheusImport) this.saveConnectorIssue(userMessage);
      throw new Error(userMessage);
    }

    if (endpoint.startsWith('/protheus/sync/')) {
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        this.saveConnectorIssue('A carga foi processada parcialmente. Confira os registros sinalizados em Configurações > Conectores Protheus.');
      } else {
        this.clearConnectorIssue();
      }
    }
    return data as T;
  }

  private saveConnectorIssue(message: string) {
    try {
      const issue: ConnectorIssue = { message, occurredAt: new Date().toISOString() };
      localStorage.setItem(CONNECTOR_ISSUE_KEY, JSON.stringify(issue));
    } catch { /* Storage is optional; the current request still reports the error. */ }
  }

  public getConnectorIssue(): ConnectorIssue | null {
    try {
      const raw = localStorage.getItem(CONNECTOR_ISSUE_KEY);
      if (!raw) return null;
      const issue = JSON.parse(raw) as ConnectorIssue;
      return typeof issue.message === 'string' && typeof issue.occurredAt === 'string' ? issue : null;
    } catch { return null; }
  }

  public clearConnectorIssue() {
    try { localStorage.removeItem(CONNECTOR_ISSUE_KEY); } catch { /* Storage is optional. */ }
  }

  // System
  public async getHealth() {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`API respondeu HTTP ${response.status}.`);
    const health = await response.json();
    if (health?.status !== 'online') throw new Error('API não está online.');
    return health as {
      status: 'online';
      databaseStatus?: 'online' | 'offline' | 'timeout';
      timestamp: string;
      service: string;
      version: string;
    };
  }

  public getStats() {
    return this.request<{
      totalProtheusPv: number;
      totalProtheusOp: number;
      totalProtheusProducts: number;
      totalProtheusBatches: number;
      totalProtheusStructures: number;
      totalProtheusRoutings: number;
      totalProtheusAppointments: number;
      latestProtheusImport: {
        batchCode: string;
        sourceType: string;
        entityType: string;
        recordsCount: number;
        status: string;
        createdAt: string | null;
      } | null;
      mirrorFreshness?: MirrorFreshness;
      organization: { id: number; name: string; tradeName: string | null; plantCode: string | null; timezone: string } | null;
    }>('/stats');
  }

  // Auth
  public async login(credentials: { loginName?: string; identifier?: string; password: string }) {
    const identifier = (credentials.identifier || credentials.loginName || '').trim();
    const result = await this.request<{ accessToken: string; user: AuthUser } | null>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        loginName: identifier,
        password: credentials.password,
      }),
    });
    if (!result || typeof result.accessToken !== 'string' || !result.accessToken || !result.user) {
      throw new Error('A API não retornou os dados da sessão. Verifique se o serviço e o banco de dados estão disponíveis e tente novamente.');
    }
    return result;
  }

  public changeOwnPassword(payload: { currentPassword: string; newPassword: string }) {
    return this.request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public getOwnAvatar() { return this.request<{ avatarUrl: string | null }>('/auth/avatar'); }
  public updateOwnAvatar(avatarUrl: string | null) {
    return this.request<{ avatarUrl: string | null }>('/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatarUrl }) });
  }

  public getAuthSetupStatus() {
    return this.request<{ setupRequired: boolean; bootstrapEnabled: boolean }>('/auth/setup-status');
  }

  public bootstrapAdmin(payload: { setupSecret: string; loginName: string; name: string; password: string }) {
    return this.request<{ accessToken: string; user: AuthUser } | null>('/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((result) => {
      if (!result || typeof result.accessToken !== 'string' || !result.accessToken || !result.user) {
        throw new Error('A API não retornou os dados da sessão inicial. Verifique se o serviço e o banco de dados estão disponíveis e tente novamente.');
      }
      return result;
    });
  }

  public me() {
    return this.request<{ user: AuthUser }>('/auth/me');
  }

  public logout() {
    return this.request<{ message: string }>('/auth/logout', { method: 'POST' });
  }

  // Users
  public getUsers() {
    return this.request<any[]>('/users');
  }

  public createUser(userData: any) {
    return this.request<any>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  public updateUser(id: number, userData: any) {
    return this.request<any>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  public resetUserPassword(id: number, password: string) {
    return this.request<{ success: boolean; message: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  public deleteUser(id: number) {
    return this.request<{ success: boolean; message: string }>(`/users/${id}`, { method: 'DELETE' });
  }

  // Organization / Factory Profile
  public getOrg() {
    return this.request<any>('/org');
  }

  public updateOrg(data: any) {
    return this.request<any>('/org', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public saveOrg(data: any) {
    return this.updateOrg(data);
  }

  // Inventory
  public getInventory() {
    return this.request<any[]>('/inventory');
  }

  public createInventoryItem(item: any) {
    return this.request<any>('/inventory', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  public updateInventoryItem(id: number, item: any) {
    return this.request<any>(`/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  }

  public deleteInventoryItem(id: number) {
    return this.request<{ message: string }>(`/inventory/${id}`, { method: 'DELETE' });
  }

  // Production Orders (Local)
  public getProductionOrders() {
    return this.request<any[]>('/production-orders');
  }

  public createProductionOrder(order: any) {
    return this.request<any>('/production-orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  public updateProductionOrder(id: number, order: any) {
    return this.request<any>(`/production-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    });
  }

  public deleteProductionOrder(id: number) {
    return this.request<{ message: string }>(`/production-orders/${id}`, { method: 'DELETE' });
  }

  // Production Lines
  public getProductionLines() {
    return this.request<any[]>('/production-lines');
  }

  public createProductionLine(line: any) {
    return this.request<any>('/production-lines', {
      method: 'POST',
      body: JSON.stringify(line),
    });
  }

  public updateProductionLine(id: number, line: any) {
    return this.request<any>(`/production-lines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(line),
    });
  }

  public deleteProductionLine(id: number) {
    return this.request<{ message: string }>(`/production-lines/${id}`, { method: 'DELETE' });
  }

  // Quality Inspections
  public getQualityInspections() {
    return this.request<any[]>('/quality');
  }

  public createQualityInspection(inspection: any) {
    return this.request<any>('/quality', {
      method: 'POST',
      body: JSON.stringify(inspection),
    });
  }

  public deleteQualityInspection(id: number) {
    return this.request<{ message: string }>(`/quality/${id}`, { method: 'DELETE' });
  }

  // Integrations
  public getIntegrations() {
    return this.request<any[]>('/integrations');
  }

  public createIntegration(integration: any) {
    return this.request<any>('/integrations', {
      method: 'POST',
      body: JSON.stringify(integration),
    });
  }

  public updateIntegration(id: number, integration: any) {
    return this.request<any>(`/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(integration),
    });
  }

  public deleteIntegration(id: number) {
    return this.request<{ message: string }>(`/integrations/${id}`, { method: 'DELETE' });
  }

  public testIntegration(id: number) {
    return this.request<any>(`/integrations/${id}/test`, { method: 'POST' });
  }

  // Audit Logs
  public getAuditLogs(params?: {
    entity?: string;
    action?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.entity) query.append('entity', params.entity);
    if (params?.action) query.append('action', params.action);
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('pageSize', String(params.pageSize));
    if (params?.limit) query.append('limit', String(params.limit));
    return this.request<{
      items: any[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/audit-logs?${query.toString()}`);
  }

  // ==========================================
  // TOTVS PROTHEUS NORMALIZATION & TRACEABILITY
  // ==========================================

  public syncProtheusRest(payload: any) {
    return this.request<ProtheusSyncResult>('/protheus/sync/rest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public validateProtheusMock() {
    return this.request<ProtheusMockValidationReport>('/protheus/mock/validate', {
      method: 'GET',
      cache: 'no-store',
    });
  }

  public getProtheusMockData(entity: string, cursor?: string, pageSize = 10) {
    const query = new URLSearchParams({ entity, pageSize: String(pageSize) });
    if (cursor) query.set('cursor', cursor);
    return this.request<ProtheusMockDataPage>(`/protheus/mock/data?${query.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
  }

  public getProtheusMockFlowCheck() {
    return this.request<ProtheusMockFlowCheck>('/protheus/mock/flow-check', {
      method: 'GET',
      cache: 'no-store',
    });
  }

  public syncProtheusUpload(content: string, fileName: string, entityType?: string) {
    return this.request<ProtheusSyncResult>('/protheus/sync/upload', {
      method: 'POST',
      body: JSON.stringify({ content, fileName, entityType }),
    });
  }

  public getProtheusSalesOrders(params?: { search?: string; status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', String(params.limit));
    return this.request<any[]>(`/protheus/pv?${query.toString()}`);
  }

  public getProtheusSalesOrderDetail(numeroPv: string) {
    return this.request<any>(`/protheus/pv/${encodeURIComponent(numeroPv)}`);
  }

  public getProtheusProductionOrders(params?: {
    search?: string;
    status?: string;
    product?: string;
    pv?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.product) query.append('product', params.product);
    if (params?.pv) query.append('pv', params.pv);
    if (params?.limit) query.append('limit', String(params.limit));
    return this.request<any[]>(`/protheus/op?${query.toString()}`);
  }

  public getProtheusProductionOrderDetail(numeroOp: string) {
    return this.request<any>(`/protheus/op/${encodeURIComponent(numeroOp)}`);
  }

  public getProtheusProducts(limit = 100) {
    return this.request<any[]>(`/protheus/products?limit=${limit}`);
  }

  public getProtheusBatches(limit = 50) {
    return this.request<any[]>(`/protheus/batches?limit=${limit}`);
  }

  public getProtheusTableData(entity: string, params?: { search?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return this.request<{ rows: Record<string, unknown>[]; page: number; pageSize: number; total: number }>(
      `/protheus/table-data/${encodeURIComponent(entity)}?${query.toString()}`,
    );
  }

  // ==========================================
  // MODULE 2: ADVANCED TRACEABILITY ENGINE
  // ==========================================

  public getTraceabilityMatrix(params?: {
    search?: string;
    numeroPv?: string;
    numeroOp?: string;
    cliente?: string;
    codigoProduto?: string;
    statusOp?: string;
    statusPv?: string;
    postoTrabalho?: string;
    dataInicio?: string;
    dataFim?: string;
    situacaoPrazo?: 'NO_PRAZO' | 'ATRASADO' | 'RISCO_ATRASO' | 'CONCLUIDO' | 'SEM_PREVISAO';
    apenasAtrasadas?: boolean;
    apenasComRefugo?: boolean;
    semVinculoPv?: boolean;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    return this.request<{
      items: any[];
      total: number;
      page: number;
      limit: number;
      summary: {
        totalOps: number;
        totalPlanejado: number;
        totalProduzido: number;
        totalRefugo: number;
        percentualProduzido: number | null;
        porSituacao: Record<'NO_PRAZO' | 'ATRASADO' | 'RISCO_ATRASO' | 'CONCLUIDO' | 'SEM_PREVISAO', number>;
        principaisProdutos: Array<{ codigoProduto: string; descricaoProduto: string; quantidadeProduzida: number; totalOps: number }>;
      };
    }>(`/traceability/matrix?${query.toString()}`);
  }

  public getTraceabilityOpDetail(numeroOp: string) {
    return this.request<any>(`/traceability/op/${encodeURIComponent(numeroOp)}`);
  }

  public getTraceabilityMetrics() {
    return this.request<{
      totalOps: number;
      totalPvs: number;
      opsEmAndamento: number;
      opsConcluidas: number;
      opsAtrasadas: number;
      opsComRefugo: number;
      taxaEntregaPrazoPercentual: number;
    }>('/traceability/metrics');
  }

  public getOccurrences(params?: Record<string, string | number | boolean | undefined>) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.append(key, String(value));
    });
    return this.request<any>(`/occurrences?${query.toString()}`);
  }

  public getOccurrenceStats(params?: { from?: string; to?: string; sector?: string; type?: string }) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.append(key, String(value));
    });
    const suffix = query.size ? `?${query.toString()}` : '';
    return this.request<OccurrenceAnalyticsStats>(`/stats/occurrences${suffix}`);
  }

  public getCommunicationDirectory() { return this.request<Array<{ id: number; name: string; department: string | null; role?: string; avatarUrl?: string | null }>>('/communications/directory'); }
  public getCommunicationDirectConversations() { return this.request<any[]>('/communications/direct'); }
  private communicationMessagePage(path: string, params?: { beforeId?: number; afterId?: number; changedAfter?: string; limit?: number }) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
    return this.request<any[]>(`${path}${query.size ? `?${query.toString()}` : ''}`);
  }
  private communicationMessageSearch(path: string, search: string, beforeId?: number) {
    const query = new URLSearchParams({ search, limit: '30' });
    if (beforeId !== undefined) query.set('beforeId', String(beforeId));
    return this.request<{ items: any[]; total: number }>(`${path}?${query.toString()}`);
  }
  public getCommunicationDirectMessages(conversationId: number, params?: { beforeId?: number; afterId?: number; changedAfter?: string; limit?: number }) { return this.communicationMessagePage(`/communications/direct/${conversationId}/messages`, params); }
  public searchCommunicationDirectMessages(conversationId: number, search: string, beforeId?: number) { return this.communicationMessageSearch(`/communications/direct/${conversationId}/messages`, search, beforeId); }
  public clearCommunicationDirectHistory(conversationId: number) { return this.request<{ success: boolean }>(`/communications/direct/${conversationId}/clear`, { method: 'PATCH' }); }
  public markCommunicationDirectRead(conversationId: number) { return this.request<{ success: boolean }>(`/communications/direct/${conversationId}/read`, { method: 'PATCH' }); }
  public startCommunicationDirectMessage(recipientId: number, body: string) { return this.request<{ conversationId: number; message: any }>('/communications/direct/messages', { method: 'POST', body: JSON.stringify({ recipientId, body }) }); }
  public sendCommunicationDirectMessage(conversationId: number, body: string, replyToMessageId?: number | null) { return this.request<any>(`/communications/direct/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body, replyToMessageId }) }); }
  public deleteCommunicationDirectMessage(conversationId: number, messageId: number) { return this.request<{ success: boolean }>(`/communications/direct/${conversationId}/messages/${messageId}`, { method: 'DELETE' }); }
  public addCommunicationDirectReaction(conversationId: number, messageId: number, emoji: string) { return this.request<{ success: boolean }>(`/communications/direct/${conversationId}/messages/${messageId}/reactions`, { method: 'PUT', body: JSON.stringify({ emoji }) }); }
  public removeCommunicationDirectReaction(conversationId: number, messageId: number, emoji: string) { return this.request<{ success: boolean }>(`/communications/direct/${conversationId}/messages/${messageId}/reactions`, { method: 'DELETE', body: JSON.stringify({ emoji }) }); }
  public sendCommunicationDirectAudio(conversationId: number, audio: Blob, durationMs: number) { return this.uploadCommunicationAudio(`/communications/direct/${conversationId}/audio`, audio, durationMs); }
  public getCommunicationDirectAudio(conversationId: number, messageId: number) { return this.getPrivateAudio(`/communications/direct/${conversationId}/messages/${messageId}/audio`); }
  public sendCommunicationDirectImage(conversationId: number, file: Blob, caption?: string) { return this.uploadPrivateImage(`/communications/direct/${conversationId}/image`, file, caption); }
  public getCommunicationDirectImage(conversationId: number, messageId: number) { return this.getPrivateBlobUrl(`/communications/direct/${conversationId}/messages/${messageId}/image`, 'Não foi possível carregar a imagem.'); }
  public saveCommunicationDirectDrawing(conversationId: number, messageId: number, drawingData: DrawingOverlayData) {
    return this.request<any>(`/communications/direct/${conversationId}/messages/${messageId}/drawing`, {
      method: 'PUT',
      body: JSON.stringify({ drawingData }),
    });
  }
  public getCommunicationDirectProfile(conversationId: number) { return this.request<{ id: number; name: string; department: string | null; role: string; status: string; avatarUrl?: string | null }>(`/communications/direct/${conversationId}/profile`); }
  public getCommunicationGroups() { return this.request<any[]>('/communications/groups'); }
  public getCommunicationMessages(groupId: number, params?: { beforeId?: number; afterId?: number; changedAfter?: string; limit?: number }) { return this.communicationMessagePage(`/communications/groups/${groupId}/messages`, params); }
  public searchCommunicationGroupMessages(groupId: number, search: string, beforeId?: number) { return this.communicationMessageSearch(`/communications/groups/${groupId}/messages`, search, beforeId); }
  public clearCommunicationGroupHistory(groupId: number) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}/clear`, { method: 'PATCH' }); }
  public deleteCommunicationGroup(groupId: number) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}`, { method: 'DELETE' }); }
  public getCommunicationGroupMembers(groupId: number) { return this.request<Array<{ id: number; name: string; department: string | null; role: string; avatarUrl?: string | null }>>(`/communications/groups/${groupId}/members`); }
  public markCommunicationGroupRead(groupId: number) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}/read`, { method: 'PATCH' }); }
  public createCommunicationGroup(name: string, sector: string, memberIds: number[]) { return this.request<any>('/communications/groups', { method: 'POST', body: JSON.stringify({ name, sector, memberIds }) }); }
  public sendCommunicationMessage(groupId: number, body: string, replyToMessageId?: number | null) { return this.request<any>(`/communications/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ body, replyToMessageId }) }); }
  public deleteCommunicationMessage(groupId: number, messageId: number) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}/messages/${messageId}`, { method: 'DELETE' }); }
  public addCommunicationGroupReaction(groupId: number, messageId: number, emoji: string) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}/messages/${messageId}/reactions`, { method: 'PUT', body: JSON.stringify({ emoji }) }); }
  public removeCommunicationGroupReaction(groupId: number, messageId: number, emoji: string) { return this.request<{ success: boolean }>(`/communications/groups/${groupId}/messages/${messageId}/reactions`, { method: 'DELETE', body: JSON.stringify({ emoji }) }); }
  public sendCommunicationGroupAudio(groupId: number, audio: Blob, durationMs: number) { return this.uploadCommunicationAudio(`/communications/groups/${groupId}/audio`, audio, durationMs); }
  public getCommunicationGroupAudio(groupId: number, messageId: number) { return this.getPrivateAudio(`/communications/groups/${groupId}/messages/${messageId}/audio`); }
  public sendCommunicationGroupImage(groupId: number, file: Blob, caption?: string) { return this.uploadPrivateImage(`/communications/groups/${groupId}/image`, file, caption); }
  public getCommunicationGroupImage(groupId: number, messageId: number) { return this.getPrivateBlobUrl(`/communications/groups/${groupId}/messages/${messageId}/image`, 'Não foi possível carregar a imagem.'); }
  public saveCommunicationGroupDrawing(groupId: number, messageId: number, drawingData: DrawingOverlayData) {
    return this.request<any>(`/communications/groups/${groupId}/messages/${messageId}/drawing`, {
      method: 'PUT',
      body: JSON.stringify({ drawingData }),
    });
  }

  private async uploadCommunicationAudio(path: string, audio: Blob, durationMs: number) {
    const response = await fetch(`/api${path}?durationMs=${Math.round(durationMs)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.token || ''}`, 'Content-Type': audio.type.split(';')[0] || 'audio/webm' }, body: audio,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o áudio.');
    return data;
  }

  private async uploadPrivateImage(path: string, file: Blob, caption?: string) {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('A imagem excede o limite máximo de 5 MB.');
    }
    const query = caption?.trim() ? `?caption=${encodeURIComponent(caption.trim().slice(0, 500))}` : '';
    const response = await fetch(`/api${path}${query}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token || ''}`,
        'Content-Type': file.type.split(';')[0] || 'image/png',
      },
      body: file,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a imagem.');
    return data;
  }

  private async getPrivateAudio(path: string): Promise<string> {
    return this.getPrivateBlobUrl(path, 'Não foi possível carregar o áudio.');
  }

  private async getPrivateBlobUrl(path: string, fallbackMessage: string): Promise<string> {
    const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${this.token || ''}` } });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || fallbackMessage); }
    return URL.createObjectURL(await response.blob());
  }

  public getOccurrencesForOp(numeroOp: string) {
    return this.request<any[]>(`/occurrences/op/${encodeURIComponent(numeroOp)}`);
  }

  public getOccurrence(id: number) {
    return this.request<any>(`/occurrences/${id}`);
  }

  public searchOccurrenceOrders(search: string) {
    const query = new URLSearchParams({ search });
    return this.request<any[]>(`/occurrences/orders?${query.toString()}`);
  }

  public createOccurrence(payload: {
    numeroOp?: string; opNumber?: string; pvNumber?: string; parentProduct?: string; componentCode?: string;
    warehouse?: string; currentBalance?: number | string; type?: string; sector?: string; priority?: string;
    assigneeId?: number; slaMinutes?: number;
    occurrenceType?: string; description: string;
    operation?: string; workstation?: string; immediateAction?: string;
  }) {
    return this.request<any>('/occurrences', { method: 'POST', body: JSON.stringify(payload) });
  }

  public createOccurrenceFromMessage(payload: {
    messageKind?: 'group' | 'direct'; messageId?: number; body?: string;
    type?: string; opNumber?: string; numeroOp?: string; pvNumber?: string; parentProduct?: string;
    componentCode?: string; warehouse?: string; currentBalance?: number | string;
    sector?: string; priority?: string; assigneeId?: number;
    occurrenceType?: string; description?: string;
  }) {
    return this.request<any>('/occurrences/from-message', { method: 'POST', body: JSON.stringify(payload) });
  }

  public getOccurrenceAssignees() {
    return this.request<Array<{ id: number; uid: string; name: string; role: string; department: string | null; avatarUrl: string | null }>>('/occurrences/assignees');
  }

  public assignOccurrence(id: number, assigneeId: number | 'me', message?: string) {
    return this.request<any>(`/occurrences/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigneeId, message }) });
  }

  public getOccurrenceMessages(id: number) {
    return this.request<{ messages: any[]; attachments: any[] }>(`/occurrences/${id}/messages`);
  }

  public addOccurrenceMessage(id: number, body: string) {
    return this.request<{ message: any; occurrence: any }>(`/occurrences/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
  }

  public completeOccurrence(id: number, resolutionText: string) {
    return this.request<any>(`/occurrences/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ resolutionText }) });
  }

  public addOccurrenceEvent(id: number, message: string) {
    return this.request<any>(`/occurrences/${id}/events`, { method: 'POST', body: JSON.stringify({ message }) });
  }

  public changeOccurrenceStatus(id: number, status: string, message: string, resolutionText?: string) {
    return this.request<any>(`/occurrences/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, message, resolutionText }) });
  }

  public uploadOccurrenceImage(occurrenceId: number, file: Blob, caption?: string) {
    return this.uploadPrivateImage(`/occurrences/${occurrenceId}/image`, file, caption);
  }

  public getOccurrenceAttachmentFile(occurrenceId: number, attachmentId: number) {
    return this.getPrivateBlobUrl(`/occurrences/${occurrenceId}/attachments/${attachmentId}/file`, 'Não foi possível carregar o anexo.');
  }

  public saveOccurrenceAttachmentDrawing(occurrenceId: number, attachmentId: number, drawingData: DrawingOverlayData) {
    return this.request<any>(`/occurrences/${occurrenceId}/attachments/${attachmentId}/drawing`, {
      method: 'PUT',
      body: JSON.stringify({ drawingData }),
    });
  }

  public async downloadOccurrencesCsv(params?: Record<string, any>) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const res = await fetch(`/api/occurrences/export/csv?${query.toString()}`, { headers });
    if (!res.ok) throw new Error('Falha ao exportar CSV de ocorrências.');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_ocorrencias_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  public previewOccurrencesImport(content: string) {
    return this.request<OccurrenceImportPreviewResult>('/occurrences/import/preview', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  public confirmOccurrencesImport(content: string, skipDuplicates = true) {
    return this.request<OccurrenceImportConfirmResult>('/occurrences/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ content, skipDuplicates }),
    });
  }

  // Notifications & Web Push
  public getNotifications() {
    return this.request<NotificationInboxResponse>('/notifications');
  }

  public markNotificationRead(id: number) {
    return this.request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  public markAllNotificationsRead() {
    return this.request<{ markedCount: number }>('/notifications/read-all', { method: 'PATCH' });
  }

  public getNotificationPreferences() {
    return this.request<NotificationPreferencesResponse>('/notifications/preferences');
  }

  public updateNotificationPreferences(payload: {
    scope?: NotificationScope;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }) {
    return this.request<NotificationPreferencesResponse>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public getVapidPublicKey() {
    return this.request<{ enabled: boolean; publicKey: string | null }>('/notifications/push/vapid-public-key');
  }

  public subscribePush(payload: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    deviceLabel?: string;
  }) {
    return this.request<{ id: number; userId: number; deviceLabel: string | null; isActive: boolean }>('/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public unsubscribePush(endpoint?: string | null) {
    return this.request<{ removed: number }>('/notifications/subscribe', {
      method: 'DELETE',
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
  }

  public getShiftSummary() {
    return this.request<ShiftBacklogSummary>('/notifications/shift-summary');
  }

  public async downloadTraceabilityCsv(params?: Record<string, any>) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`/api/traceability/export/csv?${query.toString()}`, { headers });
    if (!res.ok) throw new Error('Falha ao exportar CSV de rastreabilidade');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_rastreabilidade_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  public async downloadTraceabilityJson(params?: Record<string, any>) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`/api/traceability/export/json?${query.toString()}`, { headers });
    if (!res.ok) throw new Error('Falha ao exportar JSON de rastreabilidade');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_rastreabilidade_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Assistente Flash (Copilot & PCP Intelligence)
  public async sendCopilotMessage(
    message: string,
    history?: Array<{ role: 'user' | 'model'; text: string }>,
    language: 'pt-BR' | 'en-US' | 'es-ES' = 'pt-BR',
    personality: 'direct' | 'casual' | 'formal' = 'casual',
  ): Promise<{ reply: string; mode: 'gemini' | 'data_fallback'; actions?: Array<{ type: string; target: string; label: string }> }> {
    return this.request('/copilot/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history, language, personality }),
    });
  }

  public async sendCopilotAudio(audio: Blob, history: Array<{ role: 'user' | 'model'; text: string }> = [], language: 'pt-BR' | 'en-US' | 'es-ES' = 'pt-BR', personality: 'direct' | 'casual' | 'formal' = 'casual') {
    const response = await fetch('/api/copilot/audio', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token || ''}`,
        'Content-Type': audio.type.split(';')[0] || 'audio/webm',
        'X-Copilot-History': JSON.stringify(history.slice(-6)),
        'X-Copilot-Language': language,
        'X-Copilot-Personality': personality,
      },
      body: audio,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível analisar o áudio.');
    return data as { reply: string; mode: 'gemini' | 'data_fallback'; actions?: Array<{ type: string; target: string; label: string }> };
  }

  public async getCopilotBriefing(): Promise<{ reply: string; mode: 'gemini' | 'data_fallback'; actions?: Array<{ type: string; target: string; label: string }> }> {
    return this.request('/copilot/briefing');
  }

  public async createFeedback(input: { category: FeedbackCategory; title: string; description: string; sourceScreen?: string }) {
    return this.request<FeedbackSubmission>('/feedback', { method: 'POST', body: JSON.stringify(input) });
  }

  public async getFeedback() {
    return this.request<{ items: FeedbackSubmission[] }>('/feedback');
  }

  public async updateFeedbackStatus(id: number, status: FeedbackStatus) {
    return this.request<FeedbackSubmission>(`/feedback/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  // Controle de Colaboradores (Planejado - Supervisores e Administradores)
  public async getEmployees() {
    return this.request<{ employees: Employee[]; metrics: EmployeeMetrics }>('/employees');
  }

  public async getEligibleUsersForEmployee() {
    return this.request<Array<{ id: number; uid: string; loginName: string; name: string; role: string; employeeId: number | null }>>('/employees/eligible-users');
  }

  public async createEmployee(input: { name: string; employeeCode?: string | null; department?: string | null; status?: string; linkedUserId?: number | null }) {
    return this.request<Employee>('/employees', { method: 'POST', body: JSON.stringify(input) });
  }

  public async updateEmployee(id: number, input: { name?: string; employeeCode?: string | null; department?: string | null; status?: string; linkedUserId?: number | null }) {
    return this.request<Employee>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  }

  public async deleteEmployee(id: number) {
    return this.request<{ success: boolean }>(`/employees/${id}`, { method: 'DELETE' });
  }
}

export interface Employee {
  id: number;
  organizationId: number | null;
  employeeCode: string | null;
  name: string;
  department: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  linkedUserId?: number | null;
  linkedUserUid?: string | null;
  linkedUserLogin?: string | null;
  linkedUserRole?: string | null;
  linkedUserAvatar?: string | null;
}

export type DrawingTool = 'pen' | 'arrow' | 'circle' | 'text';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points?: DrawingPoint[];
  start?: DrawingPoint;
  end?: DrawingPoint;
  text?: string;
}

export interface DrawingOverlayData {
  version: 1;
  strokes: DrawingStroke[];
  updatedAt?: string;
}

export type NotificationScope = 'MINE' | 'SECTOR' | 'ALL';

export interface AppNotification {
  id: number;
  userId: number;
  occurrenceId: number | null;
  type: string;
  title: string;
  bodyPreview: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ShiftBacklogSummary {
  totalOpen: number;
  slaBreached: number;
  bySector: Array<{ sector: string; open: number; breached: number }>;
}

export interface NotificationInboxResponse {
  items: AppNotification[];
  unreadCount: number;
  shiftSummary: ShiftBacklogSummary;
}

export interface NotificationPreferencesResponse {
  scope: NotificationScope;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  activeSubscriptionsCount: number;
}

export interface EmployeeMetrics {
  total: number;
  active: number;
  inactive: number;
  linkedAccounts: number;
  unlinkedOperators: number;
  departmentsCount: number;
  departments: string[];
}

export const api = new ApiService();


