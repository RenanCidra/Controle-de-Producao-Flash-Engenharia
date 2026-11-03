import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { FeedbackInputError, FeedbackNotFoundError, FeedbackService } from './feedback.service.ts';

function respondError(res: Response, error: unknown) {
  if (error instanceof FeedbackInputError) return res.status(400).json({ error: error.message });
  if (error instanceof FeedbackNotFoundError) return res.status(404).json({ error: error.message });
  console.error('Feedback request failed:', error);
  return res.status(500).json({ error: 'Não foi possível processar o feedback agora.' });
}

export class FeedbackController {
  static async list(_req: AuthenticatedRequest, res: Response) {
    try { return res.json({ items: await FeedbackService.list() }); }
    catch (error) { return respondError(res, error); }
  }
  static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.status(201).json(await FeedbackService.create({ uid: user.uid, name: user.name, email: user.email, loginName: user.loginName }, req.body, req));
    } catch (error) { return respondError(res, error); }
  }
  static async updateStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user!;
      return res.json(await FeedbackService.updateStatus(req.params.id, req.body.status, { uid: user.uid, email: user.email, loginName: user.loginName }, req));
    } catch (error) { return respondError(res, error); }
  }
}
