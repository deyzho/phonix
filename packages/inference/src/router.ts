/**
 * PhonixInferenceRouter — selects the best provider for each inference request.
 *
 * Scoring priority (cost strategy):
 *  1. io.net  — GPU, cheapest for large models (~$0.40/hr A100 spot)
 *  2. Akash   — Container, flexible, moderate cost
 *  3. Acurast — TEE smartphone, private, lowest cost for small models
 */

import type { PhonixInferenceConfig } from './types.js';

export type InferenceProvider = 'ionet' | 'akash' | 'acurast';

interface ProviderRoute {
  provider: InferenceProvider;
  endpoint: string;
  available: boolean;
  emaLatency: number;
}

const EMA_α = 0.2;

export class PhonixInferenceRouter {
  private routes: ProviderRoute[] = [];
  private readonly strategy: string;

  constructor(config: PhonixInferenceConfig) {
    this.strategy = config.strategy ?? 'cost';

    if (config.ionetEndpoint) {
      this.routes.push({ provider: 'ionet', endpoint: config.ionetEndpoint, available: true, emaLatency: 300 });
    }
    if (config.akashEndpoint) {
      this.routes.push({ provider: 'akash', endpoint: config.akashEndpoint, available: true, emaLatency: 400 });
    }
    if (config.acurastWsUrl) {
      this.routes.push({ provider: 'acurast', endpoint: config.acurastWsUrl, available: true, emaLatency: 500 });
    }
  }

  pickEndpoint(preferredProvider?: InferenceProvider): ProviderRoute {
    const available = this.routes.filter(r => r.available);
    if (available.length === 0) throw new Error('No inference providers configured.');

    if (preferredProvider) {
      const preferred = available.find(r => r.provider === preferredProvider);
      if (preferred) return preferred;
    }

    if (this.strategy === 'latency') {
      return available.sort((a, b) => a.emaLatency - b.emaLatency)[0];
    }

    // cost / balanced / default: prefer ionet > akash > acurast
    const priority: InferenceProvider[] = ['ionet', 'akash', 'acurast'];
    for (const p of priority) {
      const r = available.find(r => r.provider === p);
      if (r) return r;
    }
    return available[0];
  }

  recordLatency(provider: InferenceProvider, ms: number): void {
    const route = this.routes.find(r => r.provider === provider);
    if (route) route.emaLatency = EMA_α * ms + (1 - EMA_α) * route.emaLatency;
  }

  markUnavailable(provider: InferenceProvider): void {
    const route = this.routes.find(r => r.provider === provider);
    if (route) route.available = false;
    // Auto-recover after 30s
    setTimeout(() => { if (route) route.available = true; }, 30_000);
  }

  get configured(): InferenceProvider[] {
    return this.routes.map(r => r.provider);
  }
}
