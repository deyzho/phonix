/**
 * @phonixsdk/mobile — React Native / Expo SDK for iOS and Android.
 *
 * Call your deployed Phonix processors directly from your iOS and Android apps.
 * Supports Akash (HTTP), Acurast (WebSocket), and any generic HTTPS endpoint.
 *
 * Quick start:
 *   npm install @phonixsdk/mobile
 *
 *   // Wrap your app
 *   import { PhonixProvider } from '@phonixsdk/mobile';
 *   <PhonixProvider provider="akash" secretKey={PHONIX_SECRET_KEY} autoConnect>
 *     <App />
 *   </PhonixProvider>
 *
 *   // Use in any screen
 *   import { usePhonixContext, useMessages, useSend } from '@phonixsdk/mobile';
 *   const { client, connected } = usePhonixContext();
 *   const messages = useMessages(client);
 *   const { send, sending } = useSend(client);
 */

// ─── Client ───────────────────────────────────────────────────────────────────
export { MobilePhonixClient } from './client.js';
export type { MobilePhonixClientOptions, MobileProviderName } from './client.js';

// ─── Router ───────────────────────────────────────────────────────────────────
export { MobilePhonixRouter } from './router.js';
export type {
  MobileRouterConfig,
  MobileRouteConfig,
  MobileRoutingStrategy,
  MobileRouteHealth,
} from './router.js';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { usePhonix, useMessages, useSend, usePhonixRouter } from './hooks.js';
export type {
  UsePhonixOptions,
  UsePhonixResult,
  UseMessagesOptions,
  UseSendResult,
  UsePhonixRouterResult,
} from './hooks.js';

// ─── Context ──────────────────────────────────────────────────────────────────
export { PhonixProvider, usePhonixContext } from './context.js';
export type { PhonixProviderProps } from './context.js';

// ─── Storage ──────────────────────────────────────────────────────────────────
export { SecureKeyStorage } from './storage.js';

// ─── Re-export shared types from the SDK so consumers only need one import ────
export type { Message, Deployment, CostEstimate } from '@phonixsdk/sdk';
export { PhonixError } from '@phonixsdk/sdk';
