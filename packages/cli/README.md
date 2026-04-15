# @axonsdk/cli

> Command-line tool for deploying and managing Axon edge applications across DePIN networks.

[![npm](https://img.shields.io/npm/v/@axonsdk/cli)](https://www.npmjs.com/package/@axonsdk/cli)
[![license](https://img.shields.io/npm/l/@axonsdk/cli)](./LICENSE)

## Installation

```bash
npm install -g @axonsdk/cli
```

Requires **Node.js ≥ 20**.

## Commands

| Command | Description |
|---|---|
| `axon init` | Interactive project setup — generates `axon.json`, `.env`, and template files |
| `axon auth [provider]` | Credential wizard — generates and stores provider keys securely |
| `axon deploy` | Bundle, upload to IPFS, and register your deployment on-chain |
| `axon run-local` | Run your script locally with a full mock provider runtime |
| `axon status` | List deployments, processor IDs, and live status |
| `axon send <id> <msg>` | Send a test message directly to a processor node |

## Quick start

```bash
# 1. Create a new project
axon init

# 2. Set up credentials for your chosen provider
axon auth acurast    # or: akash | fluence | koii

# 3. Test locally before spending tokens
axon run-local

# 4. Deploy to the network
axon deploy

# 5. Check your deployment
axon status

# 6. Send a test message
axon send <deployment-id> '{"prompt":"Hello"}'
```

## Supported providers

| Provider | Auth command | Requires |
|---|---|---|
| **io.net** | `axon auth ionet` | io.net API key |
| **Acurast** | `axon auth acurast` | Polkadot wallet mnemonic, IPFS endpoint |
| **Akash Network** | `axon auth akash` | Cosmos wallet mnemonic |
| **Fluence** | `axon auth fluence` | Fluence hex private key |
| **Koii** | `axon auth koii` | Koii wallet keypair |

## Documentation

Full docs at [axonsdk.dev](https://axonsdk.dev) · [GitHub](https://github.com/deyzho/phonixsdk)

## License

Apache-2.0 © [Axon](https://axonsdk.dev)
