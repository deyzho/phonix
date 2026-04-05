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

import type { CircuitState } from './types.js';

const DECAY_ON_SUCCESS = 1;

export class CircuitBreaker {
  private _state: CircuitState = 'closed';
  private failures = 0;
  private lastOpenedAt = 0;
  private readonly threshold: number;
  private readonly recoveryTimeout: number;

  constructor(threshold = 3, recoveryTimeoutMs = 30_000) {
    this.threshold = threshold;
    this.recoveryTimeout = recoveryTimeoutMs;
  }

  get state(): CircuitState {
    if (this._state === 'open') {
      if (Date.now() - this.lastOpenedAt >= this.recoveryTimeout) {
        this._state = 'half-open';
      }
    }
    return this._state;
  }

  get isCallable(): boolean {
    return this.state !== 'open';
  }

  recordSuccess(): void {
    if (this._state === 'half-open') {
      this._state = 'closed';
      this.failures = 0;
    } else if (this._state === 'closed') {
      this.failures = Math.max(0, this.failures - DECAY_ON_SUCCESS);
    }
  }

  recordFailure(): void {
    this.failures++;
    if (this._state === 'half-open' || this.failures >= this.threshold) {
      this._state = 'open';
      this.lastOpenedAt = Date.now();
    }
  }

  reset(): void {
    this._state = 'closed';
    this.failures = 0;
    this.lastOpenedAt = 0;
  }

  /** For testing — force a specific state. */
  forceState(state: CircuitState): void {
    this._state = state;
    if (state === 'open') this.lastOpenedAt = Date.now();
  }
}
