import { Router } from 'express';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';
import { DataStore } from '../../storage/dataStore';
import { OllamaClient } from '../../ai/ollamaClient';

export function createSystemRoutes(
  registry: AccessoryRegistry,
  dataStore: DataStore,
  ollama: OllamaClient,
  startTime: number,
): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const ollamaConnected = await ollama.isAvailable();
    res.json({
      status: 'ok',
      uptime: Math.round((Date.now() - startTime) / 1000),
      timestamp: Date.now(),
      ollamaConnected,
      ollamaModel: ollama.getModel(),
      registryConnected: registry.isConnected(),
      accessoryCount: registry.getCount(),
    });
  });

  router.get('/stats', (_req, res) => {
    res.json(dataStore.getStats());
  });

  return router;
}
