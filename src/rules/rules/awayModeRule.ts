import { Rule } from '../../core/types';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';
import { RuleEngine } from '../ruleEngine';

export function activateAwayMode(registry: AccessoryRegistry, ruleEngine: RuleEngine): void {
  const lights = registry.getAll().filter(a =>
    a.humanType.toLowerCase().includes('light') || a.type.toLowerCase().includes('lightbulb'),
  );

  if (lights.length === 0) return;

  const count = Math.max(1, Math.ceil(lights.length * 0.3));
  const shuffled = [...lights].sort(() => Math.random() - 0.5);
  const selectedLights = shuffled.slice(0, count);

  const now = new Date();
  const events: Array<{ delayMs: number; uniqueId: string; on: boolean }> = [];

  for (let hour = 18; hour <= 23; hour++) {
    const light = selectedLights[Math.floor(Math.random() * selectedLights.length)];
    const randomMinute = Math.floor(Math.random() * 60);

    const onTime = new Date(now);
    onTime.setHours(hour, randomMinute, 0, 0);
    if (onTime.getTime() <= now.getTime()) continue;

    events.push({
      delayMs: onTime.getTime() - now.getTime(),
      uniqueId: light.uniqueId,
      on: true,
    });

    const offDelay = (30 + Math.floor(Math.random() * 60)) * 60 * 1000;
    events.push({
      delayMs: onTime.getTime() - now.getTime() + offDelay,
      uniqueId: light.uniqueId,
      on: false,
    });
  }

  for (const event of events) {
    ruleEngine.scheduleAction(event.delayMs, () => {
      const command = { uniqueId: event.uniqueId, characteristicType: 'On', value: event.on };
      // Use batch to get event emission
      void ruleEngine['controller'].execute(command);
    });
  }
}

export function createAwayModeRules(): Rule[] {
  // Away mode is activated programmatically via the API, not via event rules.
  // This placeholder returns an empty array; the actual scheduling is done
  // by activateAwayMode() above when the user triggers away mode.
  return [];
}
