// Supported providers
export type ProviderName = 'acurast' | 'fluence' | 'koii' | 'akash' | 'ionet' | 'aws' | 'gcp' | 'azure' | 'cloudflare' | 'flyio';

// Runtime types (provider availability varies)
export type RuntimeType = 'nodejs' | 'python' | 'docker' | 'wasm';

// Top-level project config (stored in axon.json)
export interface AxonConfig {
  projectName: string;
  provider: ProviderName;
  runtime: RuntimeType;
  entryFile: string;
  schedule: ScheduleConfig;
  replicas?: number;
  maxCostPerExecution?: number;
  environment?: Record<string, string>;
  destinations?: string[];
}

export interface ScheduleConfig {
  type: 'onetime' | 'interval' | 'on-demand';
  intervalMs?: number;   // For interval type
  durationMs?: number;   // Total lifetime in ms
}

// Unified deployment config passed to provider
export interface DeploymentConfig {
  runtime: RuntimeType;
  code: string;           // Path to entry file
  schedule: ScheduleConfig;
  replicas?: number;
  maxCostPerExecution?: number;
  environment?: Record<string, string>;
  destinations?: string[]; // Blockchain addresses or URLs
}

// Unified deployment result
export interface Deployment {
  id: string;
  provider: ProviderName;
  status: 'pending' | 'live' | 'completed' | 'failed';
  processorIds: string[];
  createdAt: Date;
  url?: string;           // e.g. https://0xabc.acu.run
}

// Unified message
export interface Message {
  from: string;           // Processor pubkey
  payload: unknown;
  timestamp: Date;
  signature?: string;
}

// Cost estimate
export interface CostEstimate {
  provider: ProviderName;
  token: string;          // e.g. 'ACU', 'FLT'
  amount: number;
  usdEquivalent?: number;
}

// ─── Error types ────────────────────────────────────────────────────────────

export class AxonError extends Error {
  constructor(providerOrMessage: string, message?: string) {
    super(message ? `[${providerOrMessage}] ${message}` : providerOrMessage);
    this.name = 'AxonError';
    // Maintain proper prototype chain in ES5 transpilation targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderNotImplementedError extends AxonError {
  constructor(provider: ProviderName, method: string) {
    super(
      `Provider '${provider}' has not implemented '${method}' yet. Coming in v0.2.`
    );
    this.name = 'ProviderNotImplementedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigValidationError extends AxonError {
  constructor(field: string, reason: string) {
    super(`Invalid axon.json — field '${field}': ${reason}`);
    this.name = 'ConfigValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
