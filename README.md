# Phonix SDK

**Build edge dApps once. Run them confidentially on decentralised compute networks — no servers, no headaches.**

Phonix is the unified developer platform for building and deploying confidential edge applications across decentralised compute networks. It abstracts the complexity of multiple DePIN providers behind a single, consistent API — supporting [Acurast](https://acurast.com) (237k+ smartphone TEE nodes), [Fluence](https://fluence.network), [Koii](https://koii.network), and [Akash Network](https://akash.network). Call your deployed processors directly from **iOS and Android** apps with `@phonix/mobile`.

> Phonix is to edge compute what Ethers.js is to EVM chains: **one interface, any provider**.

---

## Supported providers

| Provider | Status | Nodes | Runtime | Token |
|---|---|---|---|---|
| [Acurast](https://acurast.com) | ✅ Supported | 237k+ smartphones (TEE) | nodejs, wasm | ACU |
| [Fluence](https://fluence.network) | ✅ Supported | Decentralised serverless cloud | nodejs | FLT |
| [Koii](https://koii.network) | ✅ Supported | Community compute task nodes | nodejs | KOII |
| [Akash Network](https://akash.network) | ✅ Supported | Decentralised container marketplace | nodejs | AKT |

---

## Quick start

### 1. Install the CLI

```bash
npm install -g @phonix/cli
```

### 2. Initialise a new project

```bash
mkdir my-edge-app && cd my-edge-app
phonix init
```

This will prompt you for a project name, provider, and template (inference / oracle / blank), then generate `phonix.json`, `.env`, and `src/index.ts`.

### 3. Configure credentials

```bash
phonix auth
```

The interactive wizard generates and stores all required keys and endpoints for your chosen provider. Your `.env` is automatically added to `.gitignore` and locked to owner-only permissions.

### 4. Test locally

```bash
phonix run-local
```

Runs your script in a local mock environment — simulates WebSocket messages, real HTTPS requests, and the provider runtime API without touching the network.

### 5. Deploy

```bash
phonix deploy
```

Bundles your script, uploads it to IPFS, and registers the deployment on-chain (or submits the SDL to Akash's marketplace).

```
✔ Deployment live!
  Deployment ID: 0xabc123...
  Processors:    3 matched
    • 0xproc1...
    • 0xproc2...
    • 0xproc3...
```

### 6. Call from your dApp

```typescript
import { PhonixClient } from '@phonix/sdk';

const client = new PhonixClient({
  provider: 'acurast', // 'acurast' | 'fluence' | 'koii' | 'akash'
  secretKey: process.env.PHONIX_SECRET_KEY,
});

await client.connect();

client.onMessage((msg) => {
  const { result } = msg.payload as { result: string };
  console.log('Result:', result);
});

await client.send('0xproc1...', {
  requestId: 'req-001',
  prompt: 'Summarize: The quick brown fox...',
});

client.disconnect();
```

---

## CLI reference

| Command | Description |
|---|---|
| `phonix init` | Interactive setup — generates `phonix.json`, `.env`, and template files |
| `phonix auth [provider]` | Credential wizard — generates and stores keys for the selected provider |
| `phonix deploy` | Bundle, upload to IPFS, and register deployment |
| `phonix run-local` | Run your script locally with a mock provider runtime |
| `phonix status` | List deployments, processor IDs, and live status |
| `phonix send <id> <msg>` | Send a test message to a processor node |
| `phonix template list` | Show available built-in templates |

Supported values for `[provider]`: `acurast`, `fluence`, `koii`, `akash`

---

## SDK reference

```typescript
import { PhonixClient } from '@phonix/sdk';
import type { DeploymentConfig } from '@phonix/sdk';

const client = new PhonixClient({
  provider: 'akash',  // 'acurast' | 'fluence' | 'koii' | 'akash'
  secretKey: process.env.PHONIX_SECRET_KEY,
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
// e.g. "Estimated: 6000000000 AKT" (in uAKT)

// Deploy
const deployment = await client.deploy({
  runtime: 'nodejs',
  code: './dist/index.js',
  schedule: { type: 'on-demand', durationMs: 86_400_000 },
  replicas: 1,
});

// List deployments
const deployments = await client.listDeployments();

// Send a message to a processor / container
await client.send(deployment.processorIds[0], { prompt: 'Hello' });

// Receive results
const unsubscribe = client.onMessage((msg) => {
  console.log(msg.payload);
});

client.disconnect();
```

---

## Mobile SDK (iOS & Android)

`@phonix/mobile` is a React Native / Expo package that lets you call your deployed Phonix processors directly from iOS and Android apps.

```bash
npm install @phonix/mobile
```

### Quick start — Expo / React Native

```tsx
// App.tsx — wrap your root once
import { PhonixProvider } from '@phonix/mobile';

export default function App() {
  return (
    <PhonixProvider provider="akash" secretKey={PHONIX_SECRET_KEY} autoConnect>
      <NavigationContainer>
        <MainStack />
      </NavigationContainer>
    </PhonixProvider>
  );
}

// AnyScreen.tsx — access from anywhere in the tree
import { usePhonixContext, useMessages, useSend } from '@phonix/mobile';

export function InferenceScreen() {
  const { client, connected } = usePhonixContext();
  const messages = useMessages(client);
  const { send, sending } = useSend(client);

  return (
    <View>
      <Text>{connected ? '🟢 Live' : '⚪ Offline'}</Text>
      <Button
        title={sending ? 'Sending...' : 'Run inference'}
        onPress={() => send(AKASH_LEASE_URL, { prompt: 'Hello from iOS!' })}
      />
      {messages.map((m, i) => (
        <Text key={i}>{JSON.stringify(m.payload)}</Text>
      ))}
    </View>
  );
}
```

### Without context — standalone hooks

```tsx
import { usePhonix, useMessages } from '@phonix/mobile';

function Screen() {
  const { client, connected, connect, error } = usePhonix({
    provider: 'akash',
    secretKey: PHONIX_SECRET_KEY,
  });
  const messages = useMessages(client);

  return <Button title="Connect" onPress={connect} disabled={connected} />;
}
```

### Secure key storage

```tsx
import { SecureKeyStorage } from '@phonix/mobile';

const storage = new SecureKeyStorage();
await storage.saveSecretKey(myKey); // iOS Keychain / Android Keystore
const key = await storage.loadSecretKey();
```

### Mobile API

| Export | Description |
|---|---|
| `MobilePhonixClient` | Messaging-only client (no deploy/esbuild, works in Hermes/JSC) |
| `usePhonix(options)` | Hook — manages client lifecycle, returns `{ client, connected, connect, disconnect, error }` |
| `useMessages(client)` | Hook — subscribes to messages, returns reactive `Message[]` array (newest first) |
| `useSend(client)` | Hook — wraps `client.send()` with `sending` / `sendError` state |
| `PhonixProvider` | React context — provides client to the full component tree |
| `usePhonixContext()` | Consumes the PhonixProvider context |
| `SecureKeyStorage` | Persists keys via iOS Keychain / Android Keystore (`expo-secure-store`) |

**Supported providers in `@phonix/mobile`:** `'akash'` (HTTP), `'acurast'` (WebSocket), `'http'` (generic HTTPS)

> Deploy your processors with `phonix deploy` on your development machine. The mobile SDK handles calling them — not deploying.

---

## Provider setup

### Acurast

```bash
phonix auth acurast
```

Requires a Polkadot-compatible wallet mnemonic (12 or 24 words) and an IPFS endpoint. Get a wallet at [console.acurast.com](https://console.acurast.com) and testnet tokens at [faucet.acurast.com](https://faucet.acurast.com).

**Required `.env` keys:** `ACURAST_MNEMONIC`, `ACURAST_IPFS_URL`, `ACURAST_IPFS_API_KEY`

---

### Fluence

```bash
phonix auth fluence
```

Requires an EVM-compatible private key (hex). The wizard generates one automatically and prints the address so you can fund it.

**Required `.env` keys:** `FLUENCE_PRIVATE_KEY`, `FLUENCE_RELAY_ADDR`, `FLUENCE_NETWORK`

---

### Koii

```bash
phonix auth koii
```

Requires a Solana-compatible keypair (base58). The wizard generates one automatically.

**Required `.env` keys:** `KOII_PRIVATE_KEY`, `KOII_IPFS_URL`, `KOII_NETWORK`

---

### Akash Network

```bash
phonix auth akash
```

Requires a BIP-39 wallet mnemonic (12 or 24 words) and an IPFS endpoint. The wizard stores your mnemonic and configures the RPC node and chain ID automatically.

**Required `.env` keys:** `AKASH_MNEMONIC`, `AKASH_IPFS_URL`

**Optional `.env` keys:** `AKASH_IPFS_API_KEY`, `AKASH_NODE` (default: `https://rpc.akashnet.net:443`), `AKASH_CHAIN_ID` (default: `akashnet-2`), `AKASH_KEY_NAME` (default: `phonix`)

**Prerequisite:** The `provider-services` CLI must be installed:
```bash
# Install Akash provider-services CLI
curl https://raw.githubusercontent.com/akash-network/provider/main/script/install.sh | bash
```
Docs: [docs.akash.network/guides/cli/akash-provider-services](https://docs.akash.network/guides/cli/akash-provider-services)

**How it works:**
1. Your TypeScript entry file is bundled with esbuild
2. The bundle is uploaded to IPFS — the CID is the immutable source of truth
3. An Akash SDL (Stack Definition Language) is generated with `node:20-alpine`, the CID embedded as `BUNDLE_CID`, and your env vars
4. `provider-services tx deployment create` submits the SDL to the Akash marketplace
5. A winning provider bids and spins up the container, which fetches the bundle from IPFS at startup and runs it

---

## Templates

| Template | Description |
|---|---|
| [`inference`](./templates/inference) | Confidential LLM inference — receive prompts, call an OpenAI-compatible API, return results privately inside a TEE |
| [`oracle`](./templates/oracle) | Data oracle — fetch external data on a schedule, sign it inside the TEE, push to on-chain destinations |
| `blank` | Empty project with full provider runtime type declarations |

---

## `phonix.json` reference

```json
{
  "projectName": "my-edge-app",
  "provider": "akash",
  "runtime": "nodejs",
  "entryFile": "src/index.ts",
  "schedule": {
    "type": "on-demand",
    "durationMs": 86400000
  },
  "replicas": 1,
  "maxCostPerExecution": 10000,
  "environment": {
    "MY_VAR": "my-value"
  },
  "destinations": []
}
```

| Field | Type | Description |
|---|---|---|
| `projectName` | `string` | Human-readable project name |
| `provider` | `acurast \| fluence \| koii \| akash` | Target compute provider |
| `runtime` | `nodejs \| python \| docker \| wasm` | Execution runtime |
| `entryFile` | `string` | Path to your script entry point |
| `schedule.type` | `on-demand \| interval \| onetime` | When the script runs |
| `schedule.intervalMs` | `number` | Milliseconds between runs (interval only) |
| `schedule.durationMs` | `number` | Total deployment lifetime in ms |
| `replicas` | `number` | Number of processor nodes / container replicas |
| `maxCostPerExecution` | `number` | Cost cap per run (in provider micro-units: uACU, uAKT, etc.) |
| `environment` | `object` | Key-value pairs injected into your script at bundle time |
| `destinations` | `string[]` | On-chain addresses to push results to |

---

## Project structure

```
phonix/
├── packages/
│   ├── cli/          # @phonix/cli — command-line tool
│   └── sdk/          # @phonix/sdk — core library
│       └── src/
│           ├── providers/
│           │   ├── acurast/  # Acurast provider
│           │   ├── fluence/  # Fluence provider
│           │   ├── koii/     # Koii provider
│           │   └── akash/    # Akash Network provider
│           └── runtime/
│               └── adapters/ # Per-provider runtime bootstraps
├── templates/
│   ├── inference/    # Confidential LLM inference
│   └── oracle/       # Data oracle
└── examples/
    └── nextjs-app/   # Example Next.js integration
```

---

## Development

```bash
# Clone
git clone https://github.com/deyzho/phonix.git
cd phonix

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Watch mode during development
cd packages/sdk && npm run dev
```

### Running tests

```bash
cd packages/sdk
npx vitest run
```

135 tests covering config loading and validation, runtime bootstrap generation for all four providers, provider client construction and SSRF protection, cost estimation, message handler registration, SDL generation (Akash), disconnect lifecycle, mobile client SSRF/validation, and SecureKeyStorage.

---

## Security

Phonix is designed to protect both developers and end users:

- **Secrets never leave `.env`** — the auth wizard generates keys locally and stores them with `chmod 600`. They are never logged or transmitted.
- **esbuild injection guard** — the deploy pipeline rejects any `environment` key that looks like a secret (`_KEY`, `_SECRET`, `_TOKEN`, `_MNEMONIC`, `_PASSWORD`) to prevent accidental bundle-time embedding of credentials.
- **SSRF protection** — all HTTP calls (IPFS upload, Akash lease endpoints, Koii task nodes) validate URLs against a private-IP blocklist and enforce HTTPS.
- **DNS rebinding defence** — the local mock runtime resolves hostnames to IPs via `dns.lookup()` before opening any TCP connection, then re-validates the resolved IP against the blocklist.
- **Prototype pollution prevention** — remote JSON payloads are parsed with key blocklisting (`__proto__`, `constructor`, `prototype`) and `phonix.json` environment maps use `Object.create(null)`.
- **Response size caps** — all provider clients enforce a 1 MiB cap on remote responses; the mock runtime enforces a 4 MiB cap on HTTP bodies.
- **SDL path traversal guard** — Akash deploy validates that the entry file path cannot escape the project directory before bundling.

---

## Contributing

Pull requests are welcome. To get started:

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `npm test` and ensure all tests pass
4. Open a pull request with a clear description

High-impact areas:
- Integration tests against Acurast testnet and Akash sandbox
- Additional provider support (Bacalhau, Render Network)
- Template marketplace

---

## License

MIT — see [LICENSE](./LICENSE).

---

*Phonix is not affiliated with Acurast, Fluence, Koii, or Akash Network. Provider names and trademarks belong to their respective owners.*
