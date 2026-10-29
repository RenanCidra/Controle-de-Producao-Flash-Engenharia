import { IntegrationsRepository } from './integrations.repository.ts';
import { IntegrationClientService } from '../../services/integration-client.service.ts';
import { AuditService } from '../../services/audit.service.ts';

export class IntegrationsService {
  public static async list() {
    const list = await IntegrationsRepository.findAll();
    // Mask API keys for security in UI responses
    return list.map((item) => ({
      ...item,
      apiKeyMasked: item.apiKey
        ? item.apiKey.length > 8
          ? item.apiKey.substring(0, 4) + '••••••••' + item.apiKey.substring(item.apiKey.length - 4)
          : '••••••••'
        : null,
    }));
  }

  public static async create(
    actorId: string,
    actorEmail: string,
    data: {
      name: string;
      provider: string;
      baseUrl?: string;
      apiKey?: string;
      authType?: string;
      headerName?: string;
    }
  ) {
    if (!data.name || !data.provider) {
      throw new Error('Nome da integração e tipo de provedor são obrigatórios.');
    }

    const created = await IntegrationsRepository.create(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'CREATE',
      entity: 'INTEGRATION',
      entityId: String(created.id),
      details: { name: created.name, provider: created.provider, baseUrl: created.baseUrl },
    });

    return created;
  }

  public static async update(
    actorId: string,
    actorEmail: string,
    id: number,
    data: {
      name?: string;
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      authType?: string;
      headerName?: string;
      status?: 'CONFIGURED' | 'ACTIVE' | 'ERROR' | 'DISABLED';
    }
  ) {
    const existing = await IntegrationsRepository.findById(id);
    if (!existing) {
      throw new Error('Integração não encontrada.');
    }

    const updated = await IntegrationsRepository.update(id, data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'INTEGRATION',
      entityId: String(id),
      details: { previousName: existing.name, changes: { ...data, apiKey: data.apiKey ? '***' : undefined } },
    });

    return updated;
  }

  public static async delete(actorId: string, actorEmail: string, id: number) {
    const existing = await IntegrationsRepository.findById(id);
    if (!existing) {
      throw new Error('Integração não encontrada.');
    }

    await IntegrationsRepository.delete(id);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'DELETE',
      entity: 'INTEGRATION',
      entityId: String(id),
      details: { name: existing.name, provider: existing.provider },
    });

    return { success: true };
  }

  public static async testConnection(actorId: string, actorEmail: string, id: number) {
    const integration = await IntegrationsRepository.findById(id);
    if (!integration) {
      throw new Error('Integração não encontrada.');
    }

    if (!integration.baseUrl) {
      throw new Error('A URL Base (endpoint) da API de terceiros não foi configurada.');
    }

    const result = await IntegrationClientService.testEndpoint({
      baseUrl: integration.baseUrl,
      authType: (integration.authType as any) || 'BEARER',
      apiKey: integration.apiKey || undefined,
      headerName: integration.headerName || undefined,
    });

    const newStatus = result.success ? 'ACTIVE' : 'ERROR';
    await IntegrationsRepository.update(id, {
      status: newStatus,
      lastSyncAt: new Date(),
      lastStatusMessage: result.message,
    });

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'TEST_INTEGRATION',
      entity: 'INTEGRATION',
      entityId: String(id),
      details: {
        provider: integration.provider,
        baseUrl: integration.baseUrl,
        latencyMs: result.latencyMs,
        statusCode: result.statusCode,
        success: result.success,
      },
      status: result.success ? 'SUCCESS' : 'FAILURE',
    });

    return result;
  }
}
