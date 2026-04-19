# @axonsdk/mobile

> React Native / Expo SDK for calling Axon edge processors from iOS and Android apps.

[![npm](https://img.shields.io/npm/v/@axonsdk/mobile)](https://www.npmjs.com/package/@axonsdk/mobile)
[![license](https://img.shields.io/npm/l/@axonsdk/mobile)](./LICENSE)

## Overview

`@axonsdk/mobile` lets you call your deployed Axon processors directly from iOS and Android apps. Deploy your processors with the Axon CLI on your development machine, then call them from your mobile app using React hooks or the standalone client.

**Supports:** Akash Network (HTTP) · Acurast (WebSocket) · Generic HTTPS

## Installation

```bash
npm install @axonsdk/mobile @axonsdk/sdk
# optional: expo-secure-store for secure key storage
expo install expo-secure-store
```

## Quick start

### Context + hooks (recommended)

```tsx
import { AxonProvider, useAxonContext, useMessages, useSend } from '@axonsdk/mobile';

// Wrap your app
export default function App() {
  return (
    <AxonProvider provider="akash" secretKey={AXON_SECRET_KEY} autoConnect>
      <HomeScreen />
    </AxonProvider>
  );
}

// Use in any screen
function HomeScreen() {
  const { client, connected } = useAxonContext();
  const messages = useMessages(client);
  const { send, sending } = useSend(client);

  return (
    <>
      <Button
        title="Send"
        disabled={!connected || sending}
        onPress={() => send('https://your-lease.akash.network:31234', { prompt: 'Hello' })}
      />
      {messages.map((m, i) => (
        <Text key={i}>{JSON.stringify(m.payload)}</Text>
      ))}
    </>
  );
}
```

### Multi-provider router

Route across multiple DePIN networks with automatic failover and health scoring:

```tsx
import { useAxonRouter } from '@axonsdk/mobile';

function App() {
  const { router, connected, health } = useAxonRouter({
    routes: [
      { provider: 'akash',   endpoint: 'https://lease.akash.example.com', secretKey },
      { provider: 'acurast', endpoint: 'wss://proxy.acurast.com',          secretKey },
    ],
    strategy: 'balanced',   // 'balanced' | 'latency' | 'availability' | 'cost' | 'round-robin'
    autoConnect: true,
  });

  return (
    <Button
      title="Send"
      disabled={!connected}
      onPress={() => router?.send({ prompt: 'Hello from iOS' })}
    />
  );
}
```

AppState listeners are attached automatically — the router pauses on background and resumes on foreground.

### Secure key storage

```tsx
import { SecureKeyStorage } from '@axonsdk/mobile';

const storage = new SecureKeyStorage();
await storage.saveSecretKey(myKey);   // iOS Keychain / Android Keystore
const key = await storage.loadSecretKey();
```

## API

| Export | Description |
|---|---|
| `MobileAxonClient` | Messaging-only client — connect, send, onMessage |
| `MobileAxonRouter` | Multi-provider router with circuit breakers and health scoring |
| `useAxon(options)` | Hook — manages client lifecycle |
| `useAxonRouter(config)` | Hook — manages router lifecycle with AppState awareness |
| `useMessages(client)` | Hook — reactive `Message[]` array, newest first |
| `useSend(client)` | Hook — wraps `send()` with `sending` / `sendError` state |
| `AxonProvider` | React context — provides client to your component tree |
| `useAxonContext()` | Consumes the AxonProvider context |
| `SecureKeyStorage` | iOS Keychain / Android Keystore via `expo-secure-store` |

## Documentation

Full docs at [axonsdk.dev](https://axonsdk.dev) · [GitHub](https://github.com/deyzho/axon-ts)

## License

Apache-2.0 © [Axon](https://axonsdk.dev)
