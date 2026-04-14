import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GcpProvider } from '../providers/gcp/index.js';
import { clearGcpTokenCache } from '../providers/gcp/auth.js';

describe('GcpProvider', () => {
  beforeEach(() => {
    clearGcpTokenCache();
  });

  it('should have name "gcp"', () => {
    const p = new GcpProvider();
    expect(p.name).toBe('gcp');
  });

  it('listDeployments() should return an array', async () => {
    const p = new GcpProvider();
    await expect(p.listDeployments()).resolves.toBeInstanceOf(Array);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const p = new GcpProvider();
    const unsub = p.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('estimate() should return a CostEstimate with token USD', async () => {
    const p = new GcpProvider();
    const estimate = await p.estimate({
      runtime: 'nodejs',
      code: 'index.js',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('gcp');
    expect(estimate.token).toBe('USD');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('disconnect() should not throw when not connected', () => {
    const p = new GcpProvider();
    expect(() => p.disconnect()).not.toThrow();
  });

  describe('deploy() — missing credentials', () => {
    beforeEach(() => {
      vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '');
      vi.stubEnv('GCP_PROJECT_ID', '');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      clearGcpTokenCache();
    });

    it('should throw when GOOGLE_APPLICATION_CREDENTIALS is missing', async () => {
      const p = new GcpProvider();
      await expect(
        p.deploy({ runtime: 'nodejs', code: 'index.js', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });

    it('should throw when GCP_PROJECT_ID is missing', async () => {
      vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/fake.json');
      const p = new GcpProvider();
      await expect(
        p.deploy({ runtime: 'nodejs', code: 'index.js', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });
  });
});
