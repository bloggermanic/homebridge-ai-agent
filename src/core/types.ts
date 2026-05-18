export interface AccessoryInstance {
  uniqueId: string;
  aid: number;
  iid: number;
  uuid: string;
  displayName: string;
  serviceName: string;
  type: string;
  humanType: string;
  pluginName?: string;
  values: Record<string, CharacteristicInstance>;
  zone?: string;
  floor?: string;
}

export interface CharacteristicInstance {
  iid: number;
  type: string;
  description: string;
  value: unknown;
  format: string;
  perms: string[];
  canWrite: boolean;
  canRead: boolean;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  validValues?: number[];
}

export interface DeviceCommand {
  uniqueId: string;
  characteristicType: string;
  value: unknown;
}

export interface CommandResult {
  success: boolean;
  uniqueId: string;
  characteristicType: string;
  value: unknown;
  error?: string;
}

export interface DeviceEvent {
  timestamp: number;
  uniqueId: string;
  displayName: string;
  serviceType: string;
  characteristic: string;
  oldValue: unknown;
  newValue: unknown;
  zone?: string;
  floor?: string;
}

export interface ZoneInfo {
  name: string;
  floor: string;
  devices: AccessoryInstance[];
  isOccupied: boolean;
  lastMotion: number;
}

export enum EventType {
  DEVICE_STATE_CHANGED = 'device:stateChanged',
  DEVICE_DISCOVERED = 'device:discovered',
  DEVICE_REMOVED = 'device:removed',
  RULE_TRIGGERED = 'rule:triggered',
  RULE_EXECUTED = 'rule:executed',
  AI_SUGGESTION = 'ai:suggestion',
  AI_COMMAND = 'ai:command',
  SYSTEM_READY = 'system:ready',
  SYSTEM_ERROR = 'system:error',
}

export interface EventPayloadMap {
  [EventType.DEVICE_STATE_CHANGED]: DeviceEvent;
  [EventType.DEVICE_DISCOVERED]: AccessoryInstance;
  [EventType.DEVICE_REMOVED]: { uniqueId: string };
  [EventType.RULE_TRIGGERED]: { ruleId: string; event: DeviceEvent };
  [EventType.RULE_EXECUTED]: { ruleId: string; commands: DeviceCommand[]; success: boolean };
  [EventType.AI_SUGGESTION]: { suggestion: string; confidence: number; commands?: DeviceCommand[] };
  [EventType.AI_COMMAND]: { commands: DeviceCommand[]; reasoning: string };
  [EventType.SYSTEM_READY]: { timestamp: number };
  [EventType.SYSTEM_ERROR]: { error: string; context: string };
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  cooldown?: number;
  lastTriggered?: number;
  source: 'builtin' | 'user' | 'ai';
}

export interface RuleCondition {
  type: 'event' | 'state' | 'time' | 'duration';
  eventMatch?: {
    serviceType?: string;
    characteristic?: string;
    value?: unknown;
    zone?: string;
  };
  stateCheck?: {
    uniqueId: string;
    characteristic: string;
    operator: 'eq' | 'gt' | 'lt' | 'neq';
    value: unknown;
  };
  timeWindow?: {
    after: string;
    before: string;
  };
  durationCheck?: {
    zone: string;
    unoccupiedMinutes: number;
  };
}

export interface RuleAction {
  type: 'command' | 'notify' | 'ai_consult';
  command?: DeviceCommand;
  notification?: { title: string; message: string };
  aiPrompt?: string;
}

export interface OccupancyState {
  zone: string;
  floor: string;
  isOccupied: boolean;
  lastOccupied: number;
  occupancyDuration: number;
  devicesInZone: string[];
}

export interface MotionPattern {
  deviceId: string;
  zone: string;
  recentTriggers: number[];
  averageTriggersPerHour: number;
  typicalActiveHours: number[];
}

export interface EnergyPattern {
  floor: string;
  devicesOn: string[];
  occupancyStatus: boolean;
  temperature: number;
  lastActivity: number;
}

export interface PatternInsight {
  type: 'unusual_activity' | 'energy_waste' | 'schedule_suggestion' | 'security_concern';
  description: string;
  confidence: number;
  suggestedAction?: string;
  relatedDevices?: string[];
}

export interface AgentResponse {
  intent: 'control' | 'query' | 'suggest' | 'error';
  message: string;
  commands?: DeviceCommand[];
  commandResults?: CommandResult[];
  suggestions?: string[];
}
