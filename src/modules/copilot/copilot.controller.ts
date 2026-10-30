import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { copilotService } from './copilot.service.ts';

export async function handleCopilotChat(req: AuthenticatedRequest, res: Response) {
  try {
    const { message, history } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Digite uma pergunta para continuar.' });
    }
    if (message.length > 2000) return res.status(400).json({ error: 'A pergunta excede o limite de 2.000 caracteres.' });
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({ error: 'O histórico da conversa está inválido.' });
    }
    const safeHistory = (Array.isArray(history) ? history : []).slice(-10).flatMap((turn) => {
      if (!turn || (turn.role !== 'user' && turn.role !== 'model') || typeof turn.text !== 'string') return [];
      const text = turn.text.trim().slice(0, 1500);
      return text ? [{ role: turn.role as 'user' | 'model', text }] : [];
    });
    const language = req.body?.language;
    const safeLanguage = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
    const personality = req.body?.personality;
    const safePersonality = personality === 'direct' || personality === 'formal' ? personality : 'casual';

    const user = req.user!;
    const response = await copilotService.chat({
      message: message.trim(),
      history: safeHistory,
      language: safeLanguage,
      personality: safePersonality,
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
    });
  }
}

