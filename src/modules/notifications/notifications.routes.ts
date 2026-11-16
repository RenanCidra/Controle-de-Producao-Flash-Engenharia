import { Router } from 'express';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';
import { NotificationsController } from './notifications.controller.ts';

const router = Router();

router.get('/', requirePermission('occurrences:read'), NotificationsController.listForUser);
router.patch('/read-all', requirePermission('occurrences:read'), NotificationsController.markAllRead);
router.patch('/:id/read', requirePermission('occurrences:read'), NotificationsController.markRead);

router.get('/preferences', requirePermission('occurrences:read'), NotificationsController.getPreferences);
router.put(
  '/preferences',
  requirePermission('occurrences:read'),
  allowBodyFields('scope', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd'),
  NotificationsController.updatePreferences,
);

router.get('/push/vapid-public-key', requirePermission('occurrences:read'), NotificationsController.getVapidPublicKey);
router.post(
  '/subscribe',
  requirePermission('occurrences:read'),
  allowBodyFields('endpoint', 'keys', 'p256dh', 'auth', 'deviceLabel', 'device_label'),
  NotificationsController.subscribe,
);
router.delete(
  '/subscribe',
  requirePermission('occurrences:read'),
  allowBodyFields('endpoint'),
  NotificationsController.unsubscribe,
);

router.get('/shift-summary', requirePermission('occurrences:read'), NotificationsController.shiftSummary);
router.post(
  '/send',
  requirePermission('occurrences:manage'),
  allowBodyFields('userId', 'occurrenceId', 'type', 'sector', 'title', 'bodyPreview'),
  NotificationsController.send,
);
router.post('/escalate', requirePermission('occurrences:manage'), NotificationsController.escalate);

export default router;
