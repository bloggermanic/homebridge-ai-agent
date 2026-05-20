import { Logger } from 'homebridge';
import { RawAccessory, RawCharacteristic } from './configUiXClient';

export interface HomebridgeClientInterface {
  authenticate(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  getAccessories(): Promise<RawAccessory[]>;
  setCharacteristic(uniqueId: string, characteristicType: string, value: unknown): Promise<boolean>;
  destroy?(): void;
}

export interface HoobsAuthConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
}

interface HoobsRoom {
  id: string;
  name: string;
  sequence: number;
  devices: number;
  accessories: HoobsAccessory[];
}

interface HoobsAccessory {
  uuid: string;
  accessory_identifier: string;
  bridge_identifier: string;
  bridge: string;
  plugin: string;
  room: string;
  category: number;
  name: string;
  sequence: number;
  hidden: boolean;
  type: string;
  characteristics: HoobsCharacteristic[];
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  firmware_revision?: string;
}

interface HoobsCharacteristic {
  uuid: string;
  type: string;
  service: { uuid: string; type: string };
  description: string;
  value: unknown;
  format: string;
  unit: string | null;
  max_value: number | null;
  min_value: number | null;
  min_step: number | null;
  max_length: number | null;
  valid_values: number[] | null;
  read: boolean;
  write: boolean;
}

const FIREBASE_API_KEY = 'AIzaSyDMLKveJdwqhroHtN83wwt-5pgG4jhZMm0';
const FIREBASE_SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
const FIREBASE_REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes (tokens expire at 60)

interface FirebaseSignInResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
}

interface FirebaseRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  token_type: string;
  user_id: string;
}

export class HoobsClient implements HomebridgeClientInterface {
  private url: string;
  private token: string | null;
  private username?: string;
  private password?: string;
  private log: Logger;
  private refreshToken: string | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: HoobsAuthConfig, log: Logger) {
    this.url = config.url.replace(/\/$/, '');
    this.token = config.token || null;
    this.username = config.username;
    this.password = config.password;
    this.log = log;
  }

  async authenticate(): Promise<boolean> {
    if (this.token) {
      const valid = await this.validateToken();
      if (valid) {
        this.log.info('HOOBS: Static token is valid');
        return true;
      }
    }

    if (this.username && this.password) {
      const success = await this.firebaseLogin();
      if (success) {
        this.startTokenRefresh();
        return true;
      }
      return this.localLogin();
    }

    this.log.warn('HOOBS: No valid authentication method configured');
    return false;
  }

  private async validateToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/auth/validate`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const data = await response.json() as { valid: boolean };
      return data.valid === true;
    } catch {
      return false;
    }
  }

  private async firebaseLogin(): Promise<boolean> {
    try {
      this.log.info('HOOBS: Authenticating via Firebase cloud auth...');
      const response = await fetch(FIREBASE_SIGN_IN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.username,
          password: this.password,
          returnSecureToken: true,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const err = await response.json() as { error?: { message?: string } };
        this.log.warn(`HOOBS: Firebase auth failed: ${err.error?.message || response.status}`);
        return false;
      }

      const data = await response.json() as FirebaseSignInResponse;
      this.token = data.idToken;
      this.refreshToken = data.refreshToken;
      this.log.info('HOOBS: Firebase cloud auth successful');
      return true;
    } catch (error) {
      this.log.warn('HOOBS: Firebase auth error (will try local login):', error);
      return false;
    }
  }

  private async refreshFirebaseToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(FIREBASE_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshToken)}`,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.log.warn(`HOOBS: Token refresh failed: ${response.status}`);
        return false;
      }

      const data = await response.json() as FirebaseRefreshResponse;
      this.token = data.id_token;
      this.refreshToken = data.refresh_token;
      this.log.debug('HOOBS: Token refreshed successfully');
      return true;
    } catch (error) {
      this.log.error('HOOBS: Token refresh error:', error);
      return false;
    }
  }

  private startTokenRefresh(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(async () => {
      const success = await this.refreshFirebaseToken();
      if (!success) {
        this.log.warn('HOOBS: Refresh failed, attempting full re-login');
        await this.firebaseLogin();
      }
    }, TOKEN_REFRESH_INTERVAL);
  }

  private async localLogin(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/auth/logon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
          remember: true,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.log.error(`HOOBS local login failed: ${response.status}`);
        return false;
      }

      const data = await response.json() as { token: string | false; error?: string };
      if (!data.token) {
        this.log.error(`HOOBS local login failed: ${data.error || 'Invalid credentials'}`);
        return false;
      }

      this.token = data.token;
      this.log.info('HOOBS: Local auth successful');
      return true;
    } catch (error) {
      this.log.error('HOOBS local login error:', error);
      return false;
    }
  }

  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return false;
      const data = await response.json() as { application?: string };
      return data.application === 'hoobsd';
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
        if (response.status === 401 || response.status === 403) {
          this.log.warn('HOOBS: Token expired, re-authenticating...');
          const success = await this.authenticate();
          if (success) return this.getAccessories();
        }
        throw new Error(`Failed to fetch accessories: ${response.status}`);
      }

      const rooms = await response.json() as HoobsRoom[];
      return this.flattenRoomsToAccessories(rooms);
    } catch (error) {
      this.log.error('HOOBS: Failed to get accessories:', error);
      return [];
    }
  }

  async setCharacteristic(uniqueId: string, characteristicType: string, value: unknown): Promise<boolean> {
    // uniqueId format for HOOBS: "bridge:accessory_identifier"
    const [bridge, accessoryId] = this.parseUniqueId(uniqueId);
    if (!bridge || !accessoryId) {
      this.log.error(`HOOBS: Invalid uniqueId format: ${uniqueId}`);
      return false;
    }

    const charType = this.toHoobsCharType(characteristicType);

    try {
      const response = await fetch(
        `${this.url}/api/accessory/${encodeURIComponent(bridge)}/${encodeURIComponent(accessoryId)}/${encodeURIComponent(charType)}`,
        {
          method: 'PUT',
          headers: {
            ...this.authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        this.log.error(`HOOBS: Failed to set characteristic: ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('HOOBS: Set characteristic error:', error);
      return false;
    }
  }

  private flattenRoomsToAccessories(rooms: HoobsRoom[]): RawAccessory[] {
    const result: RawAccessory[] = [];

    for (const room of rooms) {
      if (!room.accessories) continue;

      for (const acc of room.accessories) {
        if (acc.hidden) continue;

        const characteristics: RawCharacteristic[] = (acc.characteristics || []).map(c => ({
          aid: 0,
          iid: 0,
          uuid: c.uuid || '',
          type: this.fromHoobsCharType(c.type || ''),
          serviceType: c.service?.type || '',
          serviceName: c.service?.type || '',
          description: c.description || this.capitalizeCharType(c.type || 'unknown'),
          value: c.value,
          format: c.format || 'string',
          perms: this.buildPerms(c.read, c.write),
          canRead: c.read ?? false,
          canWrite: c.write ?? false,
          ev: false,
          minValue: c.min_value ?? undefined,
          maxValue: c.max_value ?? undefined,
          minStep: c.min_step ?? undefined,
          validValues: c.valid_values ?? undefined,
        }));

        const uniqueId = `${acc.bridge}:${acc.accessory_identifier}`;

        result.push({
          aid: 0,
          iid: 0,
          uuid: acc.uuid || '',
          type: this.mapHoobsType(acc.type || 'unknown'),
          humanType: this.capitalizeCharType(acc.type || 'unknown'),
          serviceName: acc.name,
          serviceCharacteristics: characteristics,
          accessoryInformation: {
            Name: acc.name,
            Manufacturer: acc.manufacturer || 'Unknown',
            Model: acc.model || 'Unknown',
            'Serial Number': acc.serial_number || '',
            'Firmware Revision': acc.firmware_revision || '',
          },
          uniqueId,
          instance: {
            name: acc.plugin || 'unknown',
            username: '',
            ipAddress: '',
            port: 0,
            services: [],
            connectionFailedCount: 0,
          },
        });
      }
    }

    return result;
  }

  private parseUniqueId(uniqueId: string): [string | null, string | null] {
    const colonIdx = uniqueId.indexOf(':');
    if (colonIdx === -1) return [null, null];
    return [uniqueId.slice(0, colonIdx), uniqueId.slice(colonIdx + 1)];
  }

  private toHoobsCharType(hapType: string): string {
    // Convert HAP characteristic names to HOOBS snake_case
    const map: Record<string, string> = {
      On: 'on',
      Brightness: 'brightness',
      Hue: 'hue',
      Saturation: 'saturation',
      ColorTemperature: 'color_temperature',
      TargetTemperature: 'target_temperature',
      CurrentTemperature: 'current_temperature',
      TargetHeatingCoolingState: 'target_heating_cooling_state',
      CurrentHeatingCoolingState: 'current_heating_cooling_state',
      LockTargetState: 'lock_target_state',
      LockCurrentState: 'lock_current_state',
      MotionDetected: 'motion_detected',
      ContactSensorState: 'contact_sensor_state',
      CurrentDoorState: 'current_door_state',
      TargetDoorState: 'target_door_state',
      Active: 'active',
      InUse: 'in_use',
      OutletInUse: 'outlet_in_use',
    };
    return map[hapType] || hapType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private fromHoobsCharType(hoobsType: string): string {
    // Convert HOOBS snake_case to HAP PascalCase
    const map: Record<string, string> = {
      on: 'On',
      brightness: 'Brightness',
      hue: 'Hue',
      saturation: 'Saturation',
      color_temperature: 'ColorTemperature',
      target_temperature: 'TargetTemperature',
      current_temperature: 'CurrentTemperature',
      target_heating_cooling_state: 'TargetHeatingCoolingState',
      current_heating_cooling_state: 'CurrentHeatingCoolingState',
      lock_target_state: 'LockTargetState',
      lock_current_state: 'LockCurrentState',
      motion_detected: 'MotionDetected',
      contact_sensor_state: 'ContactSensorState',
      current_door_state: 'CurrentDoorState',
      target_door_state: 'TargetDoorState',
      active: 'Active',
      in_use: 'InUse',
      outlet_in_use: 'OutletInUse',
    };
    return map[hoobsType] || hoobsType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  private mapHoobsType(type: string): string {
    const map: Record<string, string> = {
      light: 'Lightbulb',
      lightbulb: 'Lightbulb',
      switch: 'Switch',
      outlet: 'Outlet',
      thermostat: 'Thermostat',
      fan: 'Fan',
      lock: 'LockMechanism',
      door: 'Door',
      garage_door: 'GarageDoorOpener',
      window: 'Window',
      window_covering: 'WindowCovering',
      motion_sensor: 'MotionSensor',
      contact_sensor: 'ContactSensor',
      temperature_sensor: 'TemperatureSensor',
      humidity_sensor: 'HumiditySensor',
      camera: 'CameraRTPStreamManagement',
      speaker: 'Speaker',
      television: 'Television',
    };
    return map[type] || type;
  }

  private capitalizeCharType(type: string): string {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  private buildPerms(read: boolean, write: boolean): string[] {
    const perms: string[] = [];
    if (read) perms.push('pr');
    if (write) perms.push('pw');
    return perms;
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { authorization: this.token };
    }
    return {};
  }
}
