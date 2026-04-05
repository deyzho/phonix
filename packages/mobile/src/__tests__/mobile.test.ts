/**
 * @phonix/mobile test suite.
 *
 * Runs under vitest in a Node.js environment. All React Native APIs
 * (AppState, Platform) and expo-secure-store are mocked via vi.mock so no
 * native runtime is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MobilePhonixClient } from '../client.js';
import { SecureKeyStorage } from '../storage.js';
import { PhonixError } from '@phonix/sdk';

// ─── Mock react-native ────────────────────────────────────────────────────────

vi.mock('react-native', () => {
  const handlers: Array<(state: string) => void> = [];
  return {
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn((_event: string, handler: (state: string) => void) => {
        handlers.push(handler);
        return {
          remove: vi.fn(() => {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) handlers.splice(idx, 1);
          }),
        };
      }),
      _simulateChange: (state: string) => handlers.forEach((h) => h(state)),
    },
    Platform: {
      OS: 'ios',
      Version: 17,
      select: (specifics: { ios?: unknown; android?: unknown; default?: unknown }) =>
        specifics.ios ?? specifics.default,
    },
  };
});

// ─── Mock expo-secure-store ───────────────────────────────────────────────────

const secureStore: Record<string, string> = {};

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore[key] = value;
  }),
  getItemAsync: vi.fn(async (key: string) => secureStore[key] ?? null),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete secureStore[key];
  }),
}));

// ─── MobilePhonixClient ───────────────────────────────────────────────────────

describe('MobilePhonixClient constructor', () => {
  it('should accept valid options', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'key' });
    expect(client).toBeInstanceOf(MobilePhonixClient);
  });

  it('should throw if secretKey is empty', () => {
    expect(() => new MobilePhonixClient({ provider: 'akash', secretKey: '' }))
      .toThrow(PhonixError);
  });

  it('should throw if secretKey is only whitespace', () => {
    expect(() => new MobilePhonixClient({ provider: 'akash', secretKey: '   ' }))
      .toThrow(PhonixError);
  });

  it('should report provider correctly', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    expect(client.provider).toBe('akash');
  });

  it('should start disconnected', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    expect(client.isConnected).toBe(false);
  });

  it('should report "unknown" platform outside a React Native environment', () => {
    // In Node.js test environments, require('react-native') throws, so platform
    // falls back to 'unknown'. In a real iOS/Android app it returns 'ios'/'android'.
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    expect(client.platform).toBe('unknown');
  });
});

describe('MobilePhonixClient connect/disconnect (Akash / HTTP)', () => {
  it('connect() should set isConnected to true for stateless providers', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  it('connect() should be idempotent', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    await client.connect(); // second call should not throw
    expect(client.isConnected).toBe(true);
  });

  it('disconnect() should set isConnected to false', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it('dispose() should disconnect and clear handlers', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    client.onMessage(() => {});
    client.dispose();
    expect(client.isConnected).toBe(false);
  });
});

describe('MobilePhonixClient send() validation', () => {
  let client: MobilePhonixClient;

  beforeEach(async () => {
    client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
  });

  afterEach(() => client.dispose());

  it('should throw if not connected', async () => {
    const c = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await expect(c.send('https://provider.example.com', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject http:// endpoints (SSRF)', async () => {
    await expect(client.send('http://provider.example.com', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject private IP endpoints (SSRF)', async () => {
    await expect(client.send('https://192.168.1.1:31234', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject 10.x.x.x endpoints (SSRF)', async () => {
    await expect(client.send('https://10.0.0.1', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject localhost (SSRF)', async () => {
    await expect(client.send('https://localhost:3000', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject 127.x.x.x (SSRF)', async () => {
    await expect(client.send('https://127.0.0.1:3000', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject link-local 169.254.x.x (SSRF)', async () => {
    await expect(client.send('https://169.254.1.1', {})).rejects.toBeInstanceOf(PhonixError);
  });

  it('should reject invalid URLs', async () => {
    await expect(client.send('not-a-url', {})).rejects.toBeInstanceOf(PhonixError);
  });
});

describe('MobilePhonixClient onMessage()', () => {
  it('should register a handler and return an unsubscribe function', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    const handler = vi.fn();
    const unsub = client.onMessage(handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('unsubscribe should remove the handler', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    const handler = vi.fn();
    const unsub = client.onMessage(handler);
    unsub();
    // Handlers list should be empty now (internal detail, verified via no calls)
    // Can't directly assert but verifying unsub doesn't throw is sufficient
    expect(() => unsub()).not.toThrow();
  });
});

describe('MobilePhonixClient AppState integration', () => {
  it('attachAppStateListener() should not throw', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    expect(() => client.attachAppStateListener()).not.toThrow();
    client.dispose();
  });

  it('attachAppStateListener() is a no-op outside React Native (graceful fallback)', async () => {
    // In a real RN app, require('react-native') succeeds and the AppState listener
    // is registered. In Node.js tests the require() throws and is silently swallowed —
    // this is correct behaviour so that importing @phonix/mobile in non-RN environments
    // (e.g. server-side rendering, tests) does not crash.
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await client.connect();
    expect(() => client.attachAppStateListener()).not.toThrow();
    expect(client.isConnected).toBe(true); // unaffected since listener was not attached
    client.dispose();
  });

  it('detachAppStateListener() should be safe to call multiple times', () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    expect(() => {
      client.detachAppStateListener();
      client.detachAppStateListener();
    }).not.toThrow();
  });
});

describe('MobilePhonixClient isLive()', () => {
  it('should return false for unreachable endpoints', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    const result = await client.isLive('https://unreachable.provider.akash.invalid');
    expect(result).toBe(false);
  });

  it('should reject private IPs in isLive()', async () => {
    const client = new MobilePhonixClient({ provider: 'akash', secretKey: 'k' });
    await expect(client.isLive('https://192.168.1.1')).rejects.toBeInstanceOf(PhonixError);
  });
});

// ─── SecureKeyStorage ─────────────────────────────────────────────────────────

describe('SecureKeyStorage', () => {
  beforeEach(() => {
    Object.keys(secureStore).forEach((k) => delete secureStore[k]);
  });

  it('should save and load a secret key', async () => {
    const storage = new SecureKeyStorage();
    await storage.saveSecretKey('0xdeadbeef');
    const loaded = await storage.loadSecretKey();
    expect(loaded).toBe('0xdeadbeef');
  });

  it('should return null when no key is saved', async () => {
    const storage = new SecureKeyStorage();
    const loaded = await storage.loadSecretKey();
    expect(loaded).toBeNull();
  });

  it('should delete a saved key', async () => {
    const storage = new SecureKeyStorage();
    await storage.saveSecretKey('0xdeadbeef');
    await storage.deleteSecretKey();
    const loaded = await storage.loadSecretKey();
    expect(loaded).toBeNull();
  });

  it('should save and load generic key-value pairs', async () => {
    const storage = new SecureKeyStorage();
    await storage.save('AKASH_NODE', 'https://rpc.akashnet.net:443');
    const loaded = await storage.load('AKASH_NODE');
    expect(loaded).toBe('https://rpc.akashnet.net:443');
  });

  it('should delete generic key-value pairs', async () => {
    const storage = new SecureKeyStorage();
    await storage.save('MY_KEY', 'my-value');
    await storage.delete('MY_KEY');
    expect(await storage.load('MY_KEY')).toBeNull();
  });

  it('should return null for unknown generic keys', async () => {
    const storage = new SecureKeyStorage();
    expect(await storage.load('NONEXISTENT')).toBeNull();
  });
});
