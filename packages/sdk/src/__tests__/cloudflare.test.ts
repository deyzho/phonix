import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareProvider } from '../providers/cloudflare/index.js';

describe('CloudflareProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should have name "cloudflare"', () => {
    const p = new CloudflareProvider();
    expect(p.name).toBe('cloudflare');
  });

  it('listDeployments() should return an array', async () => {
    const p = new CloudflareProvider();
    await expect(p.listDeployments()).resolves.toBeInstanceOf(Array);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const p = new CloudflareProvider();
    const unsub = p.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('estimate() should return a CostEstimate with token USD', async () => {
    const p = new CloudflareProvider();
    const estimate = await p.estimate({
      runtime: 'nodejs',
      code: 'worker.js',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('cloudflare');
    expect(estimate.token).toBe('USD');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('disconnect() should not throw when not connected', () => {
    const p = new CloudflareProvider();
    expect(() => p.disconnect()).not.toThrow();
  });

  describe('deploy() — missing credentials', () => {
    beforeEach(() => {
      vi.stubEnv('CF_API_TOKEN', '');
      vi.stubEnv('CF_ACCOUNT_ID', '');
    });

    it('should throw when CF_API_TOKEN is missing', async () => {
      const p = new CloudflareProvider();
      await expect(
        p.deploy({ runtime: 'nodejs', code: 'worker.js', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });

    it('should throw when CF_ACCOUNT_ID is missing', async () => {
      vi.stubEnv('CF_API_TOKEN', 'fake-token');
      const p = new CloudflareProvider();
      await expect(
        p.deploy({ runtime: 'nodejs', code: 'worker.js', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });
  });
});
