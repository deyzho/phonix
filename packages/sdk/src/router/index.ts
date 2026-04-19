/**
 * Copyright (c) 2024–present AxonSDK. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { IAxonProvider } from '../providers/base.js';
import type { DeploymentConfig, Message, ProviderName } from '../types.js';
import { AxonError } from '../types.js';
import { AcurastProvider } from '../providers/acurast/index.js';
import { FluenceProvider } from '../providers/fluence/index.js';
import { KoiiProvider } from '../providers/koii/index.js';
import { AkashProvider } from '../providers/akash/index.js';
import { IoNetProvider } from '../providers/ionet/index.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ProviderHealthMonitor } from './health-monitor.js';
import { ProcessorSelector } from './processor-selector.js';
import { score } from './strategy.js';
import type {
  RouterConfig,
  RouterDeployment,
  RouterSendOptions,
  ProviderHealthSnapshot,
  RouterEvent,
  RouterEventHandler,
} from './types.js';

interface ProviderEntry {
  provider: IAxonProvider;
  circuit: CircuitBreaker;
  health: ProviderHealthMonitor;
  selector: ProcessorSelector;
  processorIds: string[];
}

function createProvider(name: ProviderName, wsUrl?: string): IAxonProvider {
  switch (name) {
    case 'acurast': return new AcurastProvider(wsUrl);
    case 'fluence': return new FluenceProvider();
    case 'koii':    return new KoiiProvider();
    case 'akash':   return new AkashProvider();
    case 'ionet':   return new IoNetProvider();
    default: throw new AxonError(`Unknown provider: ${String(name)}`);
  }
}

export class AxonRouter {
  private entries: Map<ProviderName, ProviderEntry> = new Map();
  private rrOrder: ProviderName[] = [];
  private rrProviderIndex = 0;
  private readonly cfg: Required<Omit<RouterConfig, 'wsUrls'>> & { wsUrls: RouterConfig['wsUrls'] };
  private eventHandlers: RouterEventHandler[] = [];

  constructor(config: RouterConfig) {
    const {
      providers,
      secretKey,
      strategy = 'balanced',
      processorStrategy = 'round-robin',
      failureThreshold = 3,
      recoveryTimeoutMs = 30_000,
      healthWindowMs = 60_000,
      maxRetries = 2,
      retryDelayMs = 200,
      wsUrls,
    } = config;

    this.cfg = { providers, secretKey, strategy, processorStrategy, failureThreshold, recoveryTimeoutMs, healthWindowMs, maxRetries, retryDelayMs, wsUrls };

    for (const name of providers) {
      const wsUrl = wsUrls?.[name];
      this.entries.set(name, {
        provider: createProvider(name, wsUrl),
        circuit: new CircuitBreaker(failureThreshold, recoveryTimeoutMs),
        health: new ProviderHealthMonitor(healthWindowMs),
        selector: new ProcessorSelector(),
        processorIds: [],
      });
    }
    this.rrOrder = [...providers];
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.entries.values()].map(e => e.provider.connect(this.cfg.secretKey))
    );
    let anyOk = false;
    for (const r of results) {
      if (r.status === 'fulfilled') anyOk = true;
    }
    if (!anyOk) throw new AxonError('All providers failed to connect');
  }

  disconnect(): void {
    for (const e of this.entries.values()) e.provider.disconnect();
  }

  // ─── Deploy ─────────────────────────────────────────────────────────────────

  async deploy(config: DeploymentConfig): Promise<RouterDeployment> {
    const results = await Promise.allSettled(
      [...this.entries.entries()].map(async ([name, e]) => {
        const deployment = await e.provider.deploy(config);
        e.processorIds = deployment.processorIds;
        return { provider: name, deployment };
      })
    );

    const providers: RouterDeployment['providers'] = [];
    const failedProviders: ProviderName[] = [];
    let processorCount = 0;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        providers.push(r.value);
        processorCount += r.value.deployment.processorIds.length;
      } else {
        const name = this.cfg.providers[results.indexOf(r)];
        failedProviders.push(name);
      }
    }

    if (providers.length === 0) throw new AxonError('All providers failed to deploy');

    return { providers, processorCount, failedProviders };
  }

  // ─── Send with routing + failover ───────────────────────────────────────────

  async send(payload: unknown, options: RouterSendOptions = {}): Promise<void> {
    const ordered = this._rankProviders(options.preferProvider);
    if (ordered.length === 0) throw new AxonError('No callable providers available');

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      const name = ordered[attempt % ordered.length];
      const entry = this.entries.get(name)!;

      if (!entry.circuit.isCallable) {
        if (attempt > 0) this._emit({ type: 'failover', provider: name, timestamp: new Date() });
        continue;
      }

      const processorIds = options.preferProcessorId
        ? [options.preferProcessorId]
        : entry.processorIds.length > 0
          ? entry.processorIds
          : ['default'];

      const processorId = entry.selector.next(processorIds, this.cfg.processorStrategy);
      if (attempt === 0) this._emit({ type: 'provider:selected', provider: name, timestamp: new Date() });
      else this._emit({ type: 'retry', provider: name, detail: `attempt ${attempt}`, timestamp: new Date() });

      const t0 = Date.now();
      try {
        await entry.provider.send(processorId, payload);
        const ms = Date.now() - t0;
        entry.health.record(true, ms);
        entry.selector.recordLatency(processorId, ms);
        entry.circuit.recordSuccess();
        if (entry.circuit.state === 'closed') {
          this._emit({ type: 'provider:recovered', provider: name, timestamp: new Date() });
        }
        return;
      } catch (err) {
        const ms = Date.now() - t0;
        entry.health.record(false, ms);
        entry.circuit.recordFailure();
        if (entry.circuit.state === 'open') {
          this._emit({ type: 'circuit:opened', provider: name, timestamp: new Date() });
        }
        this._emit({ type: 'provider:failed', provider: name, detail: String(err), timestamp: new Date() });
        lastErr = err;

        if (attempt < this.cfg.maxRetries && this.cfg.retryDelayMs > 0) {
          await new Promise(r => setTimeout(r, this.cfg.retryDelayMs));
        }
      }
    }

    throw lastErr ?? new AxonError('send failed after retries');
  }

  // ─── Message subscription ───────────────────────────────────────────────────

  onMessage(handler: (msg: Message) => void): () => void {
    const unsubs = [...this.entries.values()].map(e => e.provider.onMessage(handler));
    return () => unsubs.forEach(u => u());
  }

  // ─── Health + observability ─────────────────────────────────────────────────

  health(): ProviderHealthSnapshot[] {
    return [...this.entries.entries()].map(([name, e]) => ({
      provider: name,
      circuitState: e.circuit.state,
      score: score(this.cfg.strategy, { health: e.health, circuit: e.circuit }),
      latencyMs: e.health.latency,
      successRate: e.health.successRate,
      totalRequests: e.health.total,
      estimatedCostUsd: e.health.costUsd,
    }));
  }

  onEvent(handler: RouterEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
    };
  }

  reset(): void {
    for (const e of this.entries.values()) {
      e.circuit.reset();
      e.health.reset();
      e.selector.reset();
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private _rankProviders(prefer?: ProviderName): ProviderName[] {
    const strategy = this.cfg.strategy;

    if (strategy === 'round-robin') {
      const start = this.rrProviderIndex;
      this.rrProviderIndex = (this.rrProviderIndex + 1) % this.rrOrder.length;
      const ordered: ProviderName[] = [];
      for (let i = 0; i < this.rrOrder.length; i++) {
        ordered.push(this.rrOrder[(start + i) % this.rrOrder.length]);
      }
      return ordered;
    }

    const scored = [...this.entries.entries()]
      .map(([name, e]) => ({
        name,
        s: score(strategy, { health: e.health, circuit: e.circuit }),
      }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.name);

    if (prefer && this.entries.has(prefer)) {
      const rest = scored.filter(n => n !== prefer);
      return [prefer, ...rest];
    }

    return scored;
  }

  private _emit(event: RouterEvent): void {
    for (const h of this.eventHandlers) h(event);
  }
}

export type { RouterConfig, RouterDeployment, RouterSendOptions, ProviderHealthSnapshot, RouterEvent, RouterEventHandler };
