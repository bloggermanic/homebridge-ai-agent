import { Logger } from 'homebridge';
import { EventBus } from '../core/eventBus';
import { DeviceController } from '../control/deviceController';
import { AccessoryRegistry } from '../registry/accessoryRegistry';
import { DataStore } from '../storage/dataStore';
import {
  Rule,
  RuleCondition,
  DeviceEvent,
  EventType,
} from '../core/types';

export class RuleEngine {
  private rules = new Map<string, Rule>();
  private cooldowns = new Map<string, number>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private eventBus: EventBus;
  private controller: DeviceController;
  private registry: AccessoryRegistry;
  private dataStore: DataStore;
  private log: Logger;

  constructor(
    eventBus: EventBus,
    controller: DeviceController,
    registry: AccessoryRegistry,
    dataStore: DataStore,
    log: Logger,
  ) {
    this.eventBus = eventBus;
    this.controller = controller;
    this.registry = registry;
    this.dataStore = dataStore;
    this.log = log;

    this.eventBus.on(EventType.DEVICE_STATE_CHANGED, (event) => {
      this.evaluateRules(event).catch(err =>
        this.log.error('Rule evaluation error:', err),
      );
    });

    this.log.info('RuleEngine initialized');
  }

  registerRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
    this.log.debug(`Rule registered: ${rule.name} (${rule.id})`);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.cooldowns.delete(ruleId);
  }

  getRule(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  updateRule(ruleId: string, updates: Partial<Rule>): void {
    const existing = this.rules.get(ruleId);
    if (existing) {
      this.rules.set(ruleId, { ...existing, ...updates });
    }
  }

  loadLearnedRules(): void {
    const learned = this.dataStore.getLearnedRules();
    for (const rule of learned) {
      this.registerRule(rule);
    }
    if (learned.length > 0) {
      this.log.info(`Loaded ${learned.length} AI-learned rules`);
    }
  }

  private async evaluateRules(event: DeviceEvent): Promise<void> {
    const sorted = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sorted) {
      if (this.isOnCooldown(rule)) continue;

      const matched = this.evaluateConditions(rule.conditions, event);
      if (!matched) continue;

      this.log.info(`Rule triggered: ${rule.name}`);
      this.eventBus.emit(EventType.RULE_TRIGGERED, { ruleId: rule.id, event });
      this.setCooldown(rule);

      await this.executeActions(rule);
    }
  }

  private evaluateConditions(conditions: RuleCondition[], event: DeviceEvent): boolean {
    return conditions.every(condition => this.evaluateCondition(condition, event));
  }

  private evaluateCondition(condition: RuleCondition, event: DeviceEvent): boolean {
    switch (condition.type) {
      case 'event':
        return this.evaluateEventCondition(condition, event);
      case 'state':
        return this.evaluateStateCondition(condition);
      case 'time':
        return this.evaluateTimeCondition(condition);
      case 'duration':
        return this.evaluateDurationCondition(condition);
      default:
        return false;
    }
  }

  private evaluateEventCondition(condition: RuleCondition, event: DeviceEvent): boolean {
    const match = condition.eventMatch;
    if (!match) return false;

    if (match.serviceType && !event.serviceType.toLowerCase().includes(match.serviceType.toLowerCase())) {
      return false;
    }
    if (match.characteristic && !event.characteristic.toLowerCase().includes(match.characteristic.toLowerCase())) {
      return false;
    }
    if (match.value !== undefined && event.newValue !== match.value) {
      return false;
    }
    if (match.zone && event.zone !== match.zone) {
      return false;
    }
    return true;
  }

  private evaluateStateCondition(condition: RuleCondition): boolean {
    const check = condition.stateCheck;
    if (!check) return false;

    const value = this.registry.getCharacteristicValue(check.uniqueId, check.characteristic);
    if (value === undefined) return false;

    switch (check.operator) {
      case 'eq': return value === check.value;
      case 'neq': return value !== check.value;
      case 'gt': return (value as number) > (check.value as number);
      case 'lt': return (value as number) < (check.value as number);
      default: return false;
    }
  }

  private evaluateTimeCondition(condition: RuleCondition): boolean {
    const window = condition.timeWindow;
    if (!window) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [afterH, afterM] = window.after.split(':').map(Number);
    const [beforeH, beforeM] = window.before.split(':').map(Number);
    const afterMinutes = afterH * 60 + afterM;
    const beforeMinutes = beforeH * 60 + beforeM;

    if (afterMinutes <= beforeMinutes) {
      return currentMinutes >= afterMinutes && currentMinutes <= beforeMinutes;
    }
    // Wraps midnight (e.g., 23:00 - 06:00)
    return currentMinutes >= afterMinutes || currentMinutes <= beforeMinutes;
  }

  private evaluateDurationCondition(condition: RuleCondition): boolean {
    const check = condition.durationCheck;
    if (!check) return false;

    const occupancy = this.dataStore.getOccupancy(check.zone);
    if (!occupancy) return false;

    if (occupancy.isOccupied) return false;

    const unoccupiedMinutes = (Date.now() - occupancy.lastOccupied) / 60000;
    return unoccupiedMinutes >= check.unoccupiedMinutes;
  }

  private async executeActions(rule: Rule): Promise<void> {
    const commands = rule.actions
      .filter(a => a.type === 'command' && a.command)
      .map(a => a.command!);

    if (commands.length > 0) {
      const results = await this.controller.executeBatch(commands);
      const success = results.every(r => r.success);
      this.eventBus.emit(EventType.RULE_EXECUTED, {
        ruleId: rule.id,
        commands,
        success,
      });
    }

    for (const action of rule.actions) {
      if (action.type === 'notify' && action.notification) {
        this.log.warn(`ALERT: ${action.notification.title} — ${action.notification.message}`);
      }
    }
  }

  scheduleAction(delayMs: number, callback: () => void): void {
    const timer = setTimeout(callback, delayMs);
    this.timers.push(timer);
  }

  private isOnCooldown(rule: Rule): boolean {
    if (!rule.cooldown) return false;
    const lastTriggered = this.cooldowns.get(rule.id);
    if (!lastTriggered) return false;
    return Date.now() - lastTriggered < rule.cooldown;
  }

  private setCooldown(rule: Rule): void {
    if (rule.cooldown) {
      this.cooldowns.set(rule.id, Date.now());
    }
  }

  destroy(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.rules.clear();
    this.cooldowns.clear();
  }
}
