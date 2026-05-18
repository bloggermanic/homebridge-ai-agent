import {
  API,
  Logger,
  PlatformAccessory,
  Service,
  Characteristic,
  CharacteristicValue,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, AIAgentPlatformConfig } from '../settings';
import { EventBus } from '../core/eventBus';
import { AIAgent } from '../ai/aiAgent';
import { RuleEngine } from '../rules/ruleEngine';
import { AccessoryRegistry } from '../registry/accessoryRegistry';
import { activateAwayMode } from '../rules/rules/awayModeRule';

interface VirtualAccessoryDef {
  id: string;
  name: string;
  type: 'switch' | 'scene';
  onActivate: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
  stateful: boolean;
}

export class VirtualAccessoryManager {
  private api: API;
  private log: Logger;
  private ServiceType: typeof Service;
  private CharacteristicType: typeof Characteristic;
  private cachedAccessories: PlatformAccessory[];
  private registeredUuids = new Set<string>();

  private eventBus: EventBus;
  private aiAgent: AIAgent;
  private ruleEngine: RuleEngine;
  private registry: AccessoryRegistry;
  private config: AIAgentPlatformConfig;

  constructor(
    api: API,
    log: Logger,
    cachedAccessories: PlatformAccessory[],
    deps: {
      eventBus: EventBus;
      aiAgent: AIAgent;
      ruleEngine: RuleEngine;
      registry: AccessoryRegistry;
      config: AIAgentPlatformConfig;
    },
  ) {
    this.api = api;
    this.log = log;
    this.ServiceType = api.hap.Service;
    this.CharacteristicType = api.hap.Characteristic;
    this.cachedAccessories = cachedAccessories;
    this.eventBus = deps.eventBus;
    this.aiAgent = deps.aiAgent;
    this.ruleEngine = deps.ruleEngine;
    this.registry = deps.registry;
    this.config = deps.config;
  }

  registerAccessories(): void {
    const definitions = this.getAccessoryDefinitions();

    for (const def of definitions) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${def.id}`);
      this.registeredUuids.add(uuid);

      const existing = this.cachedAccessories.find(a => a.UUID === uuid);

      if (existing) {
        this.log.info(`Restoring virtual accessory: ${def.name}`);
        this.configureVirtualAccessory(existing, def);
      } else {
        this.log.info(`Creating virtual accessory: ${def.name}`);
        const accessory = new this.api.platformAccessory(def.name, uuid);
        this.configureVirtualAccessory(accessory, def);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove any cached accessories that are no longer defined
    const toRemove = this.cachedAccessories.filter(a => !this.registeredUuids.has(a.UUID));
    if (toRemove.length > 0) {
      this.log.info(`Removing ${toRemove.length} stale virtual accessories`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
    }
  }

  private configureVirtualAccessory(accessory: PlatformAccessory, def: VirtualAccessoryDef): void {
    // Accessory information
    const infoService = accessory.getService(this.ServiceType.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(this.CharacteristicType.Manufacturer, 'AI Home Agent')
        .setCharacteristic(this.CharacteristicType.Model, `Virtual ${def.type}`)
        .setCharacteristic(this.CharacteristicType.SerialNumber, def.id);
    }

    // Main switch service
    let switchService = accessory.getService(this.ServiceType.Switch);
    if (!switchService) {
      switchService = accessory.addService(this.ServiceType.Switch, def.name);
    }

    let currentState = false;

    switchService.getCharacteristic(this.CharacteristicType.On)
      .onGet((): CharacteristicValue => currentState)
      .onSet(async (value: CharacteristicValue) => {
        const on = value as boolean;
        this.log.info(`Siri: "${def.name}" → ${on ? 'ON' : 'OFF'}`);

        if (on) {
          await def.onActivate();
          if (!def.stateful) {
            // Auto-reset momentary switches after 1 second
            setTimeout(() => {
              currentState = false;
              switchService!.updateCharacteristic(this.CharacteristicType.On, false);
            }, 1000);
          }
        } else if (def.onDeactivate) {
          await def.onDeactivate();
        }

        currentState = def.stateful ? on : false;
      });
  }

  private getAccessoryDefinitions(): VirtualAccessoryDef[] {
    const defs: VirtualAccessoryDef[] = [];

    // Away Mode switch (stateful — stays on until deactivated)
    if (this.config.automation.awayModeSimulation) {
      defs.push({
        id: 'away-mode',
        name: 'Away Mode',
        type: 'switch',
        stateful: true,
        onActivate: async () => {
          this.log.info('Siri → Away Mode activated');
          activateAwayMode(this.registry, this.ruleEngine);
        },
        onDeactivate: async () => {
          this.log.info('Siri → Away Mode deactivated');
        },
      });
    }

    // Good Night scene (momentary — triggers and resets)
    defs.push({
      id: 'good-night',
      name: 'Good Night',
      type: 'scene',
      stateful: false,
      onActivate: async () => {
        this.log.info('Siri → Good Night scene');
        const response = await this.aiAgent.processCommand(
          'Turn off all lights and set the thermostat to a comfortable sleeping temperature.',
        );
        this.log.info(`Good Night result: ${response.message}`);
      },
    });

    // Good Morning scene
    defs.push({
      id: 'good-morning',
      name: 'Good Morning',
      type: 'scene',
      stateful: false,
      onActivate: async () => {
        this.log.info('Siri → Good Morning scene');
        const response = await this.aiAgent.processCommand(
          'Turn on the kitchen and living room lights to a comfortable morning brightness. Set thermostat to a comfortable daytime temperature.',
        );
        this.log.info(`Good Morning result: ${response.message}`);
      },
    });

    // Security Check (momentary — AI analyzes and logs)
    if (this.config.automation.securityAlerts) {
      defs.push({
        id: 'security-check',
        name: 'Security Check',
        type: 'scene',
        stateful: false,
        onActivate: async () => {
          this.log.info('Siri → Security Check');
          const response = await this.aiAgent.processCommand(
            'Check the status of all doors, windows, locks, and motion sensors. Report anything open or unusual.',
          );
          this.log.info(`Security Check: ${response.message}`);
        },
      });
    }

    // All Lights Off (momentary)
    defs.push({
      id: 'all-lights-off',
      name: 'All Lights Off',
      type: 'scene',
      stateful: false,
      onActivate: async () => {
        this.log.info('Siri → All Lights Off');
        const response = await this.aiAgent.processCommand('Turn off all the lights in the house.');
        this.log.info(`All Lights Off: ${response.message}`);
      },
    });

    return defs;
  }

  isOwnAccessory(uuid: string): boolean {
    return this.registeredUuids.has(uuid);
  }
}
