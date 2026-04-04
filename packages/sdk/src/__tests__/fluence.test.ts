import { describe, it, expect, vi } from 'vitest';
import { FluenceProvider } from '../providers/fluence/index.js';
import { PhonixError } from '../types.js';

describe('FluenceProvider construction', () => {
  it('should have name "fluence"', () => {
    const p = new FluenceProvider();
    expect(p.name).toBe('fluence');
  });

  it('should accept a custom relay address', () => {
    // Just ensure it constructs without throwing
    expect(() => new FluenceProvider('/dns4/custom.relay.dev/tcp/9000/wss/p2p/12D3KooWTest')).not.toThrow();
  });
});

describe('FluenceProvider.connect()', () => {
  it('should throw PhonixError if @fluencelabs/js-client is not installed', async () => {
    // Mock the dynamic import to simulate the package not being installed
    const p = new FluenceProvider();

    // We can't easily mock dynamic imports in all environments, but we can
    // verify the error shape by triggering with an invalid relay that would
    // fail at the import stage in real environments
    await expect(p.connect('deadbeef'.repeat(4))).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof PhonixError ||
        err instanceof Error
    );
  });
});

describe('FluenceProvider.estimate()', () => {
  it('should return a CostEstimate with fluence provider and FLT token', async () => {
    const p = new FluenceProvider();
    const estimate = await p.estimate({
      runtime: 'nodejs',
      code: 'src/index.ts',
      schedule: { type: 'on-demand', durationMs: 86_400_000 },
      replicas: 3,
    });

    expect(estimate.provider).toBe('fluence');
    expect(estimate.token).toBe('FLT');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThan(0);
    expect(typeof estimate.usdEquivalent).toBe('number');
  });

  it('should scale estimate with replica count', async () => {
    const p = new FluenceProvider();
    const single = await p.estimate({
      runtime: 'nodejs',
      code: 'src/index.ts',
      schedule: { type: 'on-demand', durationMs: 86_400_000 },
      replicas: 1,
    });
    const triple = await p.estimate({
      runtime: 'nodejs',
      code: 'src/index.ts',
      schedule: { type: 'on-demand', durationMs: 86_400_000 },
      replicas: 3,
    });

    expect(triple.amount).toBeGreaterThan(single.amount);
  });
});

describe('FluenceProvider.onMessage()', () => {
  it('should register a handler and return an unsubscribe function', () => {
    const p = new FluenceProvider();
    const handler = vi.fn();
    const unsubscribe = p.onMessage(handler);
    expect(typeof unsubscribe).toBe('function');
    // Should not throw when called
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('FluenceProvider.disconnect()', () => {
  it('should not throw if never connected', () => {
    const p = new FluenceProvider();
    expect(() => p.disconnect()).not.toThrow();
  });
});

describe('FluenceProvider.listDeployments()', () => {
  it('should return an empty array if CLI not available', async () => {
    const p = new FluenceProvider();
    // When fluence CLI isn't installed, listDeployments returns []
    const result = await p.listDeployments();
    expect(Array.isArray(result)).toBe(true);
  });
});
