/**
 * @phonixsdk/sdk — public API surface
 *
 * Export everything a consumer of the SDK might need.
 */

// Main client
export { PhonixClient } from './client.js';
export type { PhonixClientOptions } from './client.js';

// Provider interface
export type { IPhonixProvider } from './providers/base.js';

// Provider implementations
export { AcurastProvider } from './providers/acurast/index.js';
export { FluenceProvider } from './providers/fluence/index.js';
export { KoiiProvider } from './providers/koii/index.js';
export { AkashProvider } from './providers/akash/index.js';
export { IoNetProvider } from './providers/ionet/index.js';

// Types
export type {
  ProviderName,
  RuntimeType,
  PhonixConfig,
  ScheduleConfig,
  DeploymentConfig,
  Deployment,
  Message,
  CostEstimate,
} from './types.js';

// Error classes
export { PhonixError, ProviderNotImplementedError, ConfigValidationError } from './types.js';

// Config utilities
export { loadConfig, generateConfig, generateEnv } from './config.js';
export type { GenerateConfigOptions } from './config.js';

// Key generation utility (re-exported from acurast client for convenience)
export { generateP256KeyPair } from './providers/acurast/client.js';

// Runtime abstraction — for advanced use (provider deploy functions use this internally)
export { generateRuntimeBootstrap } from './runtime/index.js';
export type { IPhonixRuntime, PhonixRuntimeHttp, PhonixRuntimeWs, RuntimeTarget } from './runtime/index.js';

// Router — multi-provider routing with circuit breaking and health monitoring
export { PhonixRouter } from './router/index.js';
export type {
  RouterConfig,
  RouterDeployment,
  RouterSendOptions,
  ProviderHealthSnapshot,
  RouterEvent,
  RouterEventHandler,
  RoutingStrategy,
  ProcessorStrategy,
  CircuitState,
} from './router/types.js';
