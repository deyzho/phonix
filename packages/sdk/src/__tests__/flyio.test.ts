import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlyioProvider } from '../providers/flyio/index.js';

describe('FlyioProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should have name "flyio"', () => {
    const p = new FlyioProvider();
    expect(p.name).toBe('flyio');
  });

  it('listDeployments() should return an array', async () => {
    const p = new FlyioProvider();
    await expect(p.listDeployments()).resolves.toBeInstanceOf(Array);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const p = new FlyioProvider();
    const unsub = p.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('estimate() should return a CostEstimate with token USD', async () => {
    const p = new FlyioProvider();
    const estimate = await p.estimate({
      runtime: 'docker',
      code: 'my-image:latest',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('flyio');
    expect(estimate.token).toBe('USD');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('disconnect() should not throw when not connected', () => {
    const p = new FlyioProvider();
    expect(() => p.disconnect()).not.toThrow();
  });

  describe('deploy() — missing credentials', () => {
    beforeEach(() => {
      vi.stubEnv('FLY_API_TOKEN', '');
      vi.stubEnv('FLY_APP_NAME', '');
    });

    it('should throw when FLY_API_TOKEN is missing', async () => {
      const p = new FlyioProvider();
      await expect(
        p.deploy({ runtime: 'docker', code: 'my-image:latest', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });

    it('should throw when FLY_APP_NAME is missing', async () => {
      vi.stubEnv('FLY_API_TOKEN', 'fake-token');
      const p = new FlyioProvider();
      await expect(
        p.deploy({ runtime: 'docker', code: 'my-image:latest', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });
  });
});
