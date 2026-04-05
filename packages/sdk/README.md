# @phonixsdk/sdk

> Provider-abstracted SDK for deploying and calling confidential edge applications across DePIN compute networks.

[![npm](https://img.shields.io/npm/v/@phonixsdk/sdk)](https://www.npmjs.com/package/@phonixsdk/sdk)
[![license](https://img.shields.io/npm/l/@phonixsdk/sdk)](./LICENSE)
[![node](https://img.shields.io/node/v/@phonixsdk/sdk)](https://nodejs.org)

## Overview

`@phonixsdk/sdk` is the core library for the [Phonix](https://phonix.dev) platform. It gives you a single, unified interface to deploy code and exchange messages with processors running on any supported DePIN network — without changing your application logic when you switch providers.

**Supported providers:** [Acurast](https://acurast.com) · [Akash Network](https://akash.network) · [Fluence](https://fluence.network) · [Koii](https://koii.network)

## Installation

```bash
npm install @phonixsdk/sdk
```

Requires **Node.js ≥ 20**.

## Quick start

```typescript
import { PhonixClient } from '@phonixsdk/sdk';

const client = new PhonixClient({
  provider: 'akash',            // 'acurast' | 'fluence' | 'koii' | 'akash'
  secretKey: process.env.PHONIX_SECRET_KEY,
});

await client.connect();

const deployment = await client.deploy({
  runtime: 'nodejs',
  code: './dist/index.js',
  schedule: { type: 'on-demand', durationMs: 86_400_000 },
  replicas: 1,
});

await client.send(deployment.processorIds[0], { prompt: 'Hello' });

client.onMessage((msg) => console.log(msg.payload));

client.disconnect();
```

## Multi-provider Router

Route across multiple providers simultaneously with automatic failover, circuit breaking, and health-based scoring:

```typescript
import { PhonixRouter } from '@phonixsdk/sdk';

const router = new PhonixRouter({
  providers: ['akash', 'acurast'],
  secretKey: process.env.PHONIX_SECRET_KEY,
  strategy: 'latency',          // 'balanced' | 'latency' | 'availability' | 'cost' | 'round-robin'
  processorStrategy: 'fastest', // 'round-robin' | 'fastest' | 'random' | 'first'
  failureThreshold: 3,
  recoveryTimeoutMs: 30_000,
  maxRetries: 2,
});

await router.connect();
await router.deploy(config);     // deploys to ALL providers in parallel

await router.send({ prompt: 'Hello' }); // auto-picks the best provider

router.health().forEach((h) => {
  console.log(h.provider, h.latencyMs, h.circuitState, h.score);
});
```

### Routing strategies

| Strategy | Best for |
|---|---|
| `balanced` | General purpose — equal weight on availability, latency, cost |
| `latency` | Interactive workloads — always picks the fastest provider |
| `availability` | High uptime — prefers the most reliable provider |
| `cost` | Batch jobs — routes to the cheapest option |
| `round-robin` | Even load distribution |

## Mobile (iOS & Android)

Use [`@phonixsdk/mobile`](https://www.npmjs.com/package/@phonixsdk/mobile) for React Native / Expo apps.

## CLI

```bash
npm install -g @phonixsdk/cli
phonix init
phonix deploy
```

## Documentation

Full documentation at [phonix.dev](https://phonix.dev) and the [GitHub repository](https://github.com/deyzho/phonix).

## License

Apache-2.0 © [Phonix](https://phonix.dev)

> **Note:** The routing engine (`PhonixRouter` internals) is proprietary and confidential. See individual file headers for details.
