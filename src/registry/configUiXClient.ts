import { Logger } from 'homebridge';
import { HomebridgeClientInterface } from './homebridgeClient';

export interface ConfigUiXAuthConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
}

export interface RawAccessory {
  aid: number;
  iid: number;
  uuid: string;
  type: string;
  humanType: string;
  serviceName: string;
  serviceCharacteristics: RawCharacteristic[];
  accessoryInformation: Record<string, string>;
  uniqueId: string;
  instance: {
    name: string;
    username: string;
    ipAddress: string;
    port: number;
    services: unknown[];
    connectionFailedCount: number;
  };
}

export interface RawCharacteristic {
  aid: number;
  iid: number;
  uuid: string;
  type: string;
  serviceType: string;
  serviceName: string;
  description: string;
  value: unknown;
  format: string;
  perms: string[];
  canRead: boolean;
  canWrite: boolean;
  ev: boolean;
  minValue?: number;
  maxValue?: number;
  minStep?: number;
  validValues?: number[];
}

export class ConfigUiXClient implements HomebridgeClientInterface {
  private url: string;
  private token: string | null;
  private username?: string;
  private password?: string;
  private log: Logger;

  constructor(config: ConfigUiXAuthConfig, log: Logger) {
    this.url = config.url.replace(/\/$/, '');
    this.token = config.token || null;
    this.username = config.username;
    this.password = config.password;
    this.log = log;
  }

  async authenticate(): Promise<boolean> {
    if (this.token) {
      const valid = await this.validateToken();
      if (valid) return true;
    }

    if (this.username && this.password) {
      return this.login();
    }

    this.log.warn('Config UI X: No valid authentication method configured');
    return false;
  }

  private async validateToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/auth/check`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async login(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.log.error(`Config UI X login failed: ${response.status}`);
        return false;
      }

      const data = await response.json() as { access_token: string };
      this.token = data.access_token;
      this.log.info('Config UI X: Authenticated successfully');
      return true;
    } catch (error) {
      this.log.error('Config UI X login error:', error);
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.url, { signal: AbortSignal.timeout(3000) });
      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  }

  async getAccessories(): Promise<RawAccessory[]> {
    try {
      const response = await fetch(`${this.url}/api/accessories`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.log.warn('Config UI X: Token expired, re-authenticating...');
          const success = await this.authenticate();
          if (success) return this.getAccessories();
        }
        throw new Error(`Failed to fetch accessories: ${response.status}`);
      }

      return await response.json() as RawAccessory[];
    } catch (error) {
      this.log.error('Config UI X: Failed to get accessories:', error);
      return [];
    }
  }

  async setCharacteristic(uniqueId: string, characteristicType: string, value: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/accessories/${encodeURIComponent(uniqueId)}`, {
        method: 'PUT',
        headers: {
          ...this.authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characteristicType,
          value,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.log.error(`Config UI X: Failed to set characteristic: ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Config UI X: Set characteristic error:', error);
      return false;
    }
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }
}
