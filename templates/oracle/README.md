# Phonix Oracle Template

A data oracle that fetches external data on a schedule, signs it inside a Trusted Execution Environment (TEE), and pushes it to configured destinations — running privately on Acurast smartphone nodes.

## What this does

- Fetches Bitcoin and Ethereum prices from CoinGecko every 60 seconds
- Signs the result inside the TEE (tamper-proof)
- Pushes the signed data to your configured on-chain destinations
- Verifiable on-chain — consumers can check the processor's signature

## Quick deploy

```bash
# 1. Copy this template
cp -r templates/oracle my-oracle
cd my-oracle

# 2. Set up Acurast credentials (one-time)
phonix auth acurast

# 3. Configure your destination (e.g. a smart contract address)
#    Edit phonix.json → "destinations": ["0xYourContractAddress"]

# 4. Test locally first
phonix run-local

# 5. Deploy
phonix deploy
```

## Configuration

Edit `phonix.json`:

| Field | Default | Description |
|---|---|---|
| `provider` | `"acurast"` | Compute provider — see [other providers](#other-providers) below |
| `schedule.intervalMs` | `60000` | Fetch interval (60 seconds) |
| `schedule.durationMs` | `2592000000` | Deployment lifetime (30 days) |
| `replicas` | `1` | Number of processor nodes |
| `destinations` | `[]` | On-chain addresses to push signed results to |

## Changing the data source

Edit `src/index.ts` and update the feed URL:

```typescript
// Bitcoin dominance from CoinGecko
const DOMINANCE_URL = 'https://api.coingecko.com/api/v3/global';

// ETH gas price from Etherscan
const GAS_URL = 'https://api.etherscan.io/api?module=gastracker&action=gasoracle';

// Weather data from Open-Meteo (no API key required)
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=48.8&longitude=2.3&current_weather=true';
```

All URLs must be `https://` — the runtime blocks plain HTTP and private IP ranges.

---

## Other providers

This template targets Acurast by default (TEE-signed results). You can deploy to other providers by changing the `provider` field in `phonix.json`:

| Provider | Best for | Auth |
|---|---|---|
| `acurast` | TEE-signed results, on-chain destinations | `phonix auth acurast` |
| `akash` | Long-running containers, cost control | `phonix auth akash` |
| `fluence` | P2P serverless, Ethereum-native | `phonix auth fluence` |
| `koii` | Community compute, recurring tasks | `phonix auth koii` |

> **Note:** TEE-signed results (verifiable on-chain) are only available with the Acurast provider.

---

## Reading oracle data

### From a smart contract (Acurast Consumer Protocol)

See the [Acurast Consumer documentation](https://docs.acurast.com/developers/substrate-consumer) for integrating the signed result into your on-chain contract.

### From a Node.js / Next.js backend

```typescript
import { PhonixClient } from '@axonsdk/sdk';

const client = new PhonixClient({
  provider: 'acurast',
  secretKey: process.env.PHONIX_SECRET_KEY,
});

await client.connect();

client.onMessage((msg) => {
  const { btcUsd, ethUsd, timestamp } = msg.payload as {
    btcUsd: number;
    ethUsd: number;
    timestamp: number;
  };
  console.log(`BTC: $${btcUsd} | ETH: $${ethUsd} at ${new Date(timestamp).toISOString()}`);
});
```

### From an iOS or Android app (React Native / Expo)

```tsx
import { usePhonix, useMessages } from '@axonsdk/mobile';

export function PriceFeedScreen() {
  const { client, connected, connect } = usePhonix({
    provider: 'acurast',
    secretKey: PHONIX_SECRET_KEY,
    autoConnect: true,
  });
  const messages = useMessages(client, { maxMessages: 10 });

  return (
    <View>
      <Text style={{ color: connected ? 'green' : 'gray' }}>
        {connected ? '● Live' : '○ Connecting...'}
      </Text>
      {messages.map((m, i) => {
        const { btcUsd, ethUsd, timestamp } = m.payload as {
          btcUsd: number;
          ethUsd: number;
          timestamp: number;
        };
        return (
          <View key={i}>
            <Text>BTC ${btcUsd.toLocaleString()}</Text>
            <Text>ETH ${ethUsd.toLocaleString()}</Text>
            <Text style={{ color: 'gray', fontSize: 11 }}>
              {new Date(timestamp).toLocaleTimeString()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
```

---

## Output format

Each oracle tick produces a message with this payload:

```json
{
  "btcUsd": 67432.15,
  "ethUsd": 3521.88,
  "timestamp": 1712345678000,
  "signature": "0x..."
}
```

The `signature` field is the TEE processor's Ed25519 signature over the data — verifiable against the processor's public key (`msg.from`).
