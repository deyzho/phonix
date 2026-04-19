/**
 * AkashMessagingClient — HTTP-based messaging with Akash container deployments.
 *
 * Akash workloads run as Docker containers. AxonSDK containers expose a small
 * HTTP API on their lease URL:
 *
 *   GET  /health   → liveness probe (returns 200 "ok")
 *   POST /message  → deliver a payload; response body is the result
 *
 * The `processorId` for Akash is the full lease endpoint URL, e.g.:
 *   https://provider.akash.network:31234
 *
 * Security:
 *  - Only https:// endpoints are permitted (enforced in assertSafeAkashEndpoint)
 *  - Private/internal IP ranges are blocked (prevents SSRF)
 *  - Response bodies are capped at 1 MiB
 *  - Prototype-polluting keys in remote JSON payloads are rejected
 */

import type { Message } from '../../types.js';
import { AxonError } from '../../types.js';

// Block private/loopback/link-local addresses to prevent SSRF.
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;

function assertSafeAkashEndpoint(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new AxonError('akash', `Invalid lease endpoint URL: "${endpoint}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new AxonError(
      'akash',
      `Lease endpoint must use https:// (got "${parsed.protocol}"). ` +
        'Plain HTTP would transmit payloads in cleartext.'
    );
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new AxonError(
      'akash',
      `Lease endpoint hostname "${parsed.hostname}" resolves to a private/internal address. ` +
        'Requests to internal infrastructure are blocked.'
    );
  }
}

export class AkashMessagingClient {
  private messageHandlers: Array<(msg: Message) => void> = [];
  private connected = false;

  async connect(_secretKey: string): Promise<void> {
    // Akash messaging is stateless HTTP — no persistent connection needed.
    // The secretKey is held by the provider and used for deployment signing only.
    if (!_secretKey || _secretKey.trim() === '') {
      throw new AxonError('akash', 'A non-empty secret key is required.');
    }
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.messageHandlers = [];
  }

  /**
   * Send a payload to a deployed Akash container and dispatch the result to
   * registered message handlers.
   *
   * @param leaseEndpoint — full https:// URL of the lease (e.g. https://provider.akash.network:31234)
   * @param payload       — JSON-serialisable data
   */
  async send(leaseEndpoint: string, payload: unknown): Promise<void> {
    if (!this.connected) {
      throw new AxonError('akash', 'Not connected. Call connect() first.');
    }

    assertSafeAkashEndpoint(leaseEndpoint);

    const base = leaseEndpoint.replace(/\/$/, '');
    const messageUrl = `${base}/message`;

    const payloadStr =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new AxonError(
        'akash',
        `Failed to reach Akash container at ${leaseEndpoint}: ${(err as Error).message}`
      );
    }

    if (!response.ok) {
      throw new AxonError(
        'akash',
        `Container returned ${response.status}: ${await response.text()}`
      );
    }

    const MAX_RESULT_BYTES = 1 * 1024 * 1024; // 1 MiB
    const resultText = await response.text();
    if (resultText.length > MAX_RESULT_BYTES) {
      throw new AxonError(
        'akash',
        `Container response exceeded ${MAX_RESULT_BYTES} bytes (got ${resultText.length} bytes).`
      );
    }

    if (resultText && resultText.trim()) {
      const msg: Message = {
        from: leaseEndpoint,
        payload: safeParseJson(resultText),
        timestamp: new Date(),
      };
      for (const handler of this.messageHandlers) {
        handler(msg);
      }
    }
  }

  onMessage(handler: (msg: Message) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Probe the container's /health endpoint to confirm it is live.
   * Returns true if the container responds with 200, false otherwise.
   */
  async isLive(leaseEndpoint: string): Promise<boolean> {
    assertSafeAkashEndpoint(leaseEndpoint);
    try {
      const res = await fetch(`${leaseEndpoint.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        throw new AxonError(
          'akash',
          `Rejected remote payload: contains prototype-polluting key "${key}".`
        );
      }
    }
  }
  return parsed;
}
