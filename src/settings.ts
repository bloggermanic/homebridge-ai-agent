export const PLATFORM_NAME = 'AIAgent';
export const PLUGIN_NAME = 'homebridge-ai-agent';

export interface AIAgentPlatformConfig {
  name: string;
  platform: string;

  // Privacy
  privacyMode: 'strict' | 'balanced' | 'enhanced';

  // Ollama / LLM
  ollamaUrl: string;
  ollamaModel: string;
  enableAI: boolean;
  aiUsageFrequency: 'minimal' | 'moderate' | 'frequent';

  // Homebridge/HOOBS integration
  homebridgeBackend: 'auto' | 'configui' | 'hoobs';
  homebridgeUiUrl: string;
  homebridgeUiToken?: string;
  homebridgeUiUsername?: string;
  homebridgeUiPassword?: string;

  // API server
  apiPort: number;
  enableWebSocket: boolean;
  apiToken?: string;

  // Automation features
  automation: AutomationConfig;

  // Zone configuration
  zoneConfig?: ZoneConfig[];

  // Polling
  accessoryPollInterval: number;
  aiAnalysisInterval: number;

  debug: boolean;
}

export interface AutomationConfig {
  smartLighting: boolean;
  energySaving: boolean;
  securityAlerts: boolean;
  awayModeSimulation: boolean;
  multiSensorFusion: boolean;
}

export interface ZoneConfig {
  name: string;
  floor: string;
  devices: string;
  autoLights: boolean;
  autoTemp: boolean;
}

export const DEFAULT_CONFIG: Partial<AIAgentPlatformConfig> = {
  privacyMode: 'strict',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3:8b',
  enableAI: true,
  aiUsageFrequency: 'moderate',
  homebridgeBackend: 'auto',
  homebridgeUiUrl: 'http://localhost:8581',
  apiPort: 18581,
  enableWebSocket: true,
  accessoryPollInterval: 30,
  aiAnalysisInterval: 900,
  debug: false,
  automation: {
    smartLighting: true,
    energySaving: true,
    securityAlerts: true,
    awayModeSimulation: true,
    multiSensorFusion: true,
  },
};

export function resolveConfig(config: Record<string, unknown>): AIAgentPlatformConfig {
  const defaults = DEFAULT_CONFIG;
  return {
    name: (config.name as string) || 'AI Home Agent',
    platform: PLATFORM_NAME,
    privacyMode: (config.privacyMode as AIAgentPlatformConfig['privacyMode']) || defaults.privacyMode!,
    ollamaUrl: (config.ollamaUrl as string) || defaults.ollamaUrl!,
    ollamaModel: (config.ollamaModel as string) || defaults.ollamaModel!,
    enableAI: config.enableAI !== false,
    aiUsageFrequency: (config.aiUsageFrequency as AIAgentPlatformConfig['aiUsageFrequency']) || defaults.aiUsageFrequency!,
    homebridgeBackend: (config.homebridgeBackend as AIAgentPlatformConfig['homebridgeBackend']) || defaults.homebridgeBackend!,
    homebridgeUiUrl: (config.homebridgeUiUrl as string) || defaults.homebridgeUiUrl!,
    homebridgeUiToken: config.homebridgeUiToken as string | undefined,
    homebridgeUiUsername: config.homebridgeUiUsername as string | undefined,
    homebridgeUiPassword: config.homebridgeUiPassword as string | undefined,
    apiPort: (config.apiPort as number) || defaults.apiPort!,
    enableWebSocket: config.enableWebSocket !== false,
    apiToken: config.apiToken as string | undefined,
    accessoryPollInterval: (config.accessoryPollInterval as number) || defaults.accessoryPollInterval!,
    aiAnalysisInterval: (config.aiAnalysisInterval as number) || defaults.aiAnalysisInterval!,
    debug: (config.debug as boolean) || false,
    automation: {
      smartLighting: (config.automation as AutomationConfig)?.smartLighting !== false,
      energySaving: (config.automation as AutomationConfig)?.energySaving !== false,
      securityAlerts: (config.automation as AutomationConfig)?.securityAlerts !== false,
      awayModeSimulation: (config.automation as AutomationConfig)?.awayModeSimulation !== false,
      multiSensorFusion: (config.automation as AutomationConfig)?.multiSensorFusion !== false,
    },
    zoneConfig: config.zoneConfig as ZoneConfig[] | undefined,
  };
}
