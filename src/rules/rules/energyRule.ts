import { Rule } from '../../core/types';
import { ZoneConfig } from '../../settings';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';

export function createEnergyRules(zones: ZoneConfig[], registry: AccessoryRegistry): Rule[] {
  const rules: Rule[] = [];
  const floors = new Set(zones.map(z => z.floor));

  for (const floor of floors) {
    const floorZones = zones.filter(z => z.floor === floor && z.autoTemp);
    if (floorZones.length === 0) continue;

    const thermostats = registry.getByFloor(floor).filter(a =>
      a.humanType.toLowerCase().includes('thermostat') || a.type.toLowerCase().includes('thermostat'),
    );

    if (thermostats.length === 0) continue;

    for (const thermostat of thermostats) {
      // Floor unoccupied for 2 hours → reduce target temperature
      rules.push({
        id: `energy-setback-${floor}-${thermostat.uniqueId}`,
        name: `${floor}: Unoccupied 2h → Temp Setback`,
        enabled: true,
        priority: 30,
        source: 'builtin',
        cooldown: 3600000,
        conditions: [
          {
            type: 'event',
            eventMatch: { characteristic: 'Motion Detected', value: false },
          },
          ...floorZones.map(zone => ({
            type: 'duration' as const,
            durationCheck: { zone: zone.name, unoccupiedMinutes: 120 },
          })),
        ],
        actions: [
          {
            type: 'notify' as const,
            notification: {
              title: `Energy: ${floor} setback`,
              message: `Floor unoccupied 2+ hours. Consider reducing temperature.`,
            },
          },
          {
            type: 'ai_consult' as const,
            aiPrompt: `The ${floor} has been unoccupied for over 2 hours. The thermostat ${thermostat.displayName} is currently active. Should we reduce the target temperature by 3 degrees to save energy? Consider the time of day and whether occupants are likely to return soon.`,
          },
        ],
      });
    }
  }

  return rules;
}
