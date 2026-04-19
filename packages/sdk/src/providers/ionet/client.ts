/**
 * IoNetMessagingClient — HTTP-based messaging with io.net GPU cluster deployments.
 *
 * io.net workers run as containerised GPU workloads. AxonSDK containers expose:
 *
 *   GET  /health   → liveness probe (returns 200 "ok")
 *   POST /message  → deliver a payload; response body is the result
 *
 * The `processorId` for io.net is the worker endpoint URL, e.g.:
 *   https://worker.io.net/v1/<cluster-id>
 *
 * Security:
 *  - Only https:// endpoints are permitted
 *  - Private/internal IP ranges are blocked (prevents SSRF)
 *  - Response bodies are capped at 4 MiB (larger for GPU inference outputs)
 *  - Prototype-polluting keys in remote JSON payloads are rejected
 */

import type { Message } from '../../types.js';
import { AxonError } from '../../types.js';

const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;

const MAX_RESULT_BYTES = 4 * 1024 * 1024; // 4 MiB — larger for GPU inference
const IONET_API_BASE = 'https://api.io.net/v1';

function assertSafeEndpoint(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new AxonError('ionet', `Invalid endpoint URL: "${endpoint}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new AxonError('ionet', `Endpoint must use https:// (got "${parsed.protocol}").`);
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new AxonError('ionet', `Endpoint hostname "${parsed.hostname}" is a private/internal address.`);
  }
}

function safeParseJson(str: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return str;
  }
  if (parsed !== null && typeof parsed === 'object') {
    for (const key of Object.keys(parsed as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new AxonError('ionet', `Rejected payload: prototype-polluting key "${key}".`);
      }
    }
  }
  return parsed;
}

export class IoNetMessagingClient {
  private messageHandlers: Array<(msg: Message) => void> = [];
  private connected = false;
  private apiKey = '';

  async connect(secretKey: string): Promise<void> {
    if (!secretKey || secretKey.trim() === '') {
      throw new AxonError('ionet', 'A non-empty API key is required.');
    }
    this.apiKey = secretKey;
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.messageHandlers = [];
    this.apiKey = '';
  }

  async send(workerEndpoint: string, payload: unknown): Promise<void> {
    if (!this.connected) {
      throw new AxonError('ionet', 'Not connected. Call connect() first.');
    }

    assertSafeEndpoint(workerEndpoint);

    const base = workerEndpoint.replace(/\/$/, '');
    const messageUrl = `${base}/message`;
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(messageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(60_000), // longer timeout for GPU inference
      });
    } catch (err) {
      throw new AxonError('ionet', `Failed to reach io.net worker at ${workerEndpoint}: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new AxonError('ionet', `Worker returned ${response.status}: ${await response.text()}`);
    }

    const resultText = await response.text();
    if (resultText.length > MAX_RESULT_BYTES) {
      throw new AxonError('ionet', `Worker response exceeded ${MAX_RESULT_BYTES} bytes.`);
    }

    if (resultText?.trim()) {
      const msg: Message = {
        from: workerEndpoint,
        payload: safeParseJson(resultText),
        timestamp: new Date(),
      };
      for (const handler of this.messageHandlers) handler(msg);
    }
  }

  onMessage(handler: (msg: Message) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  async isLive(workerEndpoint: string): Promise<boolean> {
    assertSafeEndpoint(workerEndpoint);
    try {
      const res = await fetch(`${workerEndpoint.replace(/\/$/, '')}/health`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** List available GPU clusters from the io.net API. */
  async listClusters(): Promise<Array<{ id: string; gpuType: string; available: boolean }>> {
    if (!this.connected) throw new AxonError('ionet', 'Not connected.');
    try {
      const res = await fetch(`${IONET_API_BASE}/clusters`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      return (await res.json()) as Array<{ id: string; gpuType: string; available: boolean }>;
    } catch {
      return [];
    }
  }

  get isConnected(): boolean { return this.connected; }
}
