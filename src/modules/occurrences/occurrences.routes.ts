import express, { Router } from 'express';
import { OccurrencesController } from './occurrences.controller.ts';
import { requireAnyPermission, requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';
import { MAX_IMAGE_BYTES } from '../../lib/private-storage.ts';

const router = Router();
const IMAGE_RAW_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const OCCURRENCE_CREATE_FIELDS = [
  'type',
  'numeroOp',
  'opNumber',
  'op_number',
  'pvNumber',
  'pv_number',
  'numeroPv',
  'parentProduct',
  'parent_product',
  'componentCode',
  'component_code',
  'warehouse',
  'currentBalance',
  'current_balance',
  'occurrenceType',
  'occurrence_type',
  'description',
  'operation',
  'workstation',
  'immediateAction',
  'immediate_action',
  'sector',
  'priority',
  'assigneeId',
  'assignee_id',
  'slaMinutes',
  'sla_minutes',
] as const;

router.get('/', requirePermission('occurrences:read'), OccurrencesController.list);
router.get('/export/csv', requirePermission('occurrences:read'), OccurrencesController.exportCsv);
router.post('/import/preview', requirePermission('occurrences:manage'), allowBodyFields('content'), OccurrencesController.importPreview);
router.post('/import/confirm', requirePermission('occurrences:manage'), allowBodyFields('content', 'skipDuplicates'), OccurrencesController.importConfirm);
router.get('/orders', requirePermission('occurrences:read'), OccurrencesController.findOrders);
router.get('/assignees', requirePermission('occurrences:read'), OccurrencesController.listAssignees);
router.get('/op/:numeroOp', requirePermission('occurrences:read'), OccurrencesController.listForOp);
router.get('/:id', requirePermission('occurrences:read'), OccurrencesController.detail);
router.get('/:id/messages', requirePermission('occurrences:read'), OccurrencesController.listMessages);
router.get('/:id/attachments/:attachmentId/file', requirePermission('occurrences:read'), OccurrencesController.streamAttachmentFile);

router.post('/', requirePermission('occurrences:create'), allowBodyFields(...OCCURRENCE_CREATE_FIELDS), OccurrencesController.create);
router.post(
  '/from-message',
  requirePermission('occurrences:create'),
  allowBodyFields(...OCCURRENCE_CREATE_FIELDS, 'messageKind', 'message_kind', 'messageId', 'message_id', 'body'),
  OccurrencesController.createFromMessage,
);
router.post('/:id/messages', requirePermission('occurrences:comment'), allowBodyFields('body', 'message'), OccurrencesController.addMessage);
router.post('/:id/events', requirePermission('occurrences:comment'), allowBodyFields('message'), OccurrencesController.addEvent);
router.post(
  '/:id/image',
  requirePermission('occurrences:comment'),
  express.raw({ type: IMAGE_RAW_TYPES, limit: MAX_IMAGE_BYTES }),
  OccurrencesController.uploadImage,
);

router.put(
  '/:id/attachments/:attachmentId/drawing',
  requirePermission('occurrences:comment'),
  allowBodyFields('drawingData'),
  OccurrencesController.saveAttachmentDrawing,
);

router.patch('/:id/assign', requirePermission('occurrences:assign'), allowBodyFields('assigneeId', 'assignee_id', 'message', 'note'), OccurrencesController.assign);
router.patch('/:id/complete', requirePermission('occurrences:resolve'), allowBodyFields('resolutionText', 'resolution_text', 'message'), OccurrencesController.complete);
router.patch(
  '/:id/status',
  requireAnyPermission('occurrences:manage', 'occurrences:resolve'),
  allowBodyFields('status', 'message', 'resolutionText', 'resolution_text'),
  OccurrencesController.changeStatus,
);

export default router;
