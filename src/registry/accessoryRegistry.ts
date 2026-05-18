import { API, Logger, PlatformAccessory } from 'homebridge';
import { RawAccessory } from './configUiXClient';
import { HomebridgeClientInterface } from './homebridgeClient';
import { EventBus } from '../core/eventBus';
import { AccessoryInstance, CharacteristicInstance, DeviceEvent, EventType } from '../core/types';

export class AccessoryRegistry {
  private accessories = new Map<string, AccessoryInstance>();
  private previousValues = new Map<string, Map<string, unknown>>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private log: Logger;
  private client: HomebridgeClientInterface;
  private eventBus: EventBus;
  private api: API;
  private pollSeconds: number;
  private connected = false;

  constructor(
    client: HomebridgeClientInterface,
    api: API,
    eventBus: EventBus,
    pollSeconds: number,
    log: Logger,
  ) {
    this.client = client;
    this.api = api;
    this.eventBus = eventBus;
    this.pollSeconds = pollSeconds;
    this.log = log;
  }

  async initialize(): Promise<void> {
    const available = await this.client.isAvailable();
    if (!available) {
      this.log.warn('Config UI X not available. Accessory discovery will be limited.');
      this.listenToInternalEvents();
      return;
    }

    const authenticated = await this.client.authenticate();
    if (!authenticated) {
      this.log.error('Config UI X authentication failed. Check homebridgeUiToken or username/password in config.');
      this.listenToInternalEvents();
      return;
    }

    this.connected = true;
    await this.refreshAccessories();
    this.listenToInternalEvents();
    this.startPolling();

    this.log.info(`AccessoryRegistry: ${this.accessories.size} accessories discovered`);
  }

  private listenToInternalEvents(): void {
    const internalApi = this.api as unknown as {
      on(event: string, listener: (accessories: PlatformAccessory[]) => void): void;
    };

    internalApi.on('registerPlatformAccessories', (accessories: PlatformAccessory[]) => {
      this.log.debug(`Internal event: ${accessories.length} accessories registered`);
      if (this.connected) {
        this.refreshAccessories().catch(err =>
          this.log.error('Refresh after register failed:', err),
        );
      }
    });

    internalApi.on('unregisterPlatformAccessories', (accessories: PlatformAccessory[]) => {
      for (const accessory of accessories) {
        const uniqueId = this.findUniqueIdByUuid(accessory.UUID);
        if (uniqueId) {
          this.accessories.delete(uniqueId);
          this.previousValues.delete(uniqueId);
          this.eventBus.emit(EventType.DEVICE_REMOVED, { uniqueId });
          this.log.debug(`Removed accessory: ${accessory.displayName}`);
        }
      }
    });
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        await this.refreshAccessories();
      } catch (error) {
        this.log.error('Accessory poll failed:', error);
      }
    }, this.pollSeconds * 1000);
  }

  private async refreshAccessories(): Promise<void> {
    const raw = await this.client.getAccessories();
    if (raw.length === 0) return;

    const seen = new Set<string>();

    for (const rawAccessory of raw) {
      seen.add(rawAccessory.uniqueId);
      const instance = this.mapAccessory(rawAccessory);
      const isNew = !this.accessories.has(instance.uniqueId);

      this.detectChanges(instance, rawAccessory);
      this.accessories.set(instance.uniqueId, instance);

      if (isNew) {
        this.eventBus.emit(EventType.DEVICE_DISCOVERED, instance);
      }
    }

    for (const [uniqueId] of this.accessories) {
      if (!seen.has(uniqueId)) {
        this.accessories.delete(uniqueId);
        this.previousValues.delete(uniqueId);
        this.eventBus.emit(EventType.DEVICE_REMOVED, { uniqueId });
      }
    }
  }

  private detectChanges(instance: AccessoryInstance, raw: RawAccessory): void {
    const prev = this.previousValues.get(instance.uniqueId);
    if (!prev) {
      const valueMap = new Map<string, unknown>();
      for (const char of raw.serviceCharacteristics) {
        valueMap.set(char.type, char.value);
      }
      this.previousValues.set(instance.uniqueId, valueMap);
      return;
    }

    const newValues = new Map<string, unknown>();
    for (const char of raw.serviceCharacteristics) {
      newValues.set(char.type, char.value);

      const oldValue = prev.get(char.type);
      if (oldValue !== undefined && oldValue !== char.value) {
        const event: DeviceEvent = {
          timestamp: Date.now(),
          uniqueId: instance.uniqueId,
          displayName: instance.displayName,
          serviceType: instance.type,
          characteristic: char.description,
          oldValue,
          newValue: char.value,
          zone: instance.zone,
          floor: instance.floor,
        };
        this.eventBus.emit(EventType.DEVICE_STATE_CHANGED, event);
      }
    }

    this.previousValues.set(instance.uniqueId, newValues);
  }

  private mapAccessory(raw: RawAccessory): AccessoryInstance {
    const values: Record<string, CharacteristicInstance> = {};
    for (const char of raw.serviceCharacteristics) {
      values[char.description] = {
        iid: char.iid,
        type: char.type,
        description: char.description,
        value: char.value,
        format: char.format,
        perms: char.perms,
        canWrite: char.canWrite,
        canRead: char.canRead,
        minValue: char.minValue,
        maxValue: char.maxValue,
        minStep: char.minStep,
        validValues: char.validValues,
      };
    }

    const name = raw.serviceName || raw.accessoryInformation?.['Name'] || 'Unknown';

    return {
      uniqueId: raw.uniqueId,
      aid: raw.aid,
      iid: raw.iid,
      uuid: raw.uuid,
      displayName: name,
      serviceName: raw.serviceName,
      type: raw.type,
      humanType: raw.humanType,
      values,
    };
  }

  private findUniqueIdByUuid(uuid: string): string | undefined {
    for (const [uniqueId, instance] of this.accessories) {
      if (instance.uuid === uuid) return uniqueId;
    }
    return undefined;
  }

  // Query methods

  getAll(): AccessoryInstance[] {
    return Array.from(this.accessories.values());
  }

  getById(uniqueId: string): AccessoryInstance | undefined {
    return this.accessories.get(uniqueId);
  }

  getByType(type: string): AccessoryInstance[] {
    const lower = type.toLowerCase();
    return this.getAll().filter(a =>
      a.type.toLowerCase().includes(lower) || a.humanType.toLowerCase().includes(lower),
    );
  }

  getByName(name: string): AccessoryInstance[] {
    const lower = name.toLowerCase();
    return this.getAll().filter(a =>
      a.displayName.toLowerCase().includes(lower),
    );
  }

  getByZone(zone: string): AccessoryInstance[] {
    return this.getAll().filter(a => a.zone === zone);
  }

  getByFloor(floor: string): AccessoryInstance[] {
    return this.getAll().filter(a => a.floor === floor);
  }

  getCharacteristicValue(uniqueId: string, description: string): unknown {
    const accessory = this.accessories.get(uniqueId);
    if (!accessory) return undefined;
    return accessory.values[description]?.value;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCount(): number {
    return this.accessories.size;
  }

  destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
