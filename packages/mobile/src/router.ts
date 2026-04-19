/**
 * Copyright (c) 2024–present AxonSDK. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * MobileAxonRouter — multi-provider routing for React Native (iOS & Android).
 *
 * Routes send() calls across multiple provider endpoints using the same strategy
 * engine as the server SDK: cost, latency, availability, or balanced scoring with
 * per-provider circuit breakers and health tracking.
 *
 * Deploy your processors with the Axon CLI, then pass the endpoint URLs to this
 * router in your mobile app so it automatically picks the best provider on each call.
 *
 * Example:
 *   const router = new MobileAxonRouter({
 *     routes: [
 *       { provider: 'akash',   endpoint: 'https://lease.akash.example.com', secretKey: '...' },
 *       { provider: 'acurast', endpoint: 'wss://proxy.acurast.com',          secretKey: '...' },
 *     ],
 *     strategy: 'latency',
 *   });
 *   await router.connect();
 *   await router.send({ prompt: 'Hello from my phone' });
 */

import { MobileAxonClient } from './client.js';
import type { MobileProviderName } from './client.js';
export type { MobileProviderName };
import type { Message } from '@axonsdk/sdk';
import { AxonError } from '@axonsdk/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MobileRoutingStrategy = 'cost' | 'latency' | 'availability' | 'round-robin' | 'balanced';

export interface MobileRouteConfig {
  provider: MobileProviderName;
  /** WebSocket URL (Acurast) or HTTPS endpoint (Akash / HTTP). */
  endpoint: string;
  secretKey: string;
  wsUrl?: string;
}

export interface MobileRouterConfig {
  routes: MobileRouteConfig[];
  strategy?: MobileRoutingStrategy;
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface MobileRouteHealth {
  provider: MobileProviderName;
  endpoint: string;
  circuitOpen: boolean;
  latencyMs: number;
  successRate: number;
}

// ─── Internal state per route ─────────────────────────────────────────────────

interface RouteEntry {
  config: MobileRouteConfig;
  client: MobileAxonClient;
  failures: number;
  circuitOpen: boolean;
  lastOpenedAt: number;
  emaLatency: number;
  successCount: number;
  totalCount: number;
  rrIndex: number;
}

const EMA_α = 0.2;
const OPTIMISTIC_LATENCY = 500;

// ─── Router ───────────────────────────────────────────────────────────────────

export class MobileAxonRouter {
  private routes: RouteEntry[] = [];
  private rrIndex = 0;
  private readonly strategy: MobileRoutingStrategy;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: MobileRouterConfig) {
    const {
      routes,
      strategy = 'balanced',
      failureThreshold = 3,
      recoveryTimeoutMs = 30_000,
      maxRetries = 2,
      retryDelayMs = 200,
    } = config;

    if (routes.length === 0) throw new AxonError('mobile', 'MobileAxonRouter requires at least one route.');

    this.strategy = strategy;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;

    for (const r of routes) {
      this.routes.push({
        config: r,
        client: new MobileAxonClient({
          provider: r.provider,
          secretKey: r.secretKey,
          wsUrl: r.wsUrl,
        }),
        failures: 0,
        circuitOpen: false,
        lastOpenedAt: 0,
        emaLatency: OPTIMISTIC_LATENCY,
        successCount: 0,
        totalCount: 0,
        rrIndex: 0,
      });
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const results = await Promise.allSettled(
      this.routes.map(r => r.client.connect())
    );
    const anyOk = results.some(r => r.status === 'fulfilled');
    if (!anyOk) throw new AxonError('mobile', 'All routes failed to connect.');
  }

  disconnect(): void {
    for (const r of this.routes) r.client.disconnect();
  }

  dispose(): void {
    for (const r of this.routes) r.client.dispose();
  }

  /** Attach AppState listeners on all connected clients. */
  attachAppStateListeners(): void {
    for (const r of this.routes) r.client.attachAppStateListener();
  }

  // ─── Send ────────────────────────────────────────────────────────────────────

  async send(payload: unknown, preferProvider?: MobileProviderName): Promise<void> {
    const ordered = this._rank(preferProvider);
    if (ordered.length === 0) throw new AxonError('mobile', 'No callable routes available.');

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const entry = ordered[attempt % ordered.length];
      if (!this._isCallable(entry)) continue;

      const t0 = Date.now();
      try {
        await entry.client.send(entry.config.endpoint, payload);
        const ms = Date.now() - t0;
        this._recordSuccess(entry, ms);
        return;
      } catch (err) {
        const ms = Date.now() - t0;
        this._recordFailure(entry, ms);
        lastErr = err;
        if (attempt < this.maxRetries && this.retryDelayMs > 0) {
          await new Promise(r => setTimeout(r, this.retryDelayMs));
        }
      }
    }

    throw lastErr ?? new AxonError('mobile', 'send failed after retries');
  }

  // ─── Message subscription ────────────────────────────────────────────────────

  onMessage(handler: (msg: Message) => void): () => void {
    const unsubs = this.routes.map(r => r.client.onMessage(handler));
    return () => unsubs.forEach(u => u());
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  health(): MobileRouteHealth[] {
    return this.routes.map(r => ({
      provider: r.config.provider,
      endpoint: r.config.endpoint,
      circuitOpen: this._circuitOpen(r),
      latencyMs: r.emaLatency,
      successRate: r.totalCount === 0 ? 1 : r.successCount / r.totalCount,
    }));
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _circuitOpen(r: RouteEntry): boolean {
    if (!r.circuitOpen) return false;
    if (Date.now() - r.lastOpenedAt >= this.recoveryTimeoutMs) {
      r.circuitOpen = false;
      r.failures = 0;
    }
    return r.circuitOpen;
  }

  private _isCallable(r: RouteEntry): boolean {
    return !this._circuitOpen(r);
  }

  private _recordSuccess(r: RouteEntry, ms: number): void {
    r.emaLatency = EMA_α * ms + (1 - EMA_α) * r.emaLatency;
    r.successCount++;
    r.totalCount++;
    if (!r.circuitOpen) r.failures = Math.max(0, r.failures - 1);
    r.circuitOpen = false;
  }

  private _recordFailure(r: RouteEntry, ms: number): void {
    r.emaLatency = EMA_α * ms + (1 - EMA_α) * r.emaLatency;
    r.totalCount++;
    r.failures++;
    if (r.failures >= this.failureThreshold) {
      r.circuitOpen = true;
      r.lastOpenedAt = Date.now();
    }
  }

  private _score(r: RouteEntry): number {
    if (this._circuitOpen(r)) return 0;
    const successRate = r.totalCount === 0 ? 1 : r.successCount / r.totalCount;
    const latencyScore = Math.max(0, 1 - r.emaLatency / 10_000);
    switch (this.strategy) {
      case 'availability': return 0.80 * successRate + 0.20 * latencyScore;
      case 'latency':      return 0.15 * successRate + 0.85 * latencyScore;
      case 'cost':         return successRate;
      default:             return 0.50 * successRate + 0.50 * latencyScore;
    }
  }

  private _rank(prefer?: MobileProviderName): RouteEntry[] {
    if (this.strategy === 'round-robin') {
      const start = this.rrIndex;
      this.rrIndex = (this.rrIndex + 1) % this.routes.length;
      const result: RouteEntry[] = [];
      for (let i = 0; i < this.routes.length; i++) {
        result.push(this.routes[(start + i) % this.routes.length]);
      }
      return result;
    }

    const sorted = [...this.routes].sort((a, b) => this._score(b) - this._score(a));

    if (prefer) {
      const preferred = sorted.filter(r => r.config.provider === prefer);
      const rest = sorted.filter(r => r.config.provider !== prefer);
      return [...preferred, ...rest];
    }

    return sorted;
  }
}
