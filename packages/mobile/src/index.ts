/**
 * @axonsdk/mobile — React Native / Expo SDK for iOS and Android.
 *
 * Call your deployed Axon processors directly from your iOS and Android apps.
 * Supports Akash (HTTP), Acurast (WebSocket), and any generic HTTPS endpoint.
 *
 * Quick start:
 *   npm install @axonsdk/mobile
 *
 *   // Wrap your app
 *   import { AxonProvider } from '@axonsdk/mobile';
 *   <AxonProvider provider="akash" secretKey={AXON_SECRET_KEY} autoConnect>
 *     <App />
 *   </AxonProvider>
 *
 *   // Use in any screen
 *   import { useAxonContext, useMessages, useSend } from '@axonsdk/mobile';
 *   const { client, connected } = useAxonContext();
 *   const messages = useMessages(client);
 *   const { send, sending } = useSend(client);
 */

// ─── Client ───────────────────────────────────────────────────────────────────
export { MobileAxonClient } from './client.js';
export type { MobileAxonClientOptions, MobileProviderName } from './client.js';

// ─── Router ───────────────────────────────────────────────────────────────────
export { MobileAxonRouter } from './router.js';
export type {
  MobileRouterConfig,
  MobileRouteConfig,
  MobileRoutingStrategy,
  MobileRouteHealth,
} from './router.js';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { useAxon, useMessages, useSend, useAxonRouter } from './hooks.js';
export type {
  UseAxonOptions,
  UseAxonResult,
  UseMessagesOptions,
  UseSendResult,
  UseAxonRouterResult,
} from './hooks.js';

// ─── Context ──────────────────────────────────────────────────────────────────
export { AxonProvider, useAxonContext } from './context.js';
export type { AxonProviderProps } from './context.js';

// ─── Storage ──────────────────────────────────────────────────────────────────
export { SecureKeyStorage } from './storage.js';

// ─── Re-export shared types from the SDK so consumers only need one import ────
export type { Message, Deployment, CostEstimate } from '@axonsdk/sdk';
export { AxonError } from '@axonsdk/sdk';
