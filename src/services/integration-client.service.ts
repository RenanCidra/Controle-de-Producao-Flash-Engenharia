export interface TestConnectionParams {
  baseUrl: string;
  authType: 'BEARER' | 'HEADER' | 'BASIC' | 'NONE';
  apiKey?: string;
  headerName?: string;
}

export interface TestConnectionResult {
  success: boolean;
  statusCode: number;
  message: string;
  latencyMs: number;
  responseData?: unknown;
}

export class IntegrationClientService {
  public static async testEndpoint(params: TestConnectionParams): Promise<TestConnectionResult> {
    const startTime = Date.now();
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'NexusERP-IntegrationEngine/1.0',
      };

      if (params.apiKey) {
        if (params.authType === 'BEARER') {
          headers['Authorization'] = `Bearer ${params.apiKey}`;
        } else if (params.authType === 'BASIC') {
          headers['Authorization'] = `Basic ${Buffer.from(params.apiKey).toString('base64')}`;
        } else if (params.authType === 'HEADER' && params.headerName) {
          headers[params.headerName] = params.apiKey;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(params.baseUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      let responseData: unknown = null;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }

      return {
        success: response.ok,
        statusCode: response.status,
        message: response.ok
          ? `Conexão estabelecida com sucesso (${response.status})`
          : `Resposta de erro do servidor remoto: ${response.status} ${response.statusText}`,
        latencyMs,
        responseData,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        statusCode: 0,
        message: error.name === 'AbortError'
          ? 'Timeout: O servidor remoto demorou mais de 8s para responder.'
          : `Falha de rede ou URL inválida: ${error.message}`,
        latencyMs,
      };
    }
  }

  public static async dispatchWebhook(url: string, payload: Record<string, unknown>, secret?: string): Promise<{ success: boolean; status: number }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusERP-WebhookEngine/1.0',
      };

      if (secret) {
        headers['X-Nexus-Signature'] = secret;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          data: payload,
        }),
      });

      return { success: response.ok, status: response.status };
    } catch {
      return { success: false, status: 0 };
    }
  }
}
