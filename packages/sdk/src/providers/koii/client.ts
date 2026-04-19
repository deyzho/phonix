/**
 * KoiiMessagingClient — messaging with Koii task nodes.
 *
 * Koii task nodes expose an HTTP API (default port 10000). The `processorId`
 * for Koii is either:
 *   - A task node HTTP endpoint URL (e.g. "http://node.koii.com:10000")
 *   - A base58 public key (looked up via the K2 task registry)
 *
 * Message flow (send):
 *   1. POST the payload to `${nodeEndpoint}/task/${taskId}/input`
 *   2. Poll `${nodeEndpoint}/task/${taskId}/result` until the result appears
 *   3. Dispatch the result to registered message handlers
 *
 * Message flow (onMessage):
 *   Handlers are called whenever send() receives a response from a node.
 *   Koii does not support push-style messaging — all communication is
 *   request/response initiated by the client.
 */

import type { Message } from '../../types.js';
import { AxonError } from '../../types.js';

const DEFAULT_KOII_RPC = 'https://mainnet.koii.network';

// Block private/loopback/link-local addresses in node endpoints to prevent SSRF.
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;

function assertSafeKoiiEndpoint(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new AxonError('koii',`Invalid node endpoint URL: "${endpoint}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new AxonError(
      'koii',
      `Node endpoint must use https:// (got "${parsed.protocol}"). ` +
        'Plain HTTP would transmit payloads in cleartext.'
    );
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new AxonError(
      'koii',
      `Node endpoint hostname "${parsed.hostname}" resolves to a private/internal address. ` +
        'Requests to internal infrastructure are blocked.'
    );
  }
}

export class KoiiMessagingClient {
  private rpcUrl: string;
  private taskId: string = '';
  private messageHandlers: Array<(msg: Message) => void> = [];
  private connected = false;

  constructor(rpcUrl: string = DEFAULT_KOII_RPC) {
    this.rpcUrl = rpcUrl;
  }

  async connect(secretKey: string, taskId?: string): Promise<void> {
    // Validate the secret key by attempting to derive the public key
    if (!secretKey || secretKey.trim() === '') {
      throw new AxonError('koii','A non-empty secret key is required to connect.');
    }

    // Try to load @_koii/web3.js for key validation (optional)
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- optional dependency, may not be installed
      const { Keypair } = (await import('@_koii/web3.js')) as {
        Keypair: { fromSecretKey(key: Uint8Array): { publicKey: { toBase58(): string } } };
      };
      const keyBytes = base58OrHexToUint8Array(secretKey);
      const kp = Keypair.fromSecretKey(keyBytes);
      console.debug('[axon:koii] Connected with public key:', kp.publicKey.toBase58());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
        // @_koii/web3.js not installed — warn but continue
        console.warn(
          '[axon:koii] @_koii/web3.js not installed. ' +
            'Install it for full key validation: npm install @_koii/web3.js'
        );
      }
      // Key format errors are acceptable here — will fail on first send()
    }

    this.taskId = taskId ?? process.env['KOII_TASK_ID'] ?? '';
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.messageHandlers = [];
  }

  async send(nodeEndpoint: string, payload: unknown): Promise<void> {
    if (!this.connected) {
      throw new AxonError('koii','Not connected. Call connect() first.');
    }

    // Validate endpoint before any network access — prevents SSRF via
    // attacker-controlled processorId pointing at internal infrastructure.
    assertSafeKoiiEndpoint(nodeEndpoint);

    const payloadStr =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    // POST the payload to the task node's input endpoint
    const inputUrl = buildTaskUrl(nodeEndpoint, this.taskId, 'input');
    let submitResponse: Response;
    try {
      submitResponse = await fetch(inputUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new AxonError(
        'koii',
        `Failed to reach Koii task node at ${nodeEndpoint}: ${(err as Error).message}`
      );
    }

    if (!submitResponse.ok) {
      throw new AxonError(
        'koii',
        `Task node returned ${submitResponse.status}: ${await submitResponse.text()}`
      );
    }

    // Poll for the result (up to 30s, 2s interval)
    const resultUrl = buildTaskUrl(nodeEndpoint, this.taskId, 'result');
    const result = await pollForResult(resultUrl, 30_000, 2_000);

    if (result !== null) {
      const MAX_RESULT_BYTES = 1 * 1024 * 1024; // 1 MiB
      if (result.length > MAX_RESULT_BYTES) {
        throw new AxonError(
          'koii',
          `Task node response exceeded ${MAX_RESULT_BYTES} bytes (got ${result.length} bytes).`
        );
      }
      const msg: Message = {
        from: nodeEndpoint,
        payload: safeParseJson(result),
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

  get isConnected(): boolean {
    return this.connected;
  }

  get koiiRpcUrl(): string {
    return this.rpcUrl;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTaskUrl(nodeEndpoint: string, taskId: string, path: 'input' | 'result'): string {
  const base = nodeEndpoint.replace(/\/$/, '');
  return taskId
    ? `${base}/task/${taskId}/${path}`
    : `${base}/${path}`;
}

async function pollForResult(
  url: string,
  timeoutMs: number,
  intervalMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim() !== '' && text !== 'null') return text;
      }
    } catch {
      // Not ready yet — keep polling
    }
    await sleep(intervalMs);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Koii/Solana keys are either:
//  - 32 bytes (seed only, used with Keypair.fromSeed)
//  - 64 bytes (seed + public key, used with Keypair.fromSecretKey)
// Any other length is rejected hard — no silent padding or truncation.
const VALID_KEY_LENGTHS = new Set([32, 64]);

function base58OrHexToUint8Array(input: string): Uint8Array {
  // If it looks like hex (0x prefix or all-hex even-length string)
  const hex = input.replace(/^0x/, '');
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    const byteLen = hex.length / 2;
    if (!VALID_KEY_LENGTHS.has(byteLen)) {
      throw new AxonError(
        'koii',
        `Hex key must decode to exactly 32 or 64 bytes. Got ${byteLen} bytes.\n` +
          'Run: axon auth koii  to generate a valid key.'
      );
    }
    const bytes = new Uint8Array(byteLen);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }
  // Try base58 (Solana-compatible)
  return base58Decode(input);
}

// Minimal base58 decoder (Bitcoin/Solana alphabet)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(input: string): Uint8Array {
  let n = BigInt(0);
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new AxonError('koii', `Invalid base58 character in key: '${char}'`);
    n = n * BigInt(58) + BigInt(idx);
  }
  const hex = n.toString(16);
  // Reject if the decoded value represents fewer than 32 bytes of real entropy.
  // padStart(64) would silently produce zero-prefixed weak keys — we throw instead.
  if (hex.length < 64) {
    throw new AxonError(
      'koii',
      `Base58 key decodes to only ${Math.ceil(hex.length / 2)} bytes — expected 32 or 64.\n` +
        'The key may be truncated or invalid. Run: axon auth koii  to generate a new key.'
    );
  }
  const byteLen = Math.ceil(hex.length / 2);
  if (!VALID_KEY_LENGTHS.has(byteLen)) {
    throw new AxonError(
      'koii',
      `Decoded key is ${byteLen} bytes — expected exactly 32 or 64 bytes.`
    );
  }
  const paddedHex = hex.padStart(byteLen * 2, '0');
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes[i / 2] = parseInt(paddedHex.slice(i, i + 2), 16);
  }
  return bytes;
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
        throw new AxonError(
          'koii',
          `Rejected remote payload: contains prototype-polluting key "${key}".`
        );
      }
    }
  }
  return parsed;
}
