import { Logger } from 'homebridge';
import storage, { LocalStorage } from 'node-persist';
import {
  DeviceEvent,
  OccupancyState,
  MotionPattern,
  EnergyPattern,
  Rule,
} from '../core/types';

export class DataStore {
  private log: Logger;
  private store: LocalStorage;
  private initialized = false;

  private events: DeviceEvent[] = [];
  private motionPatterns = new Map<string, MotionPattern>();
  private occupancy = new Map<string, OccupancyState>();
  private energyPatterns = new Map<string, EnergyPattern>();
  private learnedRules: Rule[] = [];

  private saveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(storagePath: string, log: Logger) {
    this.log = log;
    this.store = storage.create({ dir: storagePath });
  }

  async initialize(): Promise<void> {
    await this.store.init();
    this.initialized = true;
    this.log.info('DataStore initialized');
    await this.loadData();

    this.saveInterval = setInterval(() => {
      this.saveData().catch(err => this.log.error('Auto-save failed:', err));
    }, 5 * 60 * 1000);
  }

  private async loadData(): Promise<void> {
    try {
      const storedEvents = await this.store.getItem('events');
      if (Array.isArray(storedEvents)) {
        const cutoff = Date.now() - 48 * 60 * 60 * 1000;
        this.events = storedEvents.filter((e: DeviceEvent) => e.timestamp > cutoff);
      }

      const storedMotion = await this.store.getItem('motionPatterns');
      if (storedMotion) {
        this.motionPatterns = new Map(Object.entries(storedMotion));
      }

      const storedOccupancy = await this.store.getItem('occupancy');
      if (storedOccupancy) {
        this.occupancy = new Map(Object.entries(storedOccupancy));
      }

      const storedEnergy = await this.store.getItem('energyPatterns');
      if (storedEnergy) {
        this.energyPatterns = new Map(Object.entries(storedEnergy));
      }

      const storedRules = await this.store.getItem('learnedRules');
      if (Array.isArray(storedRules)) {
        this.learnedRules = storedRules;
      }

      this.log.info(`DataStore loaded: ${this.events.length} events, ${this.motionPatterns.size} motion patterns, ${this.occupancy.size} zones`);
    } catch (error) {
      this.log.error('Failed to load data:', error);
    }
  }

  async saveData(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.store.setItem('events', this.events);
      await this.store.setItem('motionPatterns', Object.fromEntries(this.motionPatterns));
      await this.store.setItem('occupancy', Object.fromEntries(this.occupancy));
      await this.store.setItem('energyPatterns', Object.fromEntries(this.energyPatterns));
      await this.store.setItem('learnedRules', this.learnedRules);
      this.log.debug('DataStore saved to disk');
    } catch (error) {
      this.log.error('Failed to save data:', error);
    }
  }

  // Events

  recordEvent(event: DeviceEvent): void {
    this.events.push(event);
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    if (this.events.length > 10000) {
      this.events = this.events.filter(e => e.timestamp > cutoff);
    }
  }

  getEvents(hours = 1): DeviceEvent[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.events.filter(e => e.timestamp > cutoff);
  }

  getDeviceEvents(uniqueId: string, hours = 1): DeviceEvent[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.events.filter(e => e.uniqueId === uniqueId && e.timestamp > cutoff);
  }

  getZoneEvents(zone: string, hours = 1): DeviceEvent[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.events.filter(e => e.zone === zone && e.timestamp > cutoff);
  }

  // Motion patterns

  updateMotionPattern(deviceId: string, zone: string): void {
    const existing = this.motionPatterns.get(deviceId) || {
      deviceId,
      zone,
      recentTriggers: [],
      averageTriggersPerHour: 0,
      typicalActiveHours: [],
    };

    existing.recentTriggers.push(Date.now());

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    existing.recentTriggers = existing.recentTriggers.filter(t => t > cutoff);
    existing.averageTriggersPerHour = existing.recentTriggers.length / 24;

    const currentHour = new Date().getHours();
    if (!existing.typicalActiveHours.includes(currentHour)) {
      existing.typicalActiveHours.push(currentHour);
      existing.typicalActiveHours.sort((a, b) => a - b);
    }

    this.motionPatterns.set(deviceId, existing);
  }

  getMotionPattern(deviceId: string): MotionPattern | undefined {
    return this.motionPatterns.get(deviceId);
  }

  getAllMotionPatterns(): MotionPattern[] {
    return Array.from(this.motionPatterns.values());
  }

  // Occupancy

  updateOccupancy(zone: string, floor: string, isOccupied: boolean, devicesInZone: string[]): void {
    const existing = this.occupancy.get(zone) || {
      zone,
      floor,
      isOccupied: false,
      lastOccupied: Date.now(),
      occupancyDuration: 0,
      devicesInZone: [],
    };

    const now = Date.now();

    if (isOccupied && !existing.isOccupied) {
      existing.lastOccupied = now;
      existing.isOccupied = true;
    } else if (isOccupied && existing.isOccupied) {
      existing.occupancyDuration = now - existing.lastOccupied;
    } else if (!isOccupied && existing.isOccupied) {
      existing.isOccupied = false;
      existing.occupancyDuration = 0;
    }

    existing.devicesInZone = devicesInZone;
    this.occupancy.set(zone, existing);
  }

  getOccupancy(zone: string): OccupancyState | undefined {
    return this.occupancy.get(zone);
  }

  getAllOccupancy(): OccupancyState[] {
    return Array.from(this.occupancy.values());
  }

  getUnoccupiedZones(hours: number): OccupancyState[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return Array.from(this.occupancy.values()).filter(
      p => !p.isOccupied && p.lastOccupied < cutoff,
    );
  }

  // Energy patterns

  updateEnergyPattern(floor: string, devicesOn: string[], occupancyStatus: boolean, temperature: number): void {
    this.energyPatterns.set(floor, {
      floor,
      devicesOn,
      occupancyStatus,
      temperature,
      lastActivity: Date.now(),
    });
  }

  getEnergyPattern(floor: string): EnergyPattern | undefined {
    return this.energyPatterns.get(floor);
  }

  // Learned rules

  getLearnedRules(): Rule[] {
    return [...this.learnedRules];
  }

  addLearnedRule(rule: Rule): void {
    this.learnedRules.push(rule);
  }

  removeLearnedRule(ruleId: string): void {
    this.learnedRules = this.learnedRules.filter(r => r.id !== ruleId);
  }

  // Stats

  getStats(): { eventCount: number; motionPatterns: number; occupancyZones: number; energyPatterns: number; learnedRules: number } {
    return {
      eventCount: this.events.length,
      motionPatterns: this.motionPatterns.size,
      occupancyZones: this.occupancy.size,
      energyPatterns: this.energyPatterns.size,
      learnedRules: this.learnedRules.length,
    };
  }

  // Lifecycle

  async destroy(): Promise<void> {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    await this.saveData();
  }
}
