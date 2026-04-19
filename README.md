# Axon SDK

[![CI](https://github.com/deyzho/axon-ts/actions/workflows/publish.yml/badge.svg)](https://github.com/deyzho/axon-ts/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/@axonsdk/sdk)](https://www.npmjs.com/package/@axonsdk/sdk)
[![Node](https://img.shields.io/node/v/@axonsdk/sdk)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

**[axonsdk.dev](https://axonsdk.dev) · [npm](https://www.npmjs.com/org/axonsdk) · [GitHub](https://github.com/deyzho/axon-ts)**

**One SDK. Any compute. Route AI inference to the fastest, cheapest backend — cloud, edge, or your own infrastructure.**

Axon is a universal AI compute routing layer. Stop rewriting integrations every time you switch providers, hit rate limits, or find a cheaper GPU. Point Axon at any backend — GPU clusters, container clouds, serverless functions, TEE enclaves, or your own servers — and it handles routing, failover, and cost optimisation automatically.

Drop in the OpenAI-compatible `@axonsdk/inference` package and your existing code routes to a new backend in two lines. Call your deployed processors from **iOS and Android** with `@axonsdk/mobile`.

> Axon is to AI compute what httpx is to HTTP — **one client, any backend**.

---

## Supported providers

### Edge & private compute

| Provider | Status | Nodes | Runtime | Cost |
|---|---|---|---|---|
| [io.net](https://io.net) | ✅ Live | GPU clusters (A100, H100, RTX) | nodejs, python | ~$0.40/hr GPU spot |
| [Akash Network](https://akash.network) | ✅ Live | Container compute marketplace | nodejs, docker | Pay-per-use |
| [Acurast](https://acurast.com) | ✅ Live | 237k+ mobile TEE nodes | nodejs, wasm | Pay-per-execution |
| [Fluence](https://fluence.network) | ✅ Live | Serverless function compute | nodejs | Pay-per-ms |
| [Koii](https://koii.network) | ✅ Live | Distributed task nodes | nodejs | Pay-per-task |

### Cloud providers

| Provider | Status | Services | Runtime |
|---|---|---|---|
| [AWS](https://aws.amazon.com) | ✅ Live | Lambda, ECS / Fargate, EC2 | python, nodejs, docker |
| [Google Cloud](https://cloud.google.com) | ✅ Live | Cloud Run, Cloud Functions | python, nodejs, docker |
| [Azure](https://azure.microsoft.com) | ✅ Live | Container Instances, Functions | python, nodejs, docker |
| [Cloudflare Workers](https://workers.cloudflare.com) | ✅ Live | Workers, R2, AI Gateway | nodejs, wasm |
| [Fly.io](https://fly.io) | ✅ Live | Fly Machines | python, nodejs, docker |

> **Provider health dashboard:** Real-time status and latency for all networks → [status.axonsdk.dev](https://status.axonsdk.dev)

---

## Quick start (TypeScript / Node.js)

### 1. Install the CLI

```bash
npm install -g @axonsdk/cli
```

### 2. Initialise a new project

```bash
mkdir my-app && cd my-app
axon init
```

Prompts for project name, provider, and template, then generates `axon.json`, `.env`, and `src/index.ts`.

### 3. Configure credentials

```bash
axon auth
```

The interactive wizard generates and stores all required keys for your chosen provider. Your `.env` is locked to owner-only permissions automatically.

### 4. Test locally

```bash
axon run-local
```

Runs your script in a local mock environment — simulates provider runtime APIs without touching the network or spending credits.

### 5. Deploy

```bash
axon deploy
```

Bundles your script, uploads it, and registers the deployment.

```
✔ Deployment live!
  Deployment ID: 0xabc123...
  Processors:    3 matched
    • 0xproc1...
    • 0xproc2...
    • 0xproc3...
```

### 6. Send and receive

```typescript
import { AxonClient } from '@axonsdk/sdk';

const client = new AxonClient({
  provider: 'ionet', // 'ionet' | 'akash' | 'acurast' | 'fluence' | 'koii' | 'aws' | 'gcp' | 'azure' | 'cloudflare' | 'flyio'
  secretKey: process.env.AXON_SECRET_KEY,
});

await client.connect();

client.onMessage((msg) => {
  const { result } = msg.payload as { result: string };
  console.log('Result:', result);
});

await client.send('0xproc1...', { prompt: 'Summarize: The quick brown fox...' });

client.disconnect();
```

---

## CLI reference

| Command | Description |
|---|---|
| `axon init` | Interactive setup — generates `axon.json`, `.env`, and template files |
| `axon auth [provider]` | Credential wizard — generates and stores keys for the selected provider |
| `axon deploy` | Bundle and register your deployment |
| `axon run-local` | Run locally with a mock provider runtime |
| `axon status` | List deployments, processor IDs, and live status |
| `axon send <id> <msg>` | Send a test message to a processor node |
| `axon teardown <id>` | Delete a deployment and free provider resources |
| `axon template list` | Show available built-in templates |

Supported providers: `ionet`, `akash`, `acurast`, `fluence`, `koii`, `aws`, `gcp`, `azure`, `cloudflare`, `flyio`

---

## SDK reference

```typescript
import { AxonClient } from '@axonsdk/sdk';
import type { DeploymentConfig } from '@axonsdk/sdk';

const client = new AxonClient({
  provider: 'ionet',
  secretKey: process.env.AXON_SECRET_KEY,
});

await client.connect();

// Estimate cost before deploying
const cost = await client.estimate({
  runtime: 'nodejs',
  code: './dist/index.js',
  schedule: { type: 'on-demand', durationMs: 86_400_000 },
  replicas: 1,
});
console.log(`Estimated: ${cost.amount} ${cost.token}`);

// Deploy
const deployment = await client.deploy({ ... });

// Send a message
await client.send(deployment.processorIds[0], { prompt: 'Hello' });

// Receive results
client.onMessage((msg) => console.log(msg.payload));

// Teardown when done
await client.teardown(deployment.id);

client.disconnect();
```

---

## OpenAI-compatible inference endpoint

`@axonsdk/inference` is a drop-in replacement for the OpenAI API that routes requests to the fastest available backend. Switch your existing OpenAI integration in two lines:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:8000/v1', // your Axon inference handler URL
  apiKey:  process.env.AXON_SECRET_KEY,
});

// Everything else stays identical
const response = await client.chat.completions.create({
  model:    'axon-llama-3-70b',
  messages: [{ role: 'user', content: 'Explain edge AI in one paragraph.' }],
});
```

### Available models

| Model ID | Backend | Notes |
|---|---|---|
| `axon-llama-3-70b` | io.net | A100 GPU — best quality |
| `axon-mistral-7b`  | io.net | GPU, most cost-efficient |
| `axon-llama-3-8b`  | Akash  | Container compute, moderate cost |
| `axon-tee-phi-3-mini` | Acurast | TEE node — private execution |

### Setup (Next.js App Router)

```bash
npm install @axonsdk/inference
```

```typescript
// app/api/v1/chat/completions/route.ts
import { AxonInferenceHandler } from '@axonsdk/inference';

const handler = new AxonInferenceHandler({
  apiKey:        process.env.AXON_SECRET_KEY!,
  ionetEndpoint: process.env.IONET_ENDPOINT!,
  akashEndpoint: process.env.AKASH_ENDPOINT,
  acurastWsUrl:  process.env.ACURAST_WS_URL,
  strategy:      'cost', // 'cost' | 'latency' | 'balanced'
});

export const POST = (req: Request) => handler.handleRequest(req);
export const GET  = (req: Request) => handler.handleRequest(req); // GET /v1/models
```

The handler implements streaming (SSE) and non-streaming, bearer auth, automatic failover with 30-second recovery, and an `X-Axon-Provider` response header so you can see which backend served each request.

---

## Multi-provider Router

`AxonRouter` routes requests across multiple providers simultaneously, picking the best one on every call based on real-time latency, cost, and availability.

```typescript
import { AxonRouter } from '@axonsdk/sdk';

const router = new AxonRouter({
  providers: ['ionet', 'akash', 'acurast'],
  secretKey: process.env.AXON_SECRET_KEY,
  strategy: 'latency',          // 'balanced' | 'latency' | 'availability' | 'cost' | 'round-robin'
  processorStrategy: 'fastest', // 'round-robin' | 'fastest' | 'random' | 'first'
  failureThreshold: 3,          // open circuit after 3 consecutive failures
  recoveryTimeoutMs: 30_000,
  maxRetries: 2,
});

await router.connect();
await router.deploy({ runtime: 'nodejs', code: './dist/index.js', ... });

// Automatically picks the highest-scoring provider
await router.send({ prompt: 'Hello' });

// Health snapshot
router.health().forEach((h) => {
  console.log(h.provider, h.latencyMs, h.circuitState, h.score);
});

router.disconnect();
```

### Routing strategies

| Strategy | Best for |
|---|---|
| `balanced` | General purpose — equal weight on availability, latency, cost |
| `latency` | Interactive workloads — always picks the fastest provider |
| `availability` | High uptime — prefers the most reliable provider |
| `cost` | Batch jobs — routes to the cheapest option |
| `round-robin` | Even load distribution |

---

## Mobile SDK (iOS & Android)

`@axonsdk/mobile` is a React Native / Expo package for calling AI inference endpoints from iOS and Android apps — with automatic failover, circuit breakers, and secure key storage.

```bash
npm install @axonsdk/mobile
```

```tsx
// App.tsx
import { AxonProvider } from '@axonsdk/mobile';

export default function App() {
  return (
    <AxonProvider provider="akash" secretKey={AXON_SECRET_KEY} autoConnect>
      <NavigationContainer><MainStack /></NavigationContainer>
    </AxonProvider>
  );
}

// AnyScreen.tsx
import { useAxonContext, useMessages, useSend } from '@axonsdk/mobile';

export function InferenceScreen() {
  const { client, connected } = useAxonContext();
  const messages = useMessages(client);
  const { send, sending } = useSend(client);

  return (
    <View>
      <Text>{connected ? '🟢 Live' : '⚪ Offline'}</Text>
      <Button
        title={sending ? 'Sending...' : 'Run inference'}
        onPress={() => send(ENDPOINT_URL, { prompt: 'Hello from iOS!' })}
      />
      {messages.map((m, i) => <Text key={i}>{JSON.stringify(m.payload)}</Text>)}
    </View>
  );
}
```

```tsx
// Multi-provider routing in mobile
import { useAxonRouter } from '@axonsdk/mobile';

const { router, connected, health } = useAxonRouter({
  routes: [
    { provider: 'akash',   endpoint: 'https://lease.akash.example.com', secretKey },
    { provider: 'acurast', endpoint: 'wss://proxy.acurast.com',          secretKey },
  ],
  strategy: 'latency',
  autoConnect: true,
});
```

### Secure key storage

```tsx
import { SecureKeyStorage } from '@axonsdk/mobile';

const storage = new SecureKeyStorage();
await storage.saveSecretKey(myKey); // iOS Keychain / Android Keystore
const key = await storage.loadSecretKey();
```

---

## Security

- **Secrets never leave `.env`** — the auth wizard generates keys locally and stores them with `chmod 600`. Never logged or transmitted.
- **SSRF protection** — all HTTP calls validate URLs against a private-IP blocklist and enforce HTTPS.
- **DNS rebinding defence** — resolves hostnames to IPs before opening connections, then re-validates the IP.
- **Prototype pollution prevention** — remote JSON payloads are parsed with key blocklisting; environment maps use `Object.create(null)`.
- **Response size caps** — all provider clients enforce a 1 MiB response cap; mock runtime enforces 4 MiB.
- **Input validation** — `processorId` and deployment names validated for control characters and path traversal sequences.
- **esbuild injection guard** — rejects any `environment` key that looks like a secret before bundle time.

---

## Project structure

```
axon/
├── packages/
│   ├── cli/          # @axonsdk/cli — command-line tool
│   ├── inference/    # @axonsdk/inference — OpenAI-compatible inference handler
│   ├── mobile/       # @axonsdk/mobile — React Native / Expo SDK
│   └── sdk/          # @axonsdk/sdk — core library
│       └── src/
│           ├── providers/
│           │   ├── ionet/      # io.net GPU provider
│           │   ├── akash/      # Akash Network provider
│           │   ├── acurast/    # Acurast TEE provider
│           │   ├── fluence/    # Fluence serverless provider
│           │   ├── koii/       # Koii task node provider
│           │   ├── aws/        # AWS Lambda provider
│           │   ├── gcp/        # Google Cloud Run provider
│           │   ├── azure/      # Azure Container Instances provider
│           │   ├── cloudflare/ # Cloudflare Workers provider
│           │   └── flyio/      # Fly.io Machines provider
│           └── runtime/
│               └── adapters/ # Per-provider runtime bootstraps
├── status/           # Provider health dashboard
├── templates/
│   ├── inference/    # LLM inference template
│   └── oracle/       # Data oracle template
└── examples/
    └── nextjs-app/   # Next.js integration example
```

---

## Development

```bash
git clone https://github.com/deyzho/axon-ts.git
cd axon
npm install
npm run build
npm test
```

---

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

High-impact areas:
- Integration tests against live provider sandboxes
- Additional cloud provider support
- Template library

---

## Ecosystem

This repository contains the **TypeScript / Node.js** packages. If you're building with **Python**, see the companion repository:

| Package | Description |
|---|---|
| [`axonsdk-py`](https://github.com/deyzho/axon) | Python SDK — same providers, FastAPI inference server, cloud provider support |

```bash
pip install axonsdk-py
```

**[axonsdk.dev](https://axonsdk.dev)** — full documentation for the Python SDK.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

**[axonsdk.dev](https://axonsdk.dev)** · deyzho@me.com · Apache-2.0

*Axon is not affiliated with io.net, Akash Network, Acurast, Fluence, or Koii. Provider names and trademarks belong to their respective owners.*
