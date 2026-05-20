# Roadmap

## v0.2.0 — Foundation Refactor (Current)

**Status**: Complete

- [x] Modular architecture (EventBus, Registry, Controller, RuleEngine, AIAgent)
- [x] Config UI X integration for full device access across all plugins
- [x] Homebridge Internal Events API as fallback
- [x] Ollama /api/chat with JSON mode (replaces /api/generate + regex parsing)
- [x] Default model changed to qwen3:8b
- [x] Deterministic rule engine for real-time automation
- [x] Built-in rules: smart lighting, energy saving, security alerts, away mode
- [x] AI agent: natural language chat, pattern analysis, rule suggestions
- [x] REST API with bearer token auth
- [x] WebSocket server for real-time event streaming
- [x] TypeScript strict mode enabled
- [x] Proper shutdown/cleanup (no leaked intervals)

---

## v0.3.0 — Zone Intelligence

**Status**: Planned

- [ ] Auto-discover zones from Config UI X room assignments
- [ ] Zone-aware device grouping (auto-assign devices to zones by name patterns)
- [ ] Per-zone occupancy tracking with timeout configuration
- [ ] Zone transition detection (e.g., "moving from kitchen to living room")
- [ ] Sunrise/sunset-aware lighting rules (replace hardcoded 17:00-07:00)
- [ ] Configurable rule parameters via API (e.g., vacancy timeout per zone)

---

## v0.4.0 — AI Improvements

**Status**: Planned

- [ ] Multi-turn conversation memory (persisted across restarts)
- [ ] AI-generated rules auto-register (with user approval via API)
- [ ] Scene creation via natural language ("create a movie night scene")
- [ ] Anomaly detection with configurable sensitivity
- [ ] Weekly/monthly pattern summaries
- [ ] Support for additional Ollama models (llama3.3, mistral-small, phi-4)

---

## v0.5.0 — Mobile App

**Status**: Planned

- [ ] React Native mobile app (iOS + Android)
- [ ] Push notifications for security alerts
- [ ] Dashboard: device overview, zone map, occupancy status
- [ ] Chat interface for natural language control
- [ ] Rule management UI
- [ ] Away mode activation from app
- [ ] Pre-built Siri Shortcuts bundle (downloadable .shortcut files)
- [ ] SiriKit intent integration (direct Siri → plugin without Shortcuts app)

---

## v0.6.0 — Advanced Automation

**Status**: Planned

- [ ] Geofencing support (home/away detection via phone presence)
- [ ] Weather API integration for temperature rules
- [ ] Multi-user awareness (different profiles for household members)
- [ ] Scheduled automations (time-based rules)
- [ ] Energy usage tracking and reports
- [ ] Integration with Apple HomeKit scenes

---

## v1.0.0 — Stable Release

**Status**: Future

- [ ] Comprehensive test suite (unit + integration)
- [ ] Published to npm registry
- [ ] Homebridge verified plugin badge
- [ ] Complete documentation with examples
- [ ] Migration guide from v0.1.x
- [ ] Performance benchmarks and optimization

---

## Changelog

### v0.2.5 (2026-05-19)

**Fix**:
- Handle undefined characteristic/accessory types in HOOBS API responses (null guard in `flattenRoomsToAccessories`)

### v0.2.4 (2026-05-18)

**Fix**:
- Corrected HOOBS plugin installation path (`/var/lib/hoobs/homebridge-ai-agent/` with local `node_modules/`)

### v0.2.3 (2026-05-18)

**Fix**:
- Fixed npm package missing compiled JavaScript — `.npmignore` now correctly includes `dist/` output

### v0.2.2 (2026-05-17)

**New Features**:
- HOOBS 5 support — plugin auto-detects HOOBS vs Config UI X based on port
- New `homebridgeBackend` config option: `"auto"`, `"configui"`, or `"hoobs"`
- HoobsClient adapter translates between HOOBS API (rooms-based, snake_case) and internal format

**Technical**:
- Extracted `HomebridgeClientInterface` for polymorphic backend support
- AccessoryRegistry and DeviceController now accept any client implementing the interface
- Platform auto-detects backend: port 80 → HOOBS, port 8581 → Config UI X
- HOOBS characteristic type mapping (HAP PascalCase ↔ HOOBS snake_case)

### v0.2.1 (2026-05-17)

**New Features**:
- Siri integration via virtual HomeKit switches (Away Mode, Good Night, Good Morning, Security Check, All Lights Off)
- Virtual switches appear natively in HomeKit — "Hey Siri, turn on Good Night" works immediately
- Siri Shortcut documentation for free-form natural language chat via voice
- Scene-type switches auto-reset (momentary triggers)

**Technical**:
- New `VirtualAccessoryManager` module creates and manages virtual accessories
- Platform now properly caches and restores its own accessories
- Plugin registers accessories with Homebridge (required for HomeKit/Siri visibility)

### v0.2.0 (2026-05-17)

**Breaking Changes**:
- Complete architecture rewrite — existing v0.1.0 configs will need updates
- Default Ollama model changed from `llama3.2:3b` to `qwen3:8b`
- API port changed from `8581` to `18581` to avoid conflict with Config UI X
- New required config: `homebridgeUiUrl` and auth (`homebridgeUiToken` or username/password)

**New Features**:
- Full control of all HomeKit devices via Config UI X REST API
- Event-driven rule engine replaces polling-based automation loop
- Natural language device control ("turn off kitchen lights")
- AI pattern analysis and rule suggestions
- Mobile-ready REST API with bearer token authentication
- WebSocket real-time event streaming
- Away mode light simulation (fully implemented, not stubbed)

**Technical**:
- TypeScript strict mode enabled
- Modular architecture: 8 independent modules connected via EventBus
- All intervals/timeouts properly cleaned up on shutdown
- Isolated node-persist instances (no singleton conflicts)
- Ollama /api/chat with format:"json" (guaranteed valid JSON output)

### v0.1.0

- Initial prototype (non-functional — could not access devices from other plugins)
