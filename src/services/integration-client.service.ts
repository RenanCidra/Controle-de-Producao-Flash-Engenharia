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
}

export class IntegrationClientService {
  public static async testEndpoint(params: TestConnectionParams): Promise<TestConnectionResult> {
    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const target = new URL(params.baseUrl);
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
        throw new Error('A URL deve usar HTTP/HTTPS e não pode conter credenciais embutidas.');
      }
      const hostname = target.hostname.toLowerCase().replace(/\.$/, '');
      const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      const allowedHosts = (process.env.INTEGRATION_ALLOWED_HOSTS || '').split(',')
        .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
        .filter(Boolean);
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction && target.protocol !== 'https:') {
        throw new Error('Integrações publicadas devem usar HTTPS.');
      }
      if (isProduction && target.port && target.port !== '443') {
        throw new Error('Integrações publicadas devem usar a porta HTTPS padrão (443).');
      }
      if ((!loopbackHosts.has(hostname) || isProduction) && !allowedHosts.includes(hostname)) {
        throw new Error('O host da integração não está na lista permitida do servidor.');
      }

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
          if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(params.headerName)
            || ['host', 'connection', 'content-length', 'cookie', 'proxy-authorization', 'transfer-encoding'].includes(params.headerName.toLowerCase())) {
            throw new Error('O nome do cabeçalho de autenticação não é permitido.');
          }
          headers[params.headerName] = params.apiKey;
        }
      }

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(params.baseUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'error',
      });

      const latencyMs = Date.now() - startTime;
      // The test only needs the status and headers. Never buffer or return arbitrary remote bodies.
      if (response.body) void response.body.cancel().catch(() => undefined);

      return {
        success: response.ok,
        statusCode: response.status,
        message: response.ok
          ? `Conexão estabelecida com sucesso (${response.status})`
          : `Resposta de erro do servidor remoto: ${response.status} ${response.statusText}`,
        latencyMs,
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
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
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

