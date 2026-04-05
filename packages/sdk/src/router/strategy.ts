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

import type { RoutingStrategy } from './types.js';
import type { ProviderHealthMonitor } from './health-monitor.js';
import type { CircuitBreaker } from './circuit-breaker.js';

interface ScoringInput {
  health: ProviderHealthMonitor;
  circuit: CircuitBreaker;
}

const W: Record<RoutingStrategy, [number, number, number]> = {
  availability: [0.80, 0.15, 0.05],
  latency:      [0.10, 0.85, 0.05],
  cost:         [0.10, 0.05, 0.85],
  balanced:     [0.33, 0.34, 0.33],
  'round-robin':[0.33, 0.34, 0.33],
};

const MAX_LATENCY = 10_000;
const MAX_COST    = 1;

export function score(strategy: RoutingStrategy, input: ScoringInput): number {
  const { health, circuit } = input;
  if (!circuit.isCallable) return 0;

  const cm = circuit.state === 'half-open' ? 0.5 : 1.0;
  const [wa, wl, wc] = W[strategy] ?? W.balanced;

  const a = health.successRate;
  const l = Math.max(0, 1 - health.latency / MAX_LATENCY);
  const c = Math.max(0, 1 - health.costUsd / MAX_COST);

  return cm * (wa * a + wl * l + wc * c);
}
