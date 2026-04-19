# AxonSDK Inference Template

Confidential LLM inference running privately inside a Trusted Execution Environment (TEE) on Acurast smartphone nodes — callable from any JavaScript app, Next.js backend, or iOS/Android app.

## What this does

- Deploys to 3 Acurast processor nodes (configurable in `axon.json`)
- Listens for prompts via WebSocket
- Calls any OpenAI-compatible inference API (Ollama, vLLM, OpenAI, etc.)
- Returns results privately — neither the device owner nor Acurast can inspect your prompts or responses

## Quick deploy

```bash
# 1. Set up Acurast credentials (one-time)
axon auth acurast

# 2. Set your inference endpoint in .env
echo "INFERENCE_API_URL=https://your-inference-endpoint" >> .env
echo "INFERENCE_API_KEY=your_api_key" >> .env   # omit for local Ollama
echo "INFERENCE_MODEL=llama3" >> .env

# 3. Test locally first
axon run-local

# 4. Deploy
axon deploy

# 5. Note the processor ID(s) from the output, then send a prompt
axon send <processorId> '{"prompt":"Summarize: The quick brown fox...","requestId":"1"}'
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `INFERENCE_API_URL` | `http://localhost:11434` | Base URL of your inference API |
| `INFERENCE_API_KEY` | *(empty)* | API key — leave empty for local Ollama |
| `INFERENCE_MODEL` | `llama3` | Model name to use |

Set non-secret values in `axon.json` under `environment` (injected at bundle time):

```json
{
  "environment": {
    "INFERENCE_API_URL": "https://your-endpoint",
    "INFERENCE_MODEL": "llama3"
  }
}
```

> **Note:** `INFERENCE_API_KEY` should stay in `.env` only — never put secrets in `axon.json`.

## `axon.json` configuration

| Field | Default | Description |
|---|---|---|
| `replicas` | 3 | Number of processor nodes |
| `schedule.durationMs` | 86400000 | Deployment lifetime (24h) |
| `maxCostPerExecution` | 1000000 | Max cost per run in microACU |

## Supported inference backends

The template targets the OpenAI-compatible `/v1/chat/completions` endpoint:

| Backend | URL |
|---|---|
| [Ollama](https://ollama.com) | `http://localhost:11434` (expose via ngrok/cloudflared for HTTPS) |
| [OpenAI](https://platform.openai.com) | `https://api.openai.com` |
| [vLLM](https://github.com/vllm-project/vllm) | `https://your-vllm-server` |
| Any OpenAI-compatible API | `https://your-endpoint` |

---

## Calling from your app

### From a Node.js / Next.js backend

```typescript
import { AxonClient } from '@axonsdk/sdk';

const client = new AxonClient({
  provider: 'acurast',
  secretKey: process.env.AXON_SECRET_KEY,
});

await client.connect();

client.onMessage((msg) => {
  const { requestId, result, model } = msg.payload as {
    requestId: string;
    result: string;
    model: string;
  };
  console.log(`[${requestId}] ${model}: ${result}`);
});

// Get processor IDs from `axon status`
await client.send('0xproc...', {
  requestId: 'req-001',
  model: 'llama3',        // optional — overrides INFERENCE_MODEL env var
  prompt: 'Summarize: The quick brown fox...',
});

client.disconnect();
```

### From an iOS or Android app (React Native / Expo)

```tsx
import { useAxon, useMessages, useSend } from '@axonsdk/mobile';

export function InferenceScreen() {
  const { client, connected, connect } = useAxon({
    provider: 'acurast',
    secretKey: AXON_SECRET_KEY,
  });
  const messages = useMessages(client);
  const { send, sending } = useSend(client);

  return (
    <View>
      <Button title="Connect" onPress={connect} disabled={connected} />
      <Button
        title={sending ? 'Thinking...' : 'Run inference'}
        disabled={!connected || sending}
        onPress={() =>
          send('0xproc...', {
            requestId: crypto.randomUUID(),
            prompt: 'Summarize: The quick brown fox...',
          })
        }
      />
      {messages.map((m, i) => {
        const p = m.payload as { result?: string; error?: string };
        return <Text key={i}>{p.result ?? p.error}</Text>;
      })}
    </View>
  );
}
```

---

## Message format

**Request** (sent to processor):
```json
{ "requestId": "req-001", "prompt": "Your prompt here", "model": "llama3" }
```

**Response** (received from processor):
```json
{ "requestId": "req-001", "result": "The model's response...", "model": "llama3", "timestamp": 1712345678000 }
```

**Error response**:
```json
{ "requestId": "req-001", "error": "LLM API error: rate limit exceeded" }
```
