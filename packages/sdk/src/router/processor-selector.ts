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

export type ProcessorStrategy = 'round-robin' | 'fastest' | 'random' | 'first';

export class ProcessorSelector {
  private rrIndex = 0;
  private latencies: Map<string, number> = new Map();

  next(processorIds: string[], strategy: ProcessorStrategy): string {
    if (processorIds.length === 0) throw new Error('No processorIds available');
    if (processorIds.length === 1) return processorIds[0];

    switch (strategy) {
      case 'first':
        return processorIds[0];

      case 'round-robin': {
        const id = processorIds[this.rrIndex % processorIds.length];
        this.rrIndex = (this.rrIndex + 1) % processorIds.length;
        return id;
      }

      case 'fastest': {
        let best = processorIds[0];
        let bestLatency = this.latencies.get(best) ?? OPTIMISTIC_INITIAL_LATENCY;
        for (let i = 1; i < processorIds.length; i++) {
          const lat = this.latencies.get(processorIds[i]) ?? OPTIMISTIC_INITIAL_LATENCY;
          if (lat < bestLatency) {
            bestLatency = lat;
            best = processorIds[i];
          }
        }
        return best;
      }

      case 'random':
        return processorIds[Math.floor(Math.random() * processorIds.length)];

      default:
        return processorIds[0];
    }
  }

  recordLatency(processorId: string, latencyMs: number): void {
    const prev = this.latencies.get(processorId) ?? OPTIMISTIC_INITIAL_LATENCY;
    this.latencies.set(processorId, EMA_α * latencyMs + (1 - EMA_α) * prev);
  }

  reset(): void {
    this.rrIndex = 0;
    this.latencies.clear();
  }
}
