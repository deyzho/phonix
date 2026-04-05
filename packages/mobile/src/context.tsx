/**
 * PhonixProvider — React context for app-wide Phonix client management.
 *
 * Wrap your root component with PhonixProvider to make the client available
 * anywhere in the tree via usePhonixContext().
 *
 * Example:
 *
 *   // App.tsx
 *   export default function App() {
 *     return (
 *       <PhonixProvider
 *         provider="akash"
 *         secretKey={PHONIX_SECRET_KEY}
 *         autoConnect
 *       >
 *         <NavigationContainer>...</NavigationContainer>
 *       </PhonixProvider>
 *     );
 *   }
 *
 *   // AnyScreen.tsx
 *   function AnyScreen() {
 *     const { client, connected } = usePhonixContext();
 *     const messages = useMessages(client);
 *     ...
 *   }
 */

import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { usePhonix } from './hooks.js';
import type { UsePhonixOptions, UsePhonixResult } from './hooks.js';

// ─── Context ─────────────────────────────────────────────────────────────────

const PhonixContext = createContext<UsePhonixResult | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export type PhonixProviderProps = PropsWithChildren<UsePhonixOptions>;

/**
 * Provides a MobilePhonixClient to the entire React tree.
 * The client is created once and shared across all consumers.
 */
export function PhonixProvider({ children, ...options }: PhonixProviderProps) {
  const phonix = usePhonix(options);
  return (
    <PhonixContext.Provider value={phonix}>
      {children}
    </PhonixContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

/**
 * Access the Phonix client from any component inside a PhonixProvider.
 * Throws if called outside of a PhonixProvider tree.
 */
export function usePhonixContext(): UsePhonixResult {
  const ctx = useContext(PhonixContext);
  if (!ctx) {
    throw new Error(
      'usePhonixContext() must be called inside a <PhonixProvider>. ' +
        'Wrap your root component with <PhonixProvider provider="akash" secretKey={...}>.'
    );
  }
  return ctx;
}
