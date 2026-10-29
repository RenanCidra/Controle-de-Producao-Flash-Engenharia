import { Response } from 'express';
import { ProductionOrdersService } from './production-orders.service.ts';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';

export class ProductionOrdersController {
  public static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const orders = await ProductionOrdersService.list();
      return res.json(orders);
    } catch (error: any) {
      console.error('Failed to list production orders:', error);
      return res.status(500).json({ error: error.message || 'Falha ao buscar ordens de produção.' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const order = await ProductionOrdersService.create(actorId, actorEmail, {
        ...req.body,
        inventoryItemId: parseInt(req.body.inventoryItemId, 10),
        productionLineId: req.body.productionLineId ? parseInt(req.body.productionLineId, 10) : undefined,
        quantityPlanned: parseInt(req.body.quantityPlanned, 10),
      });
      return res.status(201).json(order);
    } catch (error: any) {
      console.error('Failed to create production order:', error);
      return res.status(400).json({ error: error.message || 'Falha ao abrir ordem de produção.' });
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const updateData: any = { ...req.body };
      if (updateData.productionLineId) updateData.productionLineId = parseInt(updateData.productionLineId, 10);
      if (updateData.quantityProduced !== undefined) updateData.quantityProduced = parseInt(updateData.quantityProduced, 10);
      if (updateData.quantityScrap !== undefined) updateData.quantityScrap = parseInt(updateData.quantityScrap, 10);

      const updated = await ProductionOrdersService.update(actorId, actorEmail, id, updateData);
      return res.json(updated);
    } catch (error: any) {
      console.error('Failed to update production order:', error);
      return res.status(400).json({ error: error.message || 'Falha ao atualizar ordem de produção.' });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

      const actorId = req.user?.uid || String(req.user?.userId);
      const actorEmail = req.user?.email || 'system';

      const result = await ProductionOrdersService.delete(actorId, actorEmail, id);
      return res.json(result);
    } catch (error: any) {
      console.error('Failed to delete production order:', error);
      return res.status(400).json({ error: error.message || 'Falha ao excluir ordem de produção.' });
    }
  }
}
