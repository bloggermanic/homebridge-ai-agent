import { AccessoryInstance, DeviceEvent, OccupancyState } from '../core/types';

export const SYSTEM_PROMPTS = {
  HOME_AGENT: `You are an intelligent home automation agent. You can observe device states, control devices, analyze patterns, and answer questions about the home.

Your capabilities:
- Query device states (lights, sensors, thermostats, locks, switches)
- Control devices (turn on/off, set brightness, adjust temperature, lock/unlock)
- Analyze patterns in sensor data
- Suggest automation improvements

When asked to control a device, respond with JSON containing your intent and commands.
When asked a question, respond with JSON containing your answer.

Always respond in valid JSON format.`,

  COMMAND_PARSER: `You are a command parser for a home automation system. Parse the user's natural language request into structured commands.

Available device types: light, switch, thermostat, lock, motion sensor, contact sensor, fan, outlet.
Available actions: on, off, brightness (0-100), temperature (in °F), lock, unlock.

Respond with JSON in this exact format:
{
  "intent": "control" | "query" | "suggest",
  "message": "brief description of what you're doing",
  "devices": [
    { "name": "device name pattern to match", "action": "on|off|brightness|temperature|lock|unlock", "value": value }
  ]
}

If you cannot fulfill the request, respond with:
{ "intent": "error", "message": "explanation of why" }`,

  PATTERN_ANALYZER: `You are a home activity pattern analyzer. Given recent sensor events, identify unusual patterns, energy waste, or security concerns.

Respond with JSON:
{
  "insights": [
    {
      "type": "unusual_activity" | "energy_waste" | "schedule_suggestion" | "security_concern",
      "description": "what you noticed",
      "confidence": 0.0 to 1.0,
      "suggestedAction": "optional suggestion"
    }
  ]
}

Be conservative — only flag things with genuine significance. Avoid false alarms.`,

  RULE_SUGGESTER: `You are a home automation rule optimizer. Based on observed patterns, suggest new automation rules that would improve comfort, security, or energy efficiency.

Respond with JSON:
{
  "rules": [
    {
      "name": "descriptive rule name",
      "description": "what this rule does and why",
      "trigger": "what event triggers it",
      "condition": "when it should apply",
      "action": "what it should do",
      "confidence": 0.0 to 1.0
    }
  ]
}

Only suggest rules you're confident would be helpful. Quality over quantity.`,
};

export function buildDeviceContext(accessories: AccessoryInstance[]): string {
  if (accessories.length === 0) return 'No devices currently available.';

  const grouped = new Map<string, AccessoryInstance[]>();
  for (const acc of accessories) {
    const type = acc.humanType || acc.type;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(acc);
  }

  const lines: string[] = ['Current devices:'];
  for (const [type, devices] of grouped) {
    lines.push(`\n${type} (${devices.length}):`);
    for (const device of devices) {
      const state = Object.entries(device.values)
        .filter(([, v]) => v.canRead && v.value !== undefined && v.description !== 'Name')
        .map(([, v]) => `${v.description}=${v.value}`)
        .join(', ');
      const location = device.zone ? ` [${device.zone}]` : '';
      lines.push(`  - ${device.displayName}${location}: ${state}`);
    }
  }

  return lines.join('\n');
}

export function buildEventSummary(events: DeviceEvent[], maxEvents = 20): string {
  if (events.length === 0) return 'No recent events.';

  const recent = events.slice(-maxEvents);
  const lines: string[] = [`Recent events (last ${recent.length}):`];

  for (const event of recent) {
    const time = new Date(event.timestamp).toLocaleTimeString();
    const zone = event.zone ? ` [${event.zone}]` : '';
    lines.push(`  ${time} - ${event.displayName}${zone}: ${event.characteristic} changed from ${event.oldValue} to ${event.newValue}`);
  }

  return lines.join('\n');
}

export function buildOccupancySummary(occupancy: OccupancyState[]): string {
  if (occupancy.length === 0) return 'No occupancy data available.';

  const lines: string[] = ['Zone occupancy:'];
  for (const zone of occupancy) {
    const status = zone.isOccupied ? 'OCCUPIED' : 'VACANT';
    const duration = zone.isOccupied
      ? `for ${Math.round((Date.now() - zone.lastOccupied) / 60000)} min`
      : `since ${new Date(zone.lastOccupied).toLocaleTimeString()}`;
    lines.push(`  - ${zone.zone} (${zone.floor}): ${status} ${duration}`);
  }

  return lines.join('\n');
}

export function buildCommandContext(
  userMessage: string,
  accessories: AccessoryInstance[],
  occupancy: OccupancyState[],
): string {
  const deviceList = accessories.map(a => {
    const writable = Object.values(a.values)
      .filter(v => v.canWrite)
      .map(v => v.description)
      .join(', ');
    const zone = a.zone ? ` [${a.zone}]` : '';
    return `  - "${a.displayName}"${zone} (${a.humanType}) — controllable: ${writable || 'none'}`;
  }).join('\n');

  return `User request: "${userMessage}"

Available devices:
${deviceList}

${buildOccupancySummary(occupancy)}

Parse the user's request and determine which devices to control. Match device names flexibly (partial match is OK).`;
}
