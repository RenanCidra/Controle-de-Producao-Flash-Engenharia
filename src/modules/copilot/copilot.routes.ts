import express, { Router } from 'express';
import { handleCopilotAudio, handleCopilotChat, handleCopilotBriefing } from './copilot.controller.ts';

const copilotRouter = Router();

// Endpoint de conversa com o Assistente Flash
copilotRouter.post('/chat', handleCopilotChat);
copilotRouter.post('/audio', express.raw({ type: 'audio/*', limit: '5mb' }), handleCopilotAudio);

// Endpoint de geração rápida de briefing do turno
copilotRouter.get('/briefing', handleCopilotBriefing);

export default copilotRouter;
