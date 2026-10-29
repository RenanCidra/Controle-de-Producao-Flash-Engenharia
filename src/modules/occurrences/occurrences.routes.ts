import { Router } from 'express';
import { OccurrencesController } from './occurrences.controller.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.get('/', requirePermission('occurrences:read'), OccurrencesController.list);
router.get('/orders', requirePermission('occurrences:read'), OccurrencesController.findOrders);
router.get('/op/:numeroOp', requirePermission('occurrences:read'), OccurrencesController.listForOp);
router.get('/:id', requirePermission('occurrences:read'), OccurrencesController.detail);
router.post('/', requirePermission('occurrences:create'), allowBodyFields('numeroOp', 'occurrenceType', 'description', 'operation', 'workstation', 'immediateAction'), OccurrencesController.create);
router.post('/:id/events', requirePermission('occurrences:comment'), allowBodyFields('message'), OccurrencesController.addEvent);
router.patch('/:id/status', requirePermission('occurrences:manage'), allowBodyFields('status', 'message'), OccurrencesController.changeStatus);

export default router;

