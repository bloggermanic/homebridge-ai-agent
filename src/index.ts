import { API } from 'homebridge';
import { AIAgentPlatform, PLATFORM_NAME, PLUGIN_NAME } from './platform';

export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AIAgentPlatform);
};
