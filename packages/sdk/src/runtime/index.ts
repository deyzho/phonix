/**
 * Runtime bootstrap factory.
 *
 * Returns a JavaScript preamble string for a given provider target.
 * This preamble is prepended to deployment bundles so the `axon` global
 * is available inside the deployment script at runtime.
 *
 * Usage (in provider deploy functions):
 *   const preamble = generateRuntimeBootstrap('acurast');
 *   const bundle = preamble + esbuildOutput;
 *
 * Usage (in run-local):
 *   const shim = generateRuntimeBootstrap('mock');
 *   // write to temp file and inject via node --import
 */

import type { ProviderName } from '../types.js';
import { acurastRuntimeBootstrap } from './adapters/acurast.js';
import { fluenceRuntimeBootstrap } from './adapters/fluence.js';
import { koiiRuntimeBootstrap } from './adapters/koii.js';
import { akashRuntimeBootstrap } from './adapters/akash.js';
import { mockRuntimeBootstrap } from './mock.js';

export type RuntimeTarget = ProviderName | 'mock';

/**
 * Generate the runtime bootstrap JavaScript string for the given target.
 * The returned string should be prepended to (or injected before) the
 * deployment bundle so `globalThis.axon` is defined before user code runs.
 */
export function generateRuntimeBootstrap(target: RuntimeTarget): string {
  switch (target) {
    case 'acurast':
      return acurastRuntimeBootstrap();
    case 'fluence':
      return fluenceRuntimeBootstrap();
    case 'koii':
      return koiiRuntimeBootstrap();
    case 'akash':
      return akashRuntimeBootstrap();
    case 'ionet':
      // io.net GPU workers use the same HTTP runtime shim as Akash containers
      return akashRuntimeBootstrap();
    case 'aws':
    case 'gcp':
    case 'azure':
    case 'cloudflare':
    case 'flyio':
      // Cloud providers use a generic HTTP runtime shim
      return akashRuntimeBootstrap();
    case 'mock':
      return mockRuntimeBootstrap();
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unknown runtime target: ${_exhaustive as string}`);
    }
  }
}

export type { IAxonRuntime, AxonRuntimeHttp, AxonRuntimeWs } from './types.js';
