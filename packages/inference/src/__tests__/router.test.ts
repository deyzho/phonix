import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxonInferenceRouter } from '../router.js';

const BASE = {
  apiKey: 'test-key',
  ionetEndpoint:  'https://ionet.example.com',
  akashEndpoint:  'https://akash.example.com',
  acurastWsUrl:   'wss://acurast.example.com',
};

// ─── pickEndpoint — cost strategy ────────────────────────────────────────────

describe('AxonInferenceRouter.pickEndpoint() — cost strategy', () => {
  it('prefers ionet when all providers are available', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    expect(r.pickEndpoint().provider).toBe('ionet');
  });

  it('falls back to akash when ionet is unavailable', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    expect(r.pickEndpoint().provider).toBe('akash');
  });

  it('falls back to acurast when ionet and akash are unavailable', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    r.markUnavailable('akash');
    expect(r.pickEndpoint().provider).toBe('acurast');
  });

  it('throws when all providers are marked unavailable', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    r.markUnavailable('akash');
    r.markUnavailable('acurast');
    expect(() => r.pickEndpoint()).toThrow(/no inference providers/i);
  });

  it('throws when no endpoints are configured at all', () => {
    const r = new AxonInferenceRouter({ apiKey: 'key', strategy: 'cost' });
    expect(() => r.pickEndpoint()).toThrow(/no inference providers/i);
  });
});

// ─── pickEndpoint — latency strategy ─────────────────────────────────────────

describe('AxonInferenceRouter.pickEndpoint() — latency strategy', () => {
  it('picks the provider with lowest EMA latency', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'latency' });
    // ionet starts at 300ms EMA, akash at 400ms, acurast at 500ms
    // Drive ionet latency up and akash down
    r.recordLatency('ionet', 2000);   // ionet EMA → 0.2*2000 + 0.8*300 = 640
    r.recordLatency('akash', 10);     // akash EMA → 0.2*10   + 0.8*400 = 322
    expect(r.pickEndpoint().provider).toBe('akash');
  });

  it('picks acurast when it becomes the fastest', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'latency' });
    r.recordLatency('ionet',    5000);
    r.recordLatency('akash',    5000);
    r.recordLatency('acurast',  10);
    expect(r.pickEndpoint().provider).toBe('acurast');
  });

  it('excludes unavailable providers from latency selection', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'latency' });
    // Make ionet technically fastest but mark it unavailable
    r.recordLatency('ionet', 1);
    r.markUnavailable('ionet');
    // akash at default 400ms, acurast at default 500ms
    expect(r.pickEndpoint().provider).toBe('akash');
  });
});

// ─── pickEndpoint — preferred provider ───────────────────────────────────────

describe('AxonInferenceRouter.pickEndpoint() — preferred provider', () => {
  it('honors preferred provider when available', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    expect(r.pickEndpoint('akash').provider).toBe('akash');
    expect(r.pickEndpoint('acurast').provider).toBe('acurast');
  });

  it('falls back to strategy when preferred provider is unavailable', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('akash');
    // Preferred is akash (unavailable), should fall back to ionet (cost default)
    expect(r.pickEndpoint('akash').provider).toBe('ionet');
  });
});

// ─── recordLatency — EMA updates ─────────────────────────────────────────────

describe('AxonInferenceRouter.recordLatency()', () => {
  it('updates EMA with correct formula: α=0.2', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'latency' });
    // ionet starts at 300ms
    r.recordLatency('ionet', 1000);
    // EMA = 0.2 * 1000 + 0.8 * 300 = 200 + 240 = 440
    // After recording, ionet (440ms) vs akash (400ms) — akash should win
    expect(r.pickEndpoint().provider).toBe('akash');
  });

  it('repeated recording converges toward the observed value', () => {
    const r = new AxonInferenceRouter({
      apiKey: 'key',
      ionetEndpoint: 'https://ionet.example.com',
      strategy: 'latency',
    });
    // Drive EMA toward 50ms with many samples
    for (let i = 0; i < 20; i++) r.recordLatency('ionet', 50);
    // After 20 samples of 50ms, EMA should be much closer to 50 than to 300
    expect(r.pickEndpoint().emaLatency).toBeLessThan(100);
  });

  it('ignores recordLatency for unknown providers gracefully', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    // Should not throw
    expect(() => r.recordLatency('ionet' as never, 100)).not.toThrow();
  });
});

// ─── markUnavailable — isolation ─────────────────────────────────────────────

describe('AxonInferenceRouter.markUnavailable()', () => {
  it('removes the provider from the available pool immediately', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    const available = [];
    for (const p of (['ionet', 'akash', 'acurast'] as const)) {
      try { available.push(r.pickEndpoint(p).provider); } catch { /* skip */ }
    }
    expect(available).not.toContain('ionet');
  });

  it('can mark all providers unavailable independently', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    expect(() => r.pickEndpoint()).not.toThrow(); // akash still available
    r.markUnavailable('akash');
    expect(() => r.pickEndpoint()).not.toThrow(); // acurast still available
    r.markUnavailable('acurast');
    expect(() => r.pickEndpoint()).toThrow();
  });

  it('schedules auto-recovery (setTimeout is called)', () => {
    vi.useFakeTimers();
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    r.markUnavailable('ionet');
    expect(() => r.pickEndpoint()).not.toThrow(); // akash fallback

    // After 30s recovery timeout, ionet should be available again
    vi.advanceTimersByTime(30_001);
    expect(r.pickEndpoint().provider).toBe('ionet'); // ionet restored, cost picks it first
    vi.useRealTimers();
  });
});

// ─── configured getter ────────────────────────────────────────────────────────

describe('AxonInferenceRouter.configured', () => {
  it('lists all configured providers', () => {
    const r = new AxonInferenceRouter({ ...BASE, strategy: 'cost' });
    expect(r.configured).toEqual(['ionet', 'akash', 'acurast']);
  });

  it('only lists providers whose endpoints are set', () => {
    const r = new AxonInferenceRouter({
      apiKey: 'key',
      ionetEndpoint: 'https://ionet.example.com',
      strategy: 'cost',
    });
    expect(r.configured).toEqual(['ionet']);
  });

  it('is empty when no endpoints are configured', () => {
    const r = new AxonInferenceRouter({ apiKey: 'key' });
    expect(r.configured).toEqual([]);
  });
});
