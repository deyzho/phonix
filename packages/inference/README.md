# @axonsdk/inference

OpenAI-compatible inference routing for AxonSDK. Routes chat completion requests across decentralized compute providers (io.net, Akash, Acurast) with automatic failover and latency-aware routing.

## Installation

```bash
npm install @axonsdk/inference
```

## Quick Start

```typescript
import { AxonInferenceHandler } from '@axonsdk/inference';

const handler = new AxonInferenceHandler({
  apiKey: process.env.AXON_SECRET_KEY!,
  ionetEndpoint: process.env.IONET_INFERENCE_URL,
  akashEndpoint: process.env.AKASH_INFERENCE_URL,
  strategy: 'latency',   // or 'cost'
});

// Next.js App Router
export const POST = (req: Request) => handler.handleRequest(req);
export const GET  = (req: Request) => handler.handleRequest(req);
```

## Environment Variables

| Variable | Description |
|---|---|
| `IONET_INFERENCE_URL` | io.net inference endpoint |
| `AKASH_INFERENCE_URL` | Akash inference endpoint |
| `ACURAST_WS_URL` | Acurast WebSocket endpoint |

## Routing Strategies

- **`latency`** (default) — picks the provider with the lowest exponential moving average response time
- **`cost`** — prefers providers in cost order: io.net → Akash → Acurast

## License

Apache-2.0
