import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AwsProvider } from '../providers/aws/index.ts';

describe('AwsProvider', () => {
  it('should have name "aws"', () => {
    const p = new AwsProvider();
    expect(p.name).toBe('aws');
  });

  it('listDeployments() should return an array', async () => {
    const p = new AwsProvider();
    await expect(p.listDeployments()).resolves.toBeInstanceOf(Array);
  });

  it('onMessage() should return an unsubscribe function', () => {
    const p = new AwsProvider();
    const unsub = p.onMessage(() => {});
    expect(typeof unsub).toBe('function');
  });

  it('estimate() should return a CostEstimate with token USD', async () => {
    const p = new AwsProvider();
    const estimate = await p.estimate({
      runtime: 'nodejs',
      code: 'index.js',
      schedule: { type: 'on-demand', durationMs: 3_600_000 },
      replicas: 1,
    });
    expect(estimate.provider).toBe('aws');
    expect(estimate.token).toBe('USD');
    expect(typeof estimate.amount).toBe('number');
    expect(estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('disconnect() should not throw when not connected', () => {
    const p = new AwsProvider();
    expect(() => p.disconnect()).not.toThrow();
  });

  describe('connect()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should throw when secret key is empty', async () => {
      const p = new AwsProvider();
      // connect() validates its secretKey argument — empty string triggers the guard
      await expect(p.connect('')).rejects.toThrow();
    });
  });

  describe('deploy()', () => {
    it('should throw when AWS_LAMBDA_ROLE_ARN is missing', async () => {
      const p = new AwsProvider();
      const originalRole = process.env['AWS_LAMBDA_ROLE_ARN'];
      delete process.env['AWS_LAMBDA_ROLE_ARN'];
      try {
        await expect(
          p.deploy({ runtime: 'nodejs', code: 'index.js', schedule: { type: 'on-demand' } })
        ).rejects.toThrow();
      } finally {
        if (originalRole !== undefined) process.env['AWS_LAMBDA_ROLE_ARN'] = originalRole;
      }
    });
  });
});
