import { Router } from 'express';
import { AIAgent } from '../../ai/aiAgent';

export function createChatRoutes(aiAgent: AIAgent): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message (string) is required' });
      return;
    }

    const response = await aiAgent.processCommand(message);
    res.json(response);
  });

  router.post('/analyze', async (_req, res) => {
    const insights = await aiAgent.analyzePatterns();
    res.json({ insights });
  });

  router.post('/suggest-rules', async (_req, res) => {
    const rules = await aiAgent.suggestRules();
    res.json({ rules });
  });

  router.post('/clear-history', (_req, res) => {
    aiAgent.clearHistory();
    res.json({ status: 'ok', message: 'Conversation history cleared' });
  });

  return router;
}
