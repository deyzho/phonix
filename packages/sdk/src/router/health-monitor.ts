/**
 * Copyright (c) 2024–present Phonix. All rights reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 *
 * This file contains trade secret algorithms that form the core of the Phonix
 * routing engine. Unauthorized copying, distribution, modification, reverse
 * engineering, or disclosure — in whole or in part — is strictly prohibited
 * without prior written consent from Phonix.
 *
 * For licensing enquiries contact: legal@phonix.dev
 */

const EMA_α = 0.2;
const OPTIMISTIC_INITIAL_LATENCY = 500;
const OPTIMISTIC_INITIAL_COST = 0;

interface Sample {
  ts: number;
  ok: boolean;
  latencyMs: number;
}

export class ProviderHealthMonitor {
  private samples: Sample[] = [];
  private emaLatency = OPTIMISTIC_INITIAL_LATENCY;
  private emaCostUsd = OPTIMISTIC_INITIAL_COST;
  private readonly windowMs: number;

  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }

  record(ok: boolean, latencyMs: number): void {
    this.samples.push({ ts: Date.now(), ok, latencyMs });
    this._evict();
    this.emaLatency = EMA_α * latencyMs + (1 - EMA_α) * this.emaLatency;
  }

  recordCost(usd: number): void {
    this.emaCostUsd = EMA_α * usd + (1 - EMA_α) * this.emaCostUsd;
  }

  private _evict(): void {
    const cutoff = Date.now() - this.windowMs;
    let i = 0;
    while (i < this.samples.length && this.samples[i].ts < cutoff) i++;
    if (i > 0) this.samples = this.samples.slice(i);
  }

  get successRate(): number {
    this._evict();
    if (this.samples.length === 0) return 1;
    let ok = 0;
    for (const s of this.samples) if (s.ok) ok++;
    return ok / this.samples.length;
  }

  get latency(): number {
    return this.emaLatency;
  }

  get costUsd(): number {
    return this.emaCostUsd;
  }

  get total(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
    this.emaLatency = OPTIMISTIC_INITIAL_LATENCY;
    this.emaCostUsd = OPTIMISTIC_INITIAL_COST;
  }
}
