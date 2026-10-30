import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { copilotService } from './copilot.service.ts';

export async function handleCopilotChat(req: AuthenticatedRequest, res: Response) {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'A mensagem não pode ser vazia.' });
    }

    const user = req.user!;
    const response = await copilotService.chat({
      message: message.trim(),
      history,
      user: {
        uid: user.uid,
        name: user.name,
        role: user.role,
        department: user.department,
      },
    });

    return res.json(response);
  } catch (error: any) {
    console.error('Erro no controller do Assistente Flash:', error);
    return res.status(500).json({
      error: 'Falha ao processar solicitação no Assistente Flash.',
      details: error?.message,
    });
  }
}

export async function handleCopilotBriefing(req: AuthenticatedRequest, res: Response) {
  try {
    const user = req.user!;
    const briefing = await copilotService.getBriefing({
      name: user.name,
      role: user.role,
    });
    return res.json(briefing);
  } catch (error: any) {
    console.error('Erro ao gerar briefing no Assistente Flash:', error);
    return res.status(500).json({
      error: 'Falha ao gerar briefing operacional.',
      details: error?.message,
    });
  }
}
