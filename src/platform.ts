import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import path from 'path';
import { PLATFORM_NAME, PLUGIN_NAME, resolveConfig } from './settings';
import { EventBus } from './core/eventBus';
import { DataStore } from './storage/dataStore';
import { ConfigUiXClient } from './registry/configUiXClient';
import { HoobsClient, HomebridgeClientInterface } from './registry/homebridgeClient';
import { AccessoryRegistry } from './registry/accessoryRegistry';
import { DeviceController } from './control/deviceController';
import { OllamaClient } from './ai/ollamaClient';
import { AIAgent } from './ai/aiAgent';
import { RuleEngine } from './rules/ruleEngine';
import { ApiServer } from './api/apiServer';
import { createLightingRules } from './rules/rules/lightingRule';
import { createEnergyRules } from './rules/rules/energyRule';
import { createSecurityRules } from './rules/rules/securityRule';
import { EventType } from './core/types';
import { VirtualAccessoryManager } from './accessories/virtualAccessoryManager';

export { PLATFORM_NAME, PLUGIN_NAME };

export class AIAgentPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly cachedAccessories: PlatformAccessory[] = [];

  private eventBus: EventBus;
  private dataStore: DataStore;
  private homebridgeClient!: HomebridgeClientInterface;
  private registry!: AccessoryRegistry;
  private controller: DeviceController;
  private ollama: OllamaClient;
  private aiAgent: AIAgent;
  private ruleEngine: RuleEngine;
  private apiServer: ApiServer;
  private virtualAccessories: VirtualAccessoryManager | null = null;
  private resolvedConfig: ReturnType<typeof resolveConfig>;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.resolvedConfig = resolveConfig(config as unknown as Record<string, unknown>);
    const resolved = this.resolvedConfig;
    this.log.info('Initializing AI Home Automation Agent');

    const storagePath = path.join(api.user.storagePath(), 'ai-agent-data');

    this.eventBus = new EventBus();
    this.dataStore = new DataStore(storagePath, log);

    this.homebridgeClient = this.createClient(resolved, log);

    this.registry = new AccessoryRegistry(
      this.homebridgeClient, api, this.eventBus, resolved.accessoryPollInterval, log,
    );

    this.controller = new DeviceController(
      this.registry, this.homebridgeClient, this.eventBus, log,
    );

    this.ollama = new OllamaClient({
      baseUrl: resolved.ollamaUrl,
      model: resolved.ollamaModel,
      timeout: 60000,
      temperature: 0.3,
    }, resolved.enableAI, log);

    this.aiAgent = new AIAgent(
      this.ollama, this.registry, this.controller, this.eventBus, this.dataStore, log,
    );

    this.ruleEngine = new RuleEngine(
      this.eventBus, this.controller, this.registry, this.dataStore, log,
    );

    this.apiServer = new ApiServer({
      registry: this.registry,
      controller: this.controller,
      dataStore: this.dataStore,
      ruleEngine: this.ruleEngine,
      ollama: this.ollama,
      aiAgent: this.aiAgent,
      eventBus: this.eventBus,
      apiToken: resolved.apiToken,
      log,
    });

    api.on('didFinishLaunching', async () => {
      await this.startup(this.resolvedConfig);
      this.registerVirtualAccessories();
    });

    api.on('shutdown', async () => {
      this.log.info('Shutting down AI Agent...');
      this.aiAgent.destroy();
      this.ruleEngine.destroy();
      this.registry.destroy();
      this.apiServer.close();
      await this.dataStore.destroy();
    });
  }

  private createClient(config: ReturnType<typeof resolveConfig>, log: Logger): HomebridgeClientInterface {
    const authConfig = {
      url: config.homebridgeUiUrl,
      token: config.homebridgeUiToken,
      username: config.homebridgeUiUsername,
      password: config.homebridgeUiPassword,
    };

    if (config.homebridgeBackend === 'hoobs') {
      log.info('Using HOOBS API backend');
      return new HoobsClient(authConfig, log);
    }

    if (config.homebridgeBackend === 'configui') {
      log.info('Using Config UI X API backend');
      return new ConfigUiXClient(authConfig, log);
    }

    // Auto-detect: HOOBS typically runs on port 80, Config UI X on 8581
    const url = new URL(config.homebridgeUiUrl);
    if (url.port === '' || url.port === '80' || url.port === '443') {
      log.info('Auto-detected HOOBS API backend (port 80)');
      return new HoobsClient(authConfig, log);
    }

    log.info('Auto-detected Config UI X API backend');
    return new ConfigUiXClient(authConfig, log);
  }

  private async startup(config: ReturnType<typeof resolveConfig>): Promise<void> {
    try {
      await this.dataStore.initialize();
      await this.registry.initialize();

      const testResult = await this.ollama.test();
      if (testResult.success) {
        this.log.info(`Ollama: ${testResult.message}`);
      } else {
        this.log.warn(`Ollama: ${testResult.message}`);
      }

      this.loadRules(config);
      this.ruleEngine.loadLearnedRules();

      if (config.enableWebSocket) {
        this.apiServer.start(config.apiPort);
      }

      this.aiAgent.start(config.aiAnalysisInterval);

      this.eventBus.emit(EventType.SYSTEM_READY, { timestamp: Date.now() });
      this.log.info(`AI Agent ready: ${this.registry.getCount()} accessories, ${this.ruleEngine.getAllRules().length} rules`);
    } catch (error) {
      this.log.error('Startup failed:', error);
    }
  }

  private loadRules(config: ReturnType<typeof resolveConfig>): void {
    const zones = config.zoneConfig || [];

    if (config.automation.smartLighting) {
      for (const rule of createLightingRules(zones, this.registry)) {
        this.ruleEngine.registerRule(rule);
      }
    }

    if (config.automation.energySaving) {
      for (const rule of createEnergyRules(zones, this.registry)) {
        this.ruleEngine.registerRule(rule);
      }
    }

    if (config.automation.securityAlerts) {
      for (const rule of createSecurityRules(zones)) {
        this.ruleEngine.registerRule(rule);
      }
    }
  }

  private registerVirtualAccessories(): void {
    this.virtualAccessories = new VirtualAccessoryManager(
      this.api,
      this.log,
      this.cachedAccessories,
      {
        eventBus: this.eventBus,
        aiAgent: this.aiAgent,
        ruleEngine: this.ruleEngine,
        registry: this.registry,
        config: this.resolvedConfig,
      },
    );
    this.virtualAccessories.registerAccessories();
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug('Restoring cached accessory:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }
}
