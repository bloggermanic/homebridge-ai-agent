import { Logger } from 'homebridge';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeout: number;
  temperature: number;
}

export class OllamaClient {
  private config: OllamaConfig;
  private log: Logger;
  private enabled: boolean;

  constructor(config: OllamaConfig, enabled: boolean, log: Logger) {
    this.config = config;
    this.enabled = enabled;
    this.log = log;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async test(): Promise<{ success: boolean; message: string }> {
    if (!this.enabled) {
      return { success: false, message: 'AI is disabled in configuration' };
    }

    try {
      const available = await this.isAvailable();
      if (!available) {
        return { success: false, message: `Cannot connect to Ollama at ${this.config.baseUrl}` };
      }

      const response = await this.chat([
        { role: 'system', content: 'Respond with just "OK".' },
        { role: 'user', content: 'Are you ready?' },
      ]);

      return { success: true, message: `Connected to Ollama (${this.config.model}): ${response.substring(0, 50)}` };
    } catch (error) {
      return { success: false, message: `Ollama test failed: ${error}` };
    }
  }

  async chat(messages: ChatMessage[], options?: { format?: 'json'; temperature?: number }): Promise<string> {
    if (!this.enabled) {
      throw new Error('AI is disabled');
    }

    this.log.debug(`Ollama chat: ${messages.length} messages`);

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        format: options?.format,
        options: {
          temperature: options?.temperature ?? this.config.temperature,
          top_p: 0.9,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { message: { content: string } };
    const content = data.message.content;
    this.log.debug(`Ollama response: ${content.substring(0, 100)}`);
    return content;
  }

  async chatJson<T>(messages: ChatMessage[]): Promise<T> {
    const content = await this.chat(messages, { format: 'json' });

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      this.log.error('Failed to parse JSON from Ollama:', content.substring(0, 200));
      throw new Error(`Invalid JSON from Ollama: ${error}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getModel(): string {
    return this.config.model;
  }
}
