# Axon × Next.js Example

A minimal Next.js App Router example showing how to call an Axon edge processor from a web application — keeping your secret key server-side and streaming results to the browser.

## What this demonstrates

- Calling a deployed Acurast or Akash processor from a Next.js API Route
- Keeping `AXON_SECRET_KEY` server-side (never exposed to the browser)
- Returning inference results to the client over a standard JSON response
- Switching providers with a single config change

---

## Setup

### 1. Deploy a processor

Deploy the inference template to your chosen provider:

```bash
# Acurast (TEE smartphones)
cd ../../templates/inference
axon auth acurast
axon deploy

# — or — Akash (container marketplace)
axon auth akash
# Edit axon.json → "provider": "akash"
axon deploy
```

Copy the processor ID (Acurast) or lease URL (Akash) from the output.

### 2. Configure environment variables

Create `.env.local` in this directory:

```bash
# Your Axon secret key — keep this server-side only
AXON_SECRET_KEY=your_secret_key_hex

# For Acurast: processor public key from `axon status`
PROCESSOR_ID=0xabc...your_processor_id

# For Akash: full lease URL from `axon status`
# PROCESSOR_ID=https://provider.akash.network:31234
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
Browser (React)
    │
    │  POST /api/axon/send
    │
Next.js API Route (server-side only)
    │
    │  AxonClient from '@axonsdk/sdk'
    │
    ├── Acurast: wss://ws-1.acurast.com  →  Smartphone TEE
    │
    └── Akash:   https://provider.akash.network:31234/message  →  Container
```

The browser never sees `AXON_SECRET_KEY`. All provider calls happen in the API Route.

---

## API Route — Acurast

```typescript
// app/api/axon/send/route.ts
import { AxonClient } from '@axonsdk/sdk';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { prompt } = await req.json() as { prompt: string };

  const client = new AxonClient({
    provider: 'acurast',
    secretKey: process.env.AXON_SECRET_KEY,
  });

  await client.connect();

  const result = await new Promise<string>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      unsubscribe();
      client.disconnect();
      reject(new Error('Processor timed out'));
    }, 30_000);

    const unsubscribe = client.onMessage((msg) => {
      const payload = msg.payload as { requestId?: string; result?: string };
      if (payload.requestId === requestId && payload.result !== undefined) {
        clearTimeout(timeout);
        unsubscribe();
        client.disconnect();
        resolve(payload.result);
      }
    });

    client.send(process.env.PROCESSOR_ID!, { requestId, prompt }).catch(reject);
  });

  return NextResponse.json({ result });
}
```

## API Route — Akash

```typescript
// app/api/axon/send/route.ts  (Akash variant)
import { AxonClient } from '@axonsdk/sdk';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { prompt } = await req.json() as { prompt: string };

  const client = new AxonClient({
    provider: 'akash',
    secretKey: process.env.AXON_SECRET_KEY,
  });

  await client.connect();

  let result: string | null = null;
  const unsubscribe = client.onMessage((msg) => {
    result = typeof msg.payload === 'string'
      ? msg.payload
      : JSON.stringify(msg.payload);
  });

  // Akash uses synchronous HTTP — send returns after the container responds
  await client.send(process.env.PROCESSOR_ID!, { prompt });

  unsubscribe();
  client.disconnect();

  return NextResponse.json({ result });
}
```

## React component

```tsx
// app/page.tsx
'use client';
import { useState } from 'react';

export default function Page() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setResult('');
    const res = await fetch('/api/axon/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json() as { result: string };
    setResult(data.result);
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 600, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Axon Inference</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your prompt..."
        rows={4}
        style={{ width: '100%', marginBottom: '1rem' }}
      />
      <button onClick={submit} disabled={loading || !prompt}>
        {loading ? 'Processing...' : 'Run'}
      </button>
      {result && (
        <pre style={{ marginTop: '1.5rem', whiteSpace: 'pre-wrap' }}>{result}</pre>
      )}
    </main>
  );
}
```

---

## Switching providers

Change a single line in your API Route:

```typescript
const client = new AxonClient({
  provider: 'akash',   // 'acurast' | 'fluence' | 'koii' | 'akash'
  secretKey: process.env.AXON_SECRET_KEY,
});
```

Then update `PROCESSOR_ID` in `.env.local` to the corresponding endpoint for the new provider.

---

## Security notes

- **Never expose `AXON_SECRET_KEY` to the browser** — keep all `AxonClient` usage in API Routes, Server Components, or Server Actions
- The API Route validates that `prompt` is a string before forwarding it to the processor
- For production, add rate limiting (e.g. [Upstash Rate Limit](https://github.com/upstash/ratelimit)) to the `/api/axon/send` route

---

## Want to call processors from mobile?

Use [`@axonsdk/mobile`](../../packages/mobile/) for React Native / Expo apps. It provides the same messaging API with React hooks, iOS Keychain / Android Keystore secure storage, and AppState lifecycle management.

```bash
npm install @axonsdk/mobile
```
