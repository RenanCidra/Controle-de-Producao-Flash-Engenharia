import { Response } from 'express';
import { InventoryService } from './inventory.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class InventoryController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const items = await InventoryService.list();
      return res.json(items);
    } catch (error: any) {
      console.error('Failed to list inventory:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar estoque.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const item = await InventoryService.create(actorId, actorEmail, {
        ...req.body,
        quantityOnHand: parseInt(req.body.quantityOnHand || '0', 10),
        minimumStock: parseInt(req.body.minimumStock || '0', 10),
      });
      return res.status(201).json(item);
    } catch (error: any) {
      console.error('Failed to create inventory item:', error);
      return res.status(400).json({ error: error.message || 'Falha ao criar item de estoque.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const updateData: any = { ...req.body };
      if (updateData.quantityOnHand !== undefined) updateData.quantityOnHand = parseInt(updateData.quantityOnHand, 10);
      if (updateData.minimumStock !== undefined) updateData.minimumStock = parseInt(updateData.minimumStock, 10);

      const updated = await InventoryService.update(actorId, actorEmail, id, updateData);
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update inventory item:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar item.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await InventoryService.delete(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete inventory item:', error);
      return res.status(400).json({ error: error.message || 'Falha ao excluir item.' });
    }
  }
}
