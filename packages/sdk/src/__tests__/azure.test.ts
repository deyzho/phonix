import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureProvider } from '../providers/azure/index.js';
import { clearAzureTokenCache } from '../providers/azure/auth.js';

describe('AzureProvider', () => {
  beforeEach(() => {
    clearAzureTokenCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAzureTokenCache();
  });

  it('should have name "azure"', () => {
    const p = new AzureProvider();
    expect(p.name).toBe('azure');
  });

  it('listDeployments() should return an array', async () => {
    const p = new AzureProvider();
    await expect(p.listDeployments()).resolves.toBeInstanceOf(Array);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const p = new AzureProvider();
    const unsub = p.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('estimate() should return a CostEstimate with token USD', async () => {
    const p = new AzureProvider();
    const estimate = await p.estimate({
      runtime: 'nodejs',
      code: 'index.js',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('azure');
    expect(estimate.token).toBe('USD');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('disconnect() should not throw when not connected', () => {
    const p = new AzureProvider();
    expect(() => p.disconnect()).not.toThrow();
  });

  describe('deploy() — missing credentials', () => {
    beforeEach(() => {
      vi.stubEnv('AZURE_SUBSCRIPTION_ID', '');
      vi.stubEnv('AZURE_TENANT_ID', '');
      vi.stubEnv('AZURE_CLIENT_ID', '');
      vi.stubEnv('AZURE_CLIENT_SECRET', '');
      vi.stubEnv('AZURE_BEARER_TOKEN', '');
    });

    it('should throw when AZURE_SUBSCRIPTION_ID is missing', async () => {
      const p = new AzureProvider();
      await expect(
        p.deploy({ runtime: 'docker', code: 'my-image:latest', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });

    it('should throw when AZURE_CONTAINER_IMAGE is missing', async () => {
      vi.stubEnv('AZURE_SUBSCRIPTION_ID', 'sub-123');
      vi.stubEnv('AZURE_BEARER_TOKEN', 'fake-token');
      const p = new AzureProvider();
      await expect(
        p.deploy({ runtime: 'docker', code: 'index.js', schedule: { type: 'on-demand' } })
      ).rejects.toThrow();
    });
  });
});
