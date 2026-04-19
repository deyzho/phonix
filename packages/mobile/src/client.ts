/**
 * MobileAxonClient — messaging-only client for React Native (iOS & Android).
 *
 * The full @axonsdk/sdk AxonClient handles deploy, estimate, and bundling via
 * esbuild and Node.js child_process — none of which exist in React Native's
 * Hermes/JSC runtimes. This client handles only the MESSAGING half of the SDK:
 * connecting, sending payloads, and receiving results.
 *
 * Supported providers:
 *  - 'akash'   — HTTP POST to a lease endpoint (fetch, works everywhere)
 *  - 'acurast' — WebSocket to the Acurast proxy (WebSocket is native in RN)
 *  - 'http'    — Generic HTTPS POST for custom endpoints
 *
 * Deploy your processors with the Axon CLI on your development machine, then
 * call them from your iOS/Android app using this client.
 *
 * Security:
 *  - All endpoints are validated: https:// only, private IPs blocked (SSRF prevention)
 *  - Response bodies capped at 1 MiB
 *  - Prototype-polluting keys in remote JSON payloads are rejected
 *  - AppState integration auto-disconnects on background, reconnects on foreground
 */

import type { Message } from '@axonsdk/sdk';
import { AxonError } from '@axonsdk/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MobileProviderName = 'acurast' | 'akash' | 'http';

export interface MobileAxonClientOptions {
  /**
   * The provider your processors are deployed on.
   *  - 'akash'   — uses HTTP POST to the Akash lease endpoint
   *  - 'acurast' — uses WebSocket to the Acurast proxy
   *  - 'http'    — generic HTTPS POST to any endpoint
   */
  provider: MobileProviderName;

  /** Secret key used to authenticate with the provider. */
  secretKey: string;

  /**
   * WebSocket URL for the Acurast proxy (acurast provider only).
   * Defaults to wss://proxy.acurast.com
   */
  wsUrl?: string;

  /**
   * Whether to automatically reconnect when the app comes back to the foreground.
   * Requires calling attachAppStateListener() after connect().
   * Default: true
   */
  reconnectOnForeground?: boolean;

  /**
   * Maximum response body size in bytes. Default: 1 MiB.
   */
  maxResponseBytes?: number;
}

// ─── SSRF guard ───────────────────────────────────────────────────────────────

const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;

function assertSafeEndpoint(endpoint: string, label = 'Endpoint'): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new AxonError('mobile', `${label} is not a valid URL: "${endpoint}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'wss:') {
    throw new AxonError(
      'mobile',
      `${label} must use https:// or wss:// (got "${parsed.protocol}"). ` +
        'Plain HTTP/WS transmits payloads in cleartext.'
    );
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new AxonError(
      'mobile',
      `${label} hostname "${parsed.hostname}" resolves to a private/internal address. ` +
        'Requests to internal infrastructure are blocked.'
    );
  }
}

// ─── JSON guard ───────────────────────────────────────────────────────────────

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
          'mobile',
          `Rejected remote payload: contains prototype-polluting key "${key}".`
        );
      }
    }
  }
  return parsed;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class MobileAxonClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(msg: Message) => void> = [];
  private _connected = false;
  private appStateSubscription: { remove(): void } | null = null;
  private readonly options: MobileAxonClientOptions;
  private readonly maxResponseBytes: number;

  constructor(options: MobileAxonClientOptions) {
    if (!options.secretKey || options.secretKey.trim() === '') {
      throw new AxonError('mobile', 'secretKey is required and must not be empty.');
    }
    this.options = options;
    this.maxResponseBytes = options.maxResponseBytes ?? 1 * 1024 * 1024;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Connect to the provider network.
   * For Akash/HTTP this is a no-op (stateless HTTP).
   * For Acurast this opens a WebSocket to the proxy.
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    if (this.options.provider === 'acurast') {
      await this._connectAcurast();
    } else {
      // Akash and generic HTTP are stateless — no persistent connection needed
      this._connected = true;
    }
  }

  private _connectAcurast(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.options.wsUrl ?? 'wss://proxy.acurast.com';
      assertSafeEndpoint(wsUrl, 'Acurast WebSocket URL');

      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new AxonError('mobile', 'Acurast WebSocket connection timed out after 15s.'));
      }, 15_000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this._connected = true;
        this.ws = ws;
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new AxonError('mobile', 'Acurast WebSocket connection failed.'));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : String(event.data);
          const parsed = safeParseJson(raw);
          const msg: Message = {
            from: (parsed as { sender?: string })?.sender ?? 'acurast',
            payload: (parsed as { payload?: unknown })?.payload ?? parsed,
            timestamp: new Date(),
          };
          for (const handler of this.messageHandlers) handler(msg);
        } catch {
          // Ignore malformed or rejected messages
        }
      };

      ws.onclose = () => {
        this._connected = false;
        this.ws = null;
      };
    });
  }

  /**
   * Disconnect from the provider and clean up all resources.
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  /**
   * Full cleanup — disconnects, removes AppState listener, and clears all
   * message handlers. Call this in your component's cleanup / useEffect return.
   */
  dispose(): void {
    this.detachAppStateListener();
    this.disconnect();
    this.messageHandlers = [];
  }

  // ─── AppState lifecycle ─────────────────────────────────────────────────────

  /**
   * Attach a React Native AppState listener that automatically disconnects
   * the client when the app moves to the background and reconnects when it
   * returns to the foreground.
   *
   * Call this once after a successful connect(). The listener is removed by
   * detachAppStateListener() or dispose().
   */
  attachAppStateListener(): void {
    if (this.appStateSubscription) return;

    // Lazy import — react-native is not available in Node.js test environments
    let AppState: typeof import('react-native').AppState;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ AppState } = require('react-native') as typeof import('react-native'));
    } catch {
      return; // Running in a non-RN environment (e.g. tests) — skip
    }

    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        this.disconnect();
      } else if (state === 'active' && (this.options.reconnectOnForeground ?? true)) {
        this.connect().catch(() => {
          // Reconnection failure is non-fatal — the app can retry manually
        });
      }
    });
  }

  detachAppStateListener(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  // ─── Messaging ──────────────────────────────────────────────────────────────

  /**
   * Send a payload to a deployed processor and wait for acknowledgement.
   *
   * @param endpoint  For Akash: the lease URL (https://provider.akash.network:31234)
   *                  For Acurast: the processor public key (hex)
   *                  For HTTP: any https:// URL
   * @param payload   Any JSON-serialisable data
   */
  async send(endpoint: string, payload: unknown): Promise<void> {
    if (!this._connected) {
      throw new AxonError('mobile', 'Not connected. Call connect() first.');
    }

    if (this.options.provider === 'acurast') {
      return this._sendAcurast(endpoint, payload);
    }
    return this._sendHttp(endpoint, payload);
  }

  private async _sendHttp(endpoint: string, payload: unknown): Promise<void> {
    assertSafeEndpoint(endpoint, 'Lease endpoint');

    const base = endpoint.replace(/\/$/, '');
    const url = this.options.provider === 'akash' ? `${base}/message` : base;

    const body =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new AxonError(
        'mobile',
        `Failed to reach endpoint ${endpoint}: ${(err as Error).message}`
      );
    }

    if (!response.ok) {
      throw new AxonError(
        'mobile',
        `Endpoint returned ${response.status}: ${await response.text()}`
      );
    }

    const resultText = await response.text();
    if (resultText.length > this.maxResponseBytes) {
      throw new AxonError(
        'mobile',
        `Response exceeded ${this.maxResponseBytes} bytes (got ${resultText.length} bytes).`
      );
    }

    if (resultText?.trim()) {
      const msg: Message = {
        from: endpoint,
        payload: safeParseJson(resultText),
        timestamp: new Date(),
      };
      for (const handler of this.messageHandlers) handler(msg);
    }
  }

  private _sendAcurast(recipient: string, payload: unknown): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AxonError('mobile', 'Acurast WebSocket is not open.');
    }
    const message = JSON.stringify({ recipient, payload });
    this.ws.send(message);
    return Promise.resolve();
  }

  /**
   * Register a handler for incoming messages.
   * @returns An unsubscribe function — call it to remove the handler.
   */
  onMessage(handler: (msg: Message) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  // ─── Probes ─────────────────────────────────────────────────────────────────

  /**
   * Check whether an Akash container lease endpoint is live.
   * Returns true if GET /health responds with 200.
   */
  async isLive(leaseEndpoint: string): Promise<boolean> {
    assertSafeEndpoint(leaseEndpoint, 'Lease endpoint');
    try {
      const res = await fetch(`${leaseEndpoint.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected;
  }

  get provider(): MobileProviderName {
    return this.options.provider;
  }

  /**
   * Returns the current platform — 'ios', 'android', or 'unknown'.
   * Reads from react-native's Platform API; falls back to 'unknown' in
   * non-RN environments (e.g. tests, server-side).
   */
  get platform(): 'ios' | 'android' | 'unknown' {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Platform } = require('react-native') as typeof import('react-native');
      const os = Platform.OS;
      if (os === 'ios' || os === 'android') return os;
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
