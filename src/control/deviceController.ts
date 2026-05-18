import { Logger } from 'homebridge';
import { HomebridgeClientInterface } from '../registry/homebridgeClient';
import { AccessoryRegistry } from '../registry/accessoryRegistry';
import { EventBus } from '../core/eventBus';
import { DeviceCommand, CommandResult, EventType } from '../core/types';

export class DeviceController {
  private registry: AccessoryRegistry;
  private client: HomebridgeClientInterface;
  private eventBus: EventBus;
  private log: Logger;

  constructor(
    registry: AccessoryRegistry,
    client: HomebridgeClientInterface,
    eventBus: EventBus,
    log: Logger,
  ) {
    this.registry = registry;
    this.client = client;
    this.eventBus = eventBus;
    this.log = log;
  }

  async execute(command: DeviceCommand): Promise<CommandResult> {
    const accessory = this.registry.getById(command.uniqueId);
    if (!accessory) {
      return {
        success: false,
        uniqueId: command.uniqueId,
        characteristicType: command.characteristicType,
        value: command.value,
        error: `Accessory not found: ${command.uniqueId}`,
      };
    }

    const char = Object.values(accessory.values).find(
      c => c.type === command.characteristicType || c.description === command.characteristicType,
    );

    if (!char) {
      return {
        success: false,
        uniqueId: command.uniqueId,
        characteristicType: command.characteristicType,
        value: command.value,
        error: `Characteristic not found: ${command.characteristicType} on ${accessory.displayName}`,
      };
    }

    if (!char.canWrite) {
      return {
        success: false,
        uniqueId: command.uniqueId,
        characteristicType: command.characteristicType,
        value: command.value,
        error: `Characteristic is read-only: ${char.description} on ${accessory.displayName}`,
      };
    }

    this.log.info(`Executing: ${accessory.displayName} → ${char.description} = ${command.value}`);

    const success = await this.client.setCharacteristic(
      command.uniqueId,
      char.type,
      command.value,
    );

    return {
      success,
      uniqueId: command.uniqueId,
      characteristicType: command.characteristicType,
      value: command.value,
      error: success ? undefined : `Failed to set ${char.description} on ${accessory.displayName}`,
    };
  }

  async executeBatch(commands: DeviceCommand[]): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const command of commands) {
      const result = await this.execute(command);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    this.log.info(`Batch: ${successful}/${commands.length} commands succeeded`);

    this.eventBus.emit(EventType.RULE_EXECUTED, {
      ruleId: 'batch',
      commands,
      success: results.every(r => r.success),
    });

    return results;
  }

  // Convenience methods

  async setLightOn(uniqueId: string, on: boolean): Promise<CommandResult> {
    return this.execute({ uniqueId, characteristicType: 'On', value: on });
  }

  async setLightBrightness(uniqueId: string, brightness: number): Promise<CommandResult> {
    return this.execute({ uniqueId, characteristicType: 'Brightness', value: brightness });
  }

  async setThermostatTarget(uniqueId: string, temperature: number): Promise<CommandResult> {
    return this.execute({ uniqueId, characteristicType: 'Target Temperature', value: temperature });
  }

  async setSwitch(uniqueId: string, on: boolean): Promise<CommandResult> {
    return this.execute({ uniqueId, characteristicType: 'On', value: on });
  }

  async lockDoor(uniqueId: string, lock: boolean): Promise<CommandResult> {
    return this.execute({ uniqueId, characteristicType: 'Lock Target State', value: lock ? 1 : 0 });
  }
}
