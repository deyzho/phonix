/**
 * Copyright (c) 2024–present AxonSDK. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
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
