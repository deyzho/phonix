import { describe, it, expect, vi } from 'vitest';
import { AkashProvider } from '../providers/akash/index.ts';
import { AkashMessagingClient } from '../providers/akash/client.ts';
import { generateAkashSdl } from '../providers/akash/deploy.ts';
import { AxonError } from '../types.ts';

// ─── AkashProvider ────────────────────────────────────────────────────────────

describe('AkashProvider', () => {
  it('should have name "akash"', () => {
    const provider = new AkashProvider();
    expect(provider.name).toBe('akash');
  });

  it('estimate() should return a CostEstimate with AKT token', async () => {
    const provider = new AkashProvider();
    const estimate = await provider.estimate({
      runtime: 'nodejs',
      code: 'src/index.ts',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('akash');
    expect(estimate.token).toBe('AKT');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThan(0);
    expect(typeof estimate.usdEquivalent).toBe('number');
    expect(estimate.usdEquivalent).toBeGreaterThan(0);
  });

  it('estimate() should scale linearly with replicas', async () => {
    const provider = new AkashProvider();
    const base = await provider.estimate({
      runtime: 'nodejs',
      code: '',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    const scaled = await provider.estimate({
      runtime: 'nodejs',
      code: '',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 3,
    });
    expect(scaled.amount).toBe(base.amount * 3);
  });

  it('listDeployments() should return an array when CLI is not installed', async () => {
    const provider = new AkashProvider();
    const deployments = await provider.listDeployments();
    expect(Array.isArray(deployments)).toBe(true);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const provider = new AkashProvider();
    const unsub = provider.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });
});

// ─── AkashMessagingClient ─────────────────────────────────────────────────────

describe('AkashMessagingClient', () => {
  it('should start disconnected', () => {
    const client = new AkashMessagingClient();
    expect(client.isConnected).toBe(false);
  });

  it('connect() should accept a non-empty secret key', async () => {
    const client = new AkashMessagingClient();
    await client.connect('my-secret-key');
    expect(client.isConnected).toBe(true);
  });

  it('connect() should reject an empty secret key', async () => {
    const client = new AkashMessagingClient();
    await expect(client.connect('')).rejects.toBeInstanceOf(AxonError);
  });

  it('connect() should reject a whitespace-only secret key', async () => {
    const client = new AkashMessagingClient();
    await expect(client.connect('   ')).rejects.toBeInstanceOf(AxonError);
  });

  it('disconnect() should set isConnected to false and clear handlers', async () => {
    const client = new AkashMessagingClient();
    await client.connect('key');
    client.onMessage(() => {});
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it('send() should throw if not connected', async () => {
    const client = new AkashMessagingClient();
    await expect(
      client.send('https://provider.example.com', { test: true })
    ).rejects.toBeInstanceOf(AxonError);
  });

  it('send() should reject non-https endpoints', async () => {
    const client = new AkashMessagingClient();
    await client.connect('key');
    await expect(
      client.send('http://provider.example.com', {})
    ).rejects.toBeInstanceOf(AxonError);
  });

  it('send() should reject private IP endpoints (SSRF protection)', async () => {
    const client = new AkashMessagingClient();
    await client.connect('key');
    await expect(
      client.send('https://192.168.1.1:31234', {})
    ).rejects.toBeInstanceOf(AxonError);
  });

  it('send() should reject localhost endpoints', async () => {
    const client = new AkashMessagingClient();
    await client.connect('key');
    await expect(
      client.send('https://localhost:3000', {})
    ).rejects.toBeInstanceOf(AxonError);
  });

  it('send() should reject 127.x.x.x endpoints', async () => {
    const client = new AkashMessagingClient();
    await client.connect('key');
    await expect(
      client.send('https://127.0.0.1:3000', {})
    ).rejects.toBeInstanceOf(AxonError);
  });

  it('onMessage() should register a handler and return an unsubscribe fn', async () => {
    const client = new AkashMessagingClient();
    const handler = vi.fn();
    const unsub = client.onMessage(handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('isLive() should return false when endpoint is unreachable', async () => {
    const client = new AkashMessagingClient();
    const result = await client.isLive('https://unreachable.provider.akash.invalid');
    expect(result).toBe(false);
  });
});

// ─── generateAkashSdl ─────────────────────────────────────────────────────────

describe('generateAkashSdl', () => {
  it('should include the bundle CID in the env block', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmTestCid123' });
    expect(sdl).toContain('BUNDLE_CID=QmTestCid123');
  });

  it('should use node:20-alpine image', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc' });
    expect(sdl).toContain('node:20-alpine');
  });

  it('should include wget download and node execution command', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc' });
    expect(sdl).toContain('wget');
    expect(sdl).toContain('node /app/bundle.js');
  });

  it('should include custom environment variables', () => {
    const sdl = generateAkashSdl({
      bundleCid: 'QmAbc',
      environment: { MY_VAR: 'hello', OTHER: 'world' },
    });
    expect(sdl).toContain('MY_VAR=hello');
    expect(sdl).toContain('OTHER=world');
  });

  it('should use provided replicas count', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc', replicas: 3 });
    expect(sdl).toContain('count: 3');
  });

  it('should use provided maxUaktPerBlock', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc', maxUaktPerBlock: 50_000 });
    expect(sdl).toContain('amount: 50000');
  });

  it('should sanitize project name to lowercase alphanumeric with hyphens', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc', projectName: 'My Cool App!!' });
    expect(sdl).toContain('my-cool-app');
    expect(sdl).not.toContain('My Cool App!!');
  });

  it('should default to axonsdk-app service name when projectName is empty', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc', projectName: '---' });
    expect(sdl).toContain('axonsdk-app');
  });

  it('should include the Akash auditor signedBy address', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc' });
    expect(sdl).toContain('akash1365yvmc4s7awdyj3n2sav7xfx76adc6dnmlx63');
  });

  it('should default to 1 replica when not specified', () => {
    const sdl = generateAkashSdl({ bundleCid: 'QmAbc' });
    expect(sdl).toContain('count: 1');
  });
});
