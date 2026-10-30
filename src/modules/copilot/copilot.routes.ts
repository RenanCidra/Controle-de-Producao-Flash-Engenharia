import { Router } from 'express';
import { handleCopilotChat, handleCopilotBriefing } from './copilot.controller.ts';

const copilotRouter = Router();

// Endpoint de conversa com o Assistente Flash
copilotRouter.post('/chat', handleCopilotChat);

// Endpoint de geração rápida de briefing do turno
copilotRouter.get('/briefing', handleCopilotBriefing);

export default copilotRouter;
