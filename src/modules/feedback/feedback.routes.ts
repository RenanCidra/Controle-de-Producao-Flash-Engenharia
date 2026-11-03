import { Router } from 'express';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';
import { FeedbackController } from './feedback.controller.ts';

const router = Router();
router.get('/', requirePermission('feedback:read'), FeedbackController.list);
router.post('/', requirePermission('feedback:create'), allowBodyFields('category', 'title', 'description', 'sourceScreen'), FeedbackController.create);
router.patch('/:id/status', requirePermission('feedback:manage'), allowBodyFields('status'), FeedbackController.updateStatus);
export default router;
