/**
 * React hooks for the Axon mobile SDK.
 *
 * useAxon  — manages MobileAxonClient lifecycle (connect / disconnect /
 *              AppState transitions) and exposes the client to your component.
 *
 * useMessages — subscribes to incoming messages from processors and returns
 *               them as a reactive array. Newest messages appear first.
 *
 * Example (Expo / React Native):
 *
 *   function ProcessorScreen() {
 *     const { client, connected, connect, disconnect, error } = useAxon({
 *       provider: 'akash',
 *       secretKey: AXON_SECRET_KEY,
 *     });
 *     const messages = useMessages(client);
 *
 *     return (
 *       <>
 *         <Button title="Connect" onPress={connect} disabled={connected} />
 *         <Button title="Send" onPress={() =>
 *           client?.send('https://provider.akash.network:31234', { prompt: 'Hello' })
 *         } />
 *         {messages.map((m, i) => (
 *           <Text key={i}>{JSON.stringify(m.payload)}</Text>
 *         ))}
 *       </>
 *     );
 *   }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '@axonsdk/sdk';
import { MobileAxonClient } from './client.js';
import type { MobileAxonClientOptions } from './client.js';
import { MobileAxonRouter } from './router.js';
import type { MobileRouterConfig, MobileProviderName, MobileRouteHealth } from './router.js';

// ─── useAxon ────────────────────────────────────────────────────────────────

export interface UseAxonOptions extends MobileAxonClientOptions {
  /**
   * If true, automatically call connect() when the hook mounts.
   * Default: false — you control when to connect.
   */
  autoConnect?: boolean;
}

export interface UseAxonResult {
  /** The MobileAxonClient instance. Null until first connect() resolves. */
  client: MobileAxonClient | null;
  /** Whether the client is currently connected. */
  connected: boolean;
  /** Whether a connect() call is in progress. */
  connecting: boolean;
  /** The last connection error, if any. Cleared on the next connect() call. */
  error: Error | null;
  /** Connect to the provider network. Safe to call multiple times. */
  connect: () => Promise<void>;
  /** Disconnect and clean up resources. */
  disconnect: () => void;
}

/**
 * Manage the full lifecycle of a MobileAxonClient in a React Native component.
 *
 * The client is created once per hook instance and disposed automatically when
 * the component unmounts. AppState listeners are attached after a successful
 * connect() so the client pauses/resumes with the app's background state.
 */
export function useAxon(options: UseAxonOptions): UseAxonResult {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable ref — recreated only when provider or secretKey changes
  const clientRef = useRef<MobileAxonClient | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Create client instance once (or when key credentials change)
  const clientKey = `${options.provider}:${options.secretKey}`;
  const clientKeyRef = useRef<string>('');

  if (clientKey !== clientKeyRef.current) {
    clientRef.current?.dispose();
    clientRef.current = new MobileAxonClient({
      provider: options.provider,
      secretKey: options.secretKey,
      wsUrl: options.wsUrl,
      reconnectOnForeground: options.reconnectOnForeground,
      maxResponseBytes: options.maxResponseBytes,
    });
    clientKeyRef.current = clientKey;
    setConnected(false);
    setError(null);
  }

  const connect = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || client.isConnected) return;
    setConnecting(true);
    setError(null);
    try {
      await client.connect();
      client.attachAppStateListener();
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [clientKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback((): void => {
    clientRef.current?.dispose();
    setConnected(false);
  }, [clientKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect on mount if requested
  useEffect(() => {
    if (optionsRef.current.autoConnect) {
      connect().catch(() => {});
    }
    return () => {
      clientRef.current?.dispose();
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    client: clientRef.current,
    connected,
    connecting,
    error,
    connect,
    disconnect,
  };
}

// ─── useMessages ──────────────────────────────────────────────────────────────

export interface UseMessagesOptions {
  /**
   * Maximum number of messages to keep in state.
   * Oldest messages are dropped when the limit is exceeded.
   * Default: 50
   */
  maxMessages?: number;
  /**
   * If provided, only messages whose `from` field is in this set are stored.
   */
  trustedSenders?: string[];
}

/**
 * Subscribe to incoming messages from a MobileAxonClient.
 * Returns a reactive array of messages; newest first.
 *
 * The subscription is set up when `client` becomes non-null and torn down
 * when `client` changes or the component unmounts.
 */
export function useMessages(
  client: MobileAxonClient | null,
  options: UseMessagesOptions = {}
): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);
  const { maxMessages = 50, trustedSenders } = options;
  const trustedSet = trustedSenders ? new Set(trustedSenders) : null;

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onMessage((msg) => {
      if (trustedSet && !trustedSet.has(msg.from)) return;
      setMessages((prev) => {
        const next = [msg, ...prev];
        return next.length > maxMessages ? next.slice(0, maxMessages) : next;
      });
    });

    return unsubscribe;
  }, [client, maxMessages, trustedSet]);

  return messages;
}

// ─── useSend ─────────────────────────────────────────────────────────────────

export interface UseSendResult {
  /** Send a payload to the given endpoint/processorId. */
  send: (endpoint: string, payload: unknown) => Promise<void>;
  /** Whether a send is currently in progress. */
  sending: boolean;
  /** The last send error, if any. */
  sendError: Error | null;
}

// ─── useAxonRouter ──────────────────────────────────────────────────────────

export interface UseAxonRouterResult {
  router: MobileAxonRouter | null;
  connected: boolean;
  connecting: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  health: MobileRouteHealth[];
}

/**
 * Manage the full lifecycle of a MobileAxonRouter in a React Native component.
 * Automatically connects on mount when autoConnect is true.
 */
export function useAxonRouter(
  config: MobileRouterConfig & { autoConnect?: boolean }
): UseAxonRouterResult {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [health, setHealth] = useState<MobileRouteHealth[]>([]);
  const routerRef = useRef<MobileAxonRouter | null>(null);

  if (!routerRef.current) {
    routerRef.current = new MobileAxonRouter(config);
  }

  const connect = useCallback(async (): Promise<void> => {
    const router = routerRef.current;
    if (!router) return;
    setConnecting(true);
    setError(null);
    try {
      await router.connect();
      router.attachAppStateListeners();
      setConnected(true);
      setHealth(router.health());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback((): void => {
    routerRef.current?.dispose();
    setConnected(false);
    setHealth([]);
  }, []);

  useEffect(() => {
    if (config.autoConnect) {
      connect().catch(() => {});
    }
    return () => {
      routerRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    router: routerRef.current,
    connected,
    connecting,
    error,
    connect,
    disconnect,
    health,
  };
}

/**
 * Convenience hook wrapping client.send() with loading / error state.
 */
export function useSend(client: MobileAxonClient | null): UseSendResult {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<Error | null>(null);

  // useCallback's generic inference in @types/react 18.3 requires an explicit
  // type parameter or cast when the callback has specific (non-unknown) args.
  const send = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (endpoint: any, payload: unknown): Promise<void> => {
      if (!client) {
        setSendError(new Error('Client is not connected.'));
        return;
      }
      setSending(true);
      setSendError(null);
      try {
        await client.send(endpoint as string, payload);
      } catch (err) {
        setSendError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setSending(false);
      }
    },
    [client]
  ) as (endpoint: string, payload: unknown) => Promise<void>;

  return { send, sending, sendError };
}
