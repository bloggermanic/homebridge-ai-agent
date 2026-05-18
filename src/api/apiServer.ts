import { Logger } from 'homebridge';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { createAuthMiddleware, validateWsToken } from './middleware/auth';
import { createSystemRoutes } from './routes/system';
import { createAccessoryRoutes } from './routes/accessories';
import { createEventRoutes } from './routes/events';
import { createAutomationRoutes } from './routes/automation';
import { createChatRoutes } from './routes/chat';
import { AccessoryRegistry } from '../registry/accessoryRegistry';
import { DeviceController } from '../control/deviceController';
import { DataStore } from '../storage/dataStore';
import { RuleEngine } from '../rules/ruleEngine';
import { OllamaClient } from '../ai/ollamaClient';
import { AIAgent } from '../ai/aiAgent';
import { EventBus } from '../core/eventBus';

export interface ApiServerDeps {
  registry: AccessoryRegistry;
  controller: DeviceController;
  dataStore: DataStore;
  ruleEngine: RuleEngine;
  ollama: OllamaClient;
  aiAgent: AIAgent;
  eventBus: EventBus;
  apiToken?: string;
  log: Logger;
}

export class ApiServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private log: Logger;
  private deps: ApiServerDeps;
  private startTime = Date.now();

  constructor(deps: ApiServerDeps) {
    this.deps = deps;
    this.log = deps.log;
  }

  start(port: number): void {
    const app = express();
    app.use(express.json());
    app.use(createAuthMiddleware(this.deps.apiToken));

    app.use('/api', createSystemRoutes(this.deps.registry, this.deps.dataStore, this.deps.ollama, this.startTime));
    app.use('/api/accessories', createAccessoryRoutes(this.deps.registry, this.deps.controller));
    app.use('/api/events', createEventRoutes(this.deps.dataStore));
    app.use('/api/automation', createAutomationRoutes(this.deps.ruleEngine, this.deps.registry));
    app.use('/api/chat', createChatRoutes(this.deps.aiAgent));

    this.server = http.createServer(app);
    this.setupWebSocket();

    this.server.listen(port, () => {
      this.log.info(`API server listening on port ${port}`);
    });
  }

  private setupWebSocket(): void {
    if (!this.server) return;

    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/', `http://localhost`);
      const token = url.searchParams.get('token') || undefined;

      if (!validateWsToken(token, this.deps.apiToken)) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      this.log.info('WebSocket client connected');

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWsMessage(ws, message);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.log.debug('WebSocket client disconnected');
      });

      const recent = this.deps.eventBus.getHistory(50);
      ws.send(JSON.stringify({ type: 'history', data: recent }));
    });

    this.deps.eventBus.onAny((event) => {
      this.broadcast({ type: 'event', data: event });
    });
  }

  private async handleWsMessage(ws: WebSocket, message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'chat': {
        const response = await this.deps.aiAgent.processCommand(message.message as string);
        ws.send(JSON.stringify({ type: 'chat_response', data: response }));
        break;
      }
      case 'command': {
        const result = await this.deps.controller.execute({
          uniqueId: message.uniqueId as string,
          characteristicType: message.characteristicType as string,
          value: message.value,
        });
        ws.send(JSON.stringify({ type: 'command_result', data: result }));
        break;
      }
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
    }
  }

  private broadcast(data: unknown): void {
    if (!this.wss) return;
    const message = JSON.stringify(data);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
