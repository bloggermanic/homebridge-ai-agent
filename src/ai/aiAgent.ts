import { Logger } from 'homebridge';
import { OllamaClient, ChatMessage } from './ollamaClient';
import { SYSTEM_PROMPTS, buildDeviceContext, buildEventSummary, buildOccupancySummary, buildCommandContext } from './prompts';
import { AccessoryRegistry } from '../registry/accessoryRegistry';
import { DeviceController } from '../control/deviceController';
import { EventBus } from '../core/eventBus';
import { DataStore } from '../storage/dataStore';
import {
  AgentResponse,
  DeviceCommand,
  PatternInsight,
  EventType,
  Rule,
} from '../core/types';

interface CommandParseResult {
  intent: 'control' | 'query' | 'suggest' | 'error';
  message: string;
  devices?: Array<{ name: string; action: string; value: unknown }>;
}

interface PatternAnalysisResult {
  insights: PatternInsight[];
}

interface RuleSuggestionResult {
  rules: Array<{
    name: string;
    description: string;
    trigger: string;
    condition: string;
    action: string;
    confidence: number;
  }>;
}

export class AIAgent {
  private ollama: OllamaClient;
  private registry: AccessoryRegistry;
  private controller: DeviceController;
  private eventBus: EventBus;
  private dataStore: DataStore;
  private log: Logger;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private conversationHistory: ChatMessage[] = [];
  private maxHistoryMessages = 20;

  constructor(
    ollama: OllamaClient,
    registry: AccessoryRegistry,
    controller: DeviceController,
    eventBus: EventBus,
    dataStore: DataStore,
    log: Logger,
  ) {
    this.ollama = ollama;
    this.registry = registry;
    this.controller = controller;
    this.eventBus = eventBus;
    this.dataStore = dataStore;
    this.log = log;
  }

  start(analysisIntervalSeconds: number): void {
    if (!this.ollama.isEnabled()) {
      this.log.info('AI Agent: Disabled (Ollama not enabled)');
      return;
    }

    this.analysisInterval = setInterval(async () => {
      try {
        await this.runPeriodicAnalysis();
      } catch (error) {
        this.log.error('AI periodic analysis error:', error);
      }
    }, analysisIntervalSeconds * 1000);

    this.log.info(`AI Agent started (analysis every ${analysisIntervalSeconds}s, model: ${this.ollama.getModel()})`);
  }

  async processCommand(userMessage: string): Promise<AgentResponse> {
    if (!this.ollama.isEnabled()) {
      return { intent: 'error', message: 'AI is disabled in configuration.' };
    }

    const accessories = this.registry.getAll();
    const occupancy = this.dataStore.getAllOccupancy();
    const context = buildCommandContext(userMessage, accessories, occupancy);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.COMMAND_PARSER },
      ...this.conversationHistory.slice(-this.maxHistoryMessages),
      { role: 'user', content: context },
    ];

    try {
      const result = await this.ollama.chatJson<CommandParseResult>(messages);

      this.conversationHistory.push({ role: 'user', content: userMessage });
      this.conversationHistory.push({ role: 'assistant', content: JSON.stringify(result) });
      this.trimHistory();

      if (result.intent === 'control' && result.devices && result.devices.length > 0) {
        return this.executeDeviceCommands(result);
      }

      if (result.intent === 'query') {
        return this.handleQuery(userMessage);
      }

      return { intent: result.intent, message: result.message };
    } catch (error) {
      this.log.error('AI command processing error:', error);
      return { intent: 'error', message: `Failed to process command: ${error}` };
    }
  }

  private async executeDeviceCommands(parsed: CommandParseResult): Promise<AgentResponse> {
    const commands: DeviceCommand[] = [];
    const accessories = this.registry.getAll();

    for (const device of parsed.devices || []) {
      const matched = accessories.filter(a =>
        a.displayName.toLowerCase().includes(device.name.toLowerCase()),
      );

      if (matched.length === 0) {
        this.log.warn(`AI: No device matched "${device.name}"`);
        continue;
      }

      for (const accessory of matched) {
        const charType = this.mapActionToCharacteristic(device.action);
        if (charType) {
          commands.push({
            uniqueId: accessory.uniqueId,
            characteristicType: charType,
            value: device.value ?? this.getDefaultValue(device.action),
          });
        }
      }
    }

    if (commands.length === 0) {
      return { intent: 'error', message: 'Could not match any devices to control.' };
    }

    const results = await this.controller.executeBatch(commands);

    this.eventBus.emit(EventType.AI_COMMAND, {
      commands,
      reasoning: parsed.message,
    });

    const successful = results.filter(r => r.success).length;
    return {
      intent: 'control',
      message: parsed.message,
      commands,
      commandResults: results,
      suggestions: successful < commands.length
        ? [`${commands.length - successful} command(s) failed.`]
        : undefined,
    };
  }

  private async handleQuery(userMessage: string): Promise<AgentResponse> {
    const accessories = this.registry.getAll();
    const events = this.dataStore.getEvents(1);
    const occupancy = this.dataStore.getAllOccupancy();

    const context = [
      buildDeviceContext(accessories),
      buildEventSummary(events),
      buildOccupancySummary(occupancy),
    ].join('\n\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.HOME_AGENT },
      { role: 'user', content: `${context}\n\nUser question: ${userMessage}\n\nRespond with JSON: { "intent": "query", "message": "your answer" }` },
    ];

    try {
      const result = await this.ollama.chatJson<{ intent: string; message: string }>(messages);
      return { intent: 'query', message: result.message };
    } catch {
      return { intent: 'error', message: 'Failed to generate response.' };
    }
  }

  async analyzePatterns(): Promise<PatternInsight[]> {
    if (!this.ollama.isEnabled()) return [];

    const events = this.dataStore.getEvents(24);
    if (events.length < 10) return [];

    const summary = buildEventSummary(events, 50);
    const occupancy = buildOccupancySummary(this.dataStore.getAllOccupancy());

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.PATTERN_ANALYZER },
      { role: 'user', content: `${summary}\n\n${occupancy}\n\nAnalyze these patterns and identify anything notable.` },
    ];

    try {
      const result = await this.ollama.chatJson<PatternAnalysisResult>(messages);
      return result.insights || [];
    } catch (error) {
      this.log.debug('Pattern analysis failed:', error);
      return [];
    }
  }

  async suggestRules(): Promise<Rule[]> {
    if (!this.ollama.isEnabled()) return [];

    const events = this.dataStore.getEvents(48);
    if (events.length < 50) return [];

    const summary = buildEventSummary(events, 100);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.RULE_SUGGESTER },
      { role: 'user', content: `${summary}\n\nBased on these patterns, suggest automation rules that would be helpful.` },
    ];

    try {
      const result = await this.ollama.chatJson<RuleSuggestionResult>(messages);

      return (result.rules || [])
        .filter(r => r.confidence >= 0.7)
        .map((r, i) => ({
          id: `ai-suggested-${Date.now()}-${i}`,
          name: r.name,
          enabled: false,
          priority: 50,
          source: 'ai' as const,
          conditions: [],
          actions: [{ type: 'notify' as const, notification: { title: r.name, message: r.description } }],
        }));
    } catch (error) {
      this.log.debug('Rule suggestion failed:', error);
      return [];
    }
  }

  private async runPeriodicAnalysis(): Promise<void> {
    const insights = await this.analyzePatterns();
    for (const insight of insights) {
      if (insight.confidence >= 0.7) {
        this.eventBus.emit(EventType.AI_SUGGESTION, {
          suggestion: insight.description,
          confidence: insight.confidence,
        });
        this.log.info(`AI Insight: ${insight.description} (${Math.round(insight.confidence * 100)}%)`);
      }
    }
  }

  private mapActionToCharacteristic(action: string): string | null {
    switch (action.toLowerCase()) {
      case 'on': return 'On';
      case 'off': return 'On';
      case 'brightness': return 'Brightness';
      case 'temperature': return 'Target Temperature';
      case 'lock': return 'Lock Target State';
      case 'unlock': return 'Lock Target State';
      default: return null;
    }
  }

  private getDefaultValue(action: string): unknown {
    switch (action.toLowerCase()) {
      case 'on': return true;
      case 'off': return false;
      case 'lock': return 1;
      case 'unlock': return 0;
      default: return true;
    }
  }

  private trimHistory(): void {
    if (this.conversationHistory.length > this.maxHistoryMessages * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryMessages);
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  destroy(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }
}
