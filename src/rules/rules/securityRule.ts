import { Rule } from '../../core/types';
import { ZoneConfig } from '../../settings';

export function createSecurityRules(zones: ZoneConfig[]): Rule[] {
  const rules: Rule[] = [];

  for (const zone of zones) {
    // Multi-sensor motion at night → security alert
    rules.push({
      id: `security-multi-motion-${zone.name}`,
      name: `${zone.name}: Multi-sensor motion (night) → Alert`,
      enabled: true,
      priority: 5,
      source: 'builtin',
      cooldown: 300000,
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
          timeWindow: { after: '23:00', before: '06:00' },
        },
      ],
      actions: [
        {
          type: 'notify',
          notification: {
            title: `Security: Motion in ${zone.name}`,
            message: `Motion detected in ${zone.name} during nighttime hours.`,
          },
        },
        {
          type: 'ai_consult',
          aiPrompt: `Motion was detected in ${zone.name} (${zone.floor}) between 11 PM and 6 AM. Check if multiple motion sensors have triggered recently in this zone. Analyze whether this looks like normal household activity or a potential security concern. Consider the zone location and typical patterns.`,
        },
      ],
    });

    // Contact sensor opened at night → alert
    rules.push({
      id: `security-contact-night-${zone.name}`,
      name: `${zone.name}: Door/Window opened (night) → Alert`,
      enabled: true,
      priority: 3,
      source: 'builtin',
      cooldown: 60000,
      conditions: [
        {
          type: 'event',
          eventMatch: {
            characteristic: 'Contact Sensor State',
            value: 1, // OPEN
            zone: zone.name,
          },
        },
        {
          type: 'time',
          timeWindow: { after: '23:00', before: '06:00' },
        },
      ],
      actions: [
        {
          type: 'notify',
          notification: {
            title: `Security: ${zone.name} entry opened`,
            message: `A door or window was opened in ${zone.name} at night.`,
          },
        },
      ],
    });
  }

  return rules;
}
