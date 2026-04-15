# @axonsdk/sdk

> Provider-abstracted SDK for deploying and calling confidential edge applications across DePIN compute networks.

[![npm](https://img.shields.io/npm/v/@axonsdk/sdk)](https://www.npmjs.com/package/@axonsdk/sdk)
[![license](https://img.shields.io/npm/l/@axonsdk/sdk)](./LICENSE)
[![node](https://img.shields.io/node/v/@axonsdk/sdk)](https://nodejs.org)

## Overview

`@axonsdk/sdk` is the core library for the [Axon](https://axonsdk.dev) platform. It gives you a single, unified interface to deploy code and exchange messages with processors running on any supported DePIN network — without changing your application logic when you switch providers.

**Supported providers:** [io.net](https://io.net) · [Acurast](https://acurast.com) · [Akash Network](https://akash.network) · [Fluence](https://fluence.network) · [Koii](https://koii.network)

## Installation

```bash
npm install @axonsdk/sdk
```

Requires **Node.js ≥ 20**.

## Quick start

```typescript
import { AxonClient } from '@axonsdk/sdk';

const client = new AxonClient({
  provider: 'akash',            // 'ionet' | 'acurast' | 'fluence' | 'koii' | 'akash'
  secretKey: process.env.AXON_SECRET_KEY,
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
import { AxonRouter } from '@axonsdk/sdk';

const router = new AxonRouter({
  providers: ['akash', 'acurast'],
  secretKey: process.env.AXON_SECRET_KEY,
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

Use [`@axonsdk/mobile`](https://www.npmjs.com/package/@axonsdk/mobile) for React Native / Expo apps.

## CLI

```bash
npm install -g @axonsdk/cli
axon init
axon deploy
```

## Documentation

Full documentation at [axonsdk.dev](https://axonsdk.dev) and the [GitHub repository](https://github.com/deyzho/phonixsdk).

## License

Apache-2.0 © [Axon](https://axonsdk.dev)

> **Note:** The routing engine (`AxonRouter` internals) is proprietary and confidential. See individual file headers for details.
