import { EventEmitter } from 'events';
import { EventType, EventPayloadMap } from './types';

interface StoredEvent {
  type: EventType;
  payload: EventPayloadMap[EventType];
  timestamp: number;
}

export class EventBus {
  private emitter = new EventEmitter();
  private history: StoredEvent[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
    this.emitter.setMaxListeners(50);
  }

  on<T extends EventType>(event: T, handler: (payload: EventPayloadMap[T]) => void): void {
    this.emitter.on(event, handler);
  }

  once<T extends EventType>(event: T, handler: (payload: EventPayloadMap[T]) => void): void {
    this.emitter.once(event, handler);
  }

  off<T extends EventType>(event: T, handler: (payload: EventPayloadMap[T]) => void): void {
    this.emitter.off(event, handler);
  }

  emit<T extends EventType>(event: T, payload: EventPayloadMap[T]): void {
    const stored: StoredEvent = { type: event, payload, timestamp: Date.now() };
    this.history.push(stored);

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.emitter.emit(event, payload);
    this.emitter.emit('*', stored);
  }

  onAny(handler: (event: StoredEvent) => void): void {
    this.emitter.on('*', handler);
  }

  offAny(handler: (event: StoredEvent) => void): void {
    this.emitter.off('*', handler);
  }

  getHistory(count?: number): StoredEvent[] {
    if (count) {
      return this.history.slice(-count);
    }
    return [...this.history];
  }

  getHistoryByType<T extends EventType>(event: T, count?: number): Array<{ payload: EventPayloadMap[T]; timestamp: number }> {
    const filtered = this.history
      .filter(e => e.type === event)
      .map(e => ({ payload: e.payload as EventPayloadMap[T], timestamp: e.timestamp }));

    if (count) {
      return filtered.slice(-count);
    }
    return filtered;
  }

  clear(): void {
    this.history = [];
  }

  destroy(): void {
    this.emitter.removeAllListeners();
    this.history = [];
  }
}
