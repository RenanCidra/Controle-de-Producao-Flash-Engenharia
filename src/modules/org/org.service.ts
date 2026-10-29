import { OrgRepository } from './org.repository.ts';
import { AuditService } from '../../services/audit.service.ts';

export class OrgService {
  public static async get() {
    return await OrgRepository.getProfile();
  }

  public static async save(
    actorId: string,
    actorEmail: string,
    data: {
      name: string;
      tradeName?: string;
      taxId?: string;
      plantCode?: string;
      email?: string;
      phone?: string;
      timezone?: string;
      address?: string;
    }
  ) {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('A Razão Social / Nome da Planta Industrial é obrigatório.');
    }

    const saved = await OrgRepository.upsertProfile(data);

    await AuditService.record({
      userId: actorId,
      userEmail: actorEmail,
      action: 'UPDATE',
      entity: 'ORGANIZATION',
      entityId: String(saved.id),
      details: { name: saved.name, plantCode: saved.plantCode },
    });

    return saved;
  }
}
