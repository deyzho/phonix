import { describe, it, expect } from 'vitest';
import { generateRuntimeBootstrap } from '../runtime/index.ts';

describe('generateRuntimeBootstrap', () => {
  it('should return a string for each provider target', () => {
    for (const target of ['acurast', 'fluence', 'koii', 'mock'] as const) {
      const bootstrap = generateRuntimeBootstrap(target);
      expect(typeof bootstrap).toBe('string');
      expect(bootstrap.length).toBeGreaterThan(0);
    }
  });

  it('acurast bootstrap should assign globalThis.phonix', () => {
    const bootstrap = generateRuntimeBootstrap('acurast');
    expect(bootstrap).toContain('globalThis.phonix');
    expect(bootstrap).toContain('acurast');
  });

  it('acurast bootstrap should map http.GET to _STD_.http.GET', () => {
    const bootstrap = generateRuntimeBootstrap('acurast');
    expect(bootstrap).toContain('_STD_.http.GET');
    expect(bootstrap).toContain('_STD_.http.POST');
    expect(bootstrap).toContain('_STD_.ws.open');
    expect(bootstrap).toContain('_STD_.ws.send');
    expect(bootstrap).toContain('_STD_.fulfill');
  });

  it('fluence bootstrap should assign globalThis.phonix with fluence dispatch globals', () => {
    const bootstrap = generateRuntimeBootstrap('fluence');
    expect(bootstrap).toContain('globalThis.phonix');
    expect(bootstrap).toContain('__phonixDispatch');
    expect(bootstrap).toContain('__phonixResult');
  });

  it('koii bootstrap should assign globalThis.phonix with koii dispatch globals', () => {
    const bootstrap = generateRuntimeBootstrap('koii');
    expect(bootstrap).toContain('globalThis.phonix');
    expect(bootstrap).toContain('__phonixDispatch');
  });

  it('mock bootstrap should set both phonix and _STD_ globals', () => {
    const bootstrap = generateRuntimeBootstrap('mock');
    expect(bootstrap).toContain('globalThis.phonix');
    expect(bootstrap).toContain('globalThis._STD_');
  });

  it('mock bootstrap should be valid JavaScript that can be evaluated', () => {
    const bootstrap = generateRuntimeBootstrap('mock');
    // Wrap in a sandboxed function call to test basic syntax validity
    expect(() => new Function(bootstrap)).not.toThrow();
  });

  it('mock bootstrap should set up phonix.http.GET and phonix.http.POST', () => {
    const bootstrap = generateRuntimeBootstrap('mock');
    expect(bootstrap).toContain('http');
    expect(bootstrap).toContain('GET');
    expect(bootstrap).toContain('POST');
  });

  it('mock bootstrap should include SSRF protection', () => {
    const bootstrap = generateRuntimeBootstrap('mock');
    // Hostname-level block (catches static private hostnames before DNS resolution)
    expect(bootstrap).toContain('PRIVATE_HOST_RE');
    // IP-level block (defeats DNS rebinding — resolved IP checked after dns.lookup)
    expect(bootstrap).toContain('PRIVATE_IP_RE');
    expect(bootstrap).toContain('https:');
  });

  it('should throw for unknown runtime target', () => {
    expect(() => generateRuntimeBootstrap('unknown' as never)).toThrow(
      'Unknown runtime target'
    );
  });

  it('each provider bootstrap should contain http.GET, http.POST, ws.open, ws.send, ws.close', () => {
    for (const target of ['acurast', 'fluence', 'koii', 'mock'] as const) {
      const bootstrap = generateRuntimeBootstrap(target);
      expect(bootstrap).toContain('GET');
      expect(bootstrap).toContain('POST');
      expect(bootstrap).toContain('open');
      expect(bootstrap).toContain('send');
      expect(bootstrap).toContain('close');
    }
  });
});
