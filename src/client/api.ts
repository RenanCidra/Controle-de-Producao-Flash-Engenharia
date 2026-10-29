const TOKEN_KEY = 'nexus_erp_jwt_token';
const USER_KEY = 'nexus_erp_user_data';

export interface AuthUser {
  id: number;
  uid: string;
  loginName: string;
  email?: string | null;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR';
  department?: string | null;
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
  };
  errors: string[];
  createdAt: string;
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

    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `Erro HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return data as T;
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
      totalUsers: number;
      totalInventoryItems: number;
      totalProductionLines: number;
      totalProductionOrders: number;
      totalQualityInspections: number;
      totalIntegrations: number;
      totalAuditLogs: number;
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
      organization: any;
    }>('/stats');
  }

  // Auth
  public async login(credentials: { loginName?: string; identifier?: string; password: string }) {
    const identifier = (credentials.identifier || credentials.loginName || '').trim();
    return this.request<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        loginName: identifier,
        password: credentials.password,
      }),
    });
  }

  public getAuthSetupStatus() {
    return this.request<{ setupRequired: boolean; bootstrapEnabled: boolean }>('/auth/setup-status');
  }

  public bootstrapAdmin(payload: { setupSecret: string; loginName: string; name: string; password: string }) {
    return this.request<{ accessToken: string; user: AuthUser }>('/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
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
}

export const api = new ApiService();
