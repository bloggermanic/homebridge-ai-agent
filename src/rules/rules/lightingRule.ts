import { Rule } from '../../core/types';
import { ZoneConfig } from '../../settings';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';

export function createLightingRules(zones: ZoneConfig[], registry: AccessoryRegistry): Rule[] {
  const rules: Rule[] = [];

  for (const zone of zones) {
    if (!zone.autoLights) continue;

    const lights = registry.getByZone(zone.name).filter(a =>
      a.humanType.toLowerCase().includes('light') || a.type.toLowerCase().includes('lightbulb'),
    );

    if (lights.length === 0) continue;

    for (const light of lights) {
      // Motion detected → turn on lights (evening/night only)
      rules.push({
        id: `lighting-motion-on-${zone.name}-${light.uniqueId}`,
        name: `${zone.name}: Motion → Light On (evening)`,
        enabled: true,
        priority: 10,
        source: 'builtin',
        cooldown: 60000,
        conditions: [
          {
            type: 'event',
            eventMatch: {
              characteristic: 'Motion Detected',
              value: true,
              zone: zone.name,
            },
          },
          {
            type: 'time',
            timeWindow: { after: '17:00', before: '07:00' },
          },
          {
            type: 'state',
            stateCheck: {
              uniqueId: light.uniqueId,
              characteristic: 'On',
              operator: 'eq',
              value: false,
            },
          },
        ],
        actions: [
          { type: 'command', command: { uniqueId: light.uniqueId, characteristicType: 'On', value: true } },
        ],
      });
    }

    // No motion for 30 minutes → turn off all zone lights
    const lightCommands = lights.map(l => ({
      type: 'command' as const,
      command: { uniqueId: l.uniqueId, characteristicType: 'On', value: false },
    }));

    rules.push({
      id: `lighting-vacancy-off-${zone.name}`,
      name: `${zone.name}: Vacant 30min → Lights Off`,
      enabled: true,
      priority: 20,
      source: 'builtin',
      cooldown: 300000,
      conditions: [
        {
          type: 'event',
          eventMatch: {
            characteristic: 'Motion Detected',
            value: false,
            zone: zone.name,
          },
        },
        {
          type: 'duration',
          durationCheck: { zone: zone.name, unoccupiedMinutes: 30 },
        },
      ],
      actions: lightCommands,
    });
  }

  return rules;
}
