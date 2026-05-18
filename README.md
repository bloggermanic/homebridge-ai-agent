# Homebridge AI Agent

Privacy-first AI home automation agent powered by a local LLM (Ollama). Controls all your HomeKit devices through Homebridge, learns patterns, and makes intelligent automation decisions — all while keeping your data completely local.

## Features

- **Full Device Control**: Controls ALL HomeKit devices across ALL Homebridge plugins via Config UI X integration
- **Local AI Agent**: Uses Ollama with qwen3:8b (or any compatible model) running entirely on your machine
- **Natural Language**: Chat with your home — "turn off the kitchen lights", "what's the status of the house?"
- **Smart Lighting**: Automatically adjusts lights based on occupancy and time of day
- **Energy Saving**: Reduces thermostat targets for unoccupied floors
- **Security Alerts**: Multi-sensor fusion detects unusual motion patterns at night
- **Away Mode**: Simulates natural light patterns when you're away
- **Pattern Learning**: AI periodically analyzes sensor data and suggests new automation rules
- **Mobile-Ready API**: REST + WebSocket API with auth, designed for mobile app integration
- **100% Privacy**: No cloud calls, no telemetry — everything stays on your local network

## Requirements

- Homebridge 1.6+ with [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) **or** [HOOBS 5](https://hoobs.com)
- [Ollama](https://ollama.ai) running on the same machine (or accessible on the network)
- Node.js 18+ or 20+
- Mac Mini M4 16GB (recommended) or any machine that can run an 8B parameter model

## Quick Start

### 1. Install Ollama and pull the model

```bash
# Install Ollama (macOS)
brew install ollama

# Pull the recommended model
ollama pull qwen3:8b

# Verify it's running
curl http://localhost:11434/api/tags
```

### 2. Install the plugin

**Homebridge (Config UI X)**:
```bash
npm install homebridge-ai-agent
```
Or install through the Config UI X plugin search.

**HOOBS 5**:
Search for "homebridge-ai-agent" in the HOOBS dashboard Plugins tab, or install via terminal:
```bash
sudo hoobs plugin add homebridge-ai-agent
```

### 3. Configure

Add to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "AIAgent",
      "name": "AI Home Agent",
      "ollamaUrl": "http://localhost:11434",
      "ollamaModel": "qwen3:8b",
      "homebridgeUiUrl": "http://localhost:8581",
      "homebridgeUiToken": "YOUR_CONFIG_UI_X_TOKEN",
      "apiPort": 18581,
      "enableWebSocket": true,
      "automation": {
        "smartLighting": true,
        "energySaving": true,
        "securityAlerts": true,
        "awayModeSimulation": true,
        "multiSensorFusion": true
      },
      "zoneConfig": [
        {
          "name": "Living Room",
          "floor": "First Floor",
          "devices": "Living Room Light, Living Room Motion",
          "autoLights": true,
          "autoTemp": false
        }
      ]
    }
  ]
}
```

### HOOBS Configuration

For HOOBS users, set `homebridgeUiUrl` to your HOOBS address (typically port 80) and set `homebridgeBackend` to `"hoobs"` (or `"auto"` — it will auto-detect HOOBS on port 80):

```json
{
  "platforms": [
    {
      "platform": "AIAgent",
      "name": "AI Home Agent",
      "ollamaUrl": "http://localhost:11434",
      "ollamaModel": "qwen3:8b",
      "homebridgeBackend": "hoobs",
      "homebridgeUiUrl": "http://192.168.1.230",
      "homebridgeUiUsername": "YOUR_HOOBS_USERNAME",
      "homebridgeUiPassword": "YOUR_HOOBS_PASSWORD",
      "apiPort": 18581,
      "enableWebSocket": true,
      "automation": {
        "smartLighting": true,
        "energySaving": true,
        "securityAlerts": true,
        "awayModeSimulation": true,
        "multiSensorFusion": true
      }
    }
  ]
}
```

### 4. Get your Config UI X token

Go to your Homebridge UI > Settings > API Token, and copy it into the `homebridgeUiToken` field. Alternatively, provide `homebridgeUiUsername` and `homebridgeUiPassword`.

## Architecture

```
                    ┌─────────────────────┐
                    │    Homebridge        │
                    │  Config UI X API     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Accessory Registry  │  ← polls every 30s
                    │  (all devices)       │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │      EventBus        │  ← typed pub/sub
                    └──┬────────────┬──┬──┘
                       │            │  │
          ┌────────────▼──┐  ┌─────▼──▼────────┐
          │  Rule Engine   │  │   AI Agent       │
          │ (deterministic)│  │ (Ollama/qwen3)   │
          │  - lighting    │  │  - chat          │
          │  - energy      │  │  - patterns      │
          │  - security    │  │  - suggestions   │
          └────────┬───────┘  └────────┬─────────┘
                   │                   │
          ┌────────▼───────────────────▼─────────┐
          │         Device Controller             │
          │    (sends commands via Config UI X)   │
          └──────────────────────────────────────┘
                               │
          ┌────────────────────▼─────────────────┐
          │          API Server                   │
          │   REST (port 18581) + WebSocket /ws   │
          └──────────────────────────────────────┘
```

**Key design principle**: The Rule Engine handles all real-time decisions deterministically (fast, reliable). The AI Agent runs asynchronously for pattern analysis, natural language, and learning — never blocking automation.

## API Reference

All endpoints require `Authorization: Bearer <apiToken>` if `apiToken` is configured.

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check, uptime, Ollama status |
| GET | `/api/stats` | Event counts, pattern stats |

### Accessories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accessories` | List all accessories with state |
| GET | `/api/accessories/:id` | Single accessory detail |
| PUT | `/api/accessories/:id` | Set characteristic value |
| GET | `/api/accessories/type/:type` | Filter by device type |
| GET | `/api/accessories/zone/:zone` | Filter by zone |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events?hours=1&zone=kitchen` | Recent events (filtered) |
| GET | `/api/events/device/:id?hours=1` | Events for a device |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List all rules |
| POST | `/api/automation/rules` | Create a rule |
| PUT | `/api/automation/rules/:id` | Update a rule |
| DELETE | `/api/automation/rules/:id` | Delete a rule |
| POST | `/api/automation/away-mode` | Activate away mode |

### AI Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send a message to the AI agent |
| POST | `/api/chat/analyze` | Run pattern analysis |
| POST | `/api/chat/suggest-rules` | Get AI-suggested rules |
| POST | `/api/chat/clear-history` | Clear conversation history |

### WebSocket

Connect to `ws://localhost:18581/ws?token=YOUR_TOKEN`

**Incoming events**: All device state changes, rule triggers, AI suggestions are broadcast.

**Outgoing commands**:
```json
{ "type": "chat", "message": "turn off the lights" }
{ "type": "command", "uniqueId": "...", "characteristicType": "On", "value": false }
```

## Siri Integration

The plugin provides two ways to control your home via Siri:

### Virtual HomeKit Switches (Built-in)

The plugin automatically creates virtual switches in HomeKit that Siri can control:

| Switch | Siri Command | What it does |
|--------|-------------|--------------|
| Away Mode | "Hey Siri, turn on Away Mode" | Activates randomized light simulation |
| Good Night | "Hey Siri, turn on Good Night" | Turns off lights, sets sleep temperature |
| Good Morning | "Hey Siri, turn on Good Morning" | Turns on morning lights, sets day temperature |
| Security Check | "Hey Siri, turn on Security Check" | AI checks all sensors, reports status |
| All Lights Off | "Hey Siri, turn on All Lights Off" | Turns off every light |

Scene-type switches (Good Night, Good Morning, etc.) auto-reset after 1 second — they act as momentary triggers.

### Siri Shortcuts (Free-form Chat)

For natural language conversations with the AI agent, create a Siri Shortcut:

1. Open the **Shortcuts** app on your iPhone/Mac
2. Create a new shortcut named "Ask Home Agent"
3. Add these actions:
   - **Dictate Text** (captures your voice input)
   - **Get Contents of URL**:
     - URL: `http://YOUR_HOMEBRIDGE_IP:18581/api/chat`
     - Method: POST
     - Headers: `Authorization: Bearer YOUR_API_TOKEN`
     - Body (JSON): `{"message": "Dictated Text"}`
   - **Get Dictionary Value** for key `message` from the response
   - **Speak Text** (reads the AI response aloud)

Now say: **"Hey Siri, Ask Home Agent"** → speak your command → hear the response.

Example commands:
- "Turn off the kitchen lights"
- "What's the temperature in the living room?"
- "Is anyone home?"
- "Set the bedroom to 68 degrees"

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `ollamaModel` | `qwen3:8b` | Ollama model to use |
| `enableAI` | `true` | Enable AI features |
| `aiUsageFrequency` | `moderate` | How actively the AI analyzes patterns |
| `homebridgeBackend` | `auto` | Backend type: `auto`, `configui`, or `hoobs` |
| `homebridgeUiUrl` | `http://localhost:8581` | Config UI X or HOOBS URL |
| `homebridgeUiToken` | — | Config UI X API token |
| `apiPort` | `18581` | Plugin API server port |
| `enableWebSocket` | `true` | Enable WebSocket server |
| `apiToken` | — | Auth token for plugin API |
| `accessoryPollInterval` | `30` | Seconds between accessory state polls |
| `aiAnalysisInterval` | `900` | Seconds between AI pattern analysis |

## Troubleshooting

**"Config UI X not available"**: Make sure homebridge-config-ui-x is installed and running. Check the `homebridgeUiUrl` matches your setup.

**"Ollama: Cannot connect"**: Ensure Ollama is running (`ollama serve`) and the URL is correct. Test with `curl http://localhost:11434/api/tags`.

**"Config UI X authentication failed"**: Verify your token or username/password. Go to Homebridge UI > Settings to generate a new API token.

**No devices discovered**: The plugin discovers devices via Config UI X. If you just installed it, restart Homebridge and wait for the first poll cycle (30 seconds).

## License

MIT
