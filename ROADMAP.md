# Phonix Roadmap

This document outlines the planned direction for Phonix. Priorities may shift based on community feedback.

---

## v0.2 — Current release

- ✅ Acurast provider — full deploy, messaging, and runtime adapter
- ✅ Fluence provider — deploy via CLI shell-out, P2P messaging via `@fluencelabs/js-client`
- ✅ Koii provider — deploy via CLI shell-out, HTTP task node messaging
- ✅ **Akash Network provider** — containerised deployments via SDL + IPFS bundle distribution; HTTP lease messaging; `phonix auth akash` wizard
- ✅ Provider-agnostic runtime bootstrap (`phonix.*` global injected at bundle time)
- ✅ `phonix auth` — interactive credential wizard for all four providers
- ✅ `phonix run-local` — local mock runtime with SSRF and DNS rebinding protection
- ✅ Inference template — real OpenAI-compatible LLM inference in TEE
- ✅ Oracle template — scheduled price feed with TEE-signed results
- ✅ Security hardening — prototype pollution prevention, key validation, response caps, SDL path traversal guard
- ✅ **`@phonix/mobile`** — React Native / Expo SDK with `usePhonix`, `useMessages`, `useSend` hooks; `PhonixProvider` context; iOS Keychain / Android Keystore via `expo-secure-store`; AppState lifecycle management
- ✅ Full test suite — 135 tests across all providers and core modules (SDK + mobile)

---

## v0.3 — Next

- [ ] **`phonix logs`** — stream processor stdout from deployed scripts
- [ ] **`phonix update`** — redeploy an existing deployment with new code
- [ ] **`phonix stop`** — cancel an active deployment
- [ ] **Acurast testnet CI** — integration tests running against a live Acurast testnet node in GitHub Actions
- [ ] **Vitest coverage report** — add coverage thresholds to the CI pipeline
- [ ] **`phonix template publish`** — allow community members to publish templates to a registry

---

## v0.4 — Provider expansion

- [ ] **Bacalhau** provider — distributed Docker/WASM compute jobs
- [ ] **Multi-provider deploy** — deploy to multiple providers simultaneously with a single command and unified status view
- [ ] **Akash persistent leases** — auto-renew bids and monitor lease health with `phonix status`

---

## v0.5 — Developer experience

- [ ] **phonix.dev documentation site** — full API reference, guides, and interactive examples
- [ ] **VSCode extension** — syntax highlighting for `phonix.json`, inline cost estimates, one-click deploy
- [ ] **Dashboard** — web UI for managing deployments across all providers
- [ ] **Template marketplace** — browse and install community templates

---

## Long-term

- **Streaming results** — push-based result delivery without polling
- **Multi-sig deployments** — require approval from multiple keys before a deployment goes live
- **On-chain result verification** — verify TEE-signed results from smart contracts
- **Python runtime support** — deploy Python scripts to providers that support it

---

## Versioning policy

Phonix follows [Semantic Versioning](https://semver.org). The public API is the `PhonixClient` interface in `@phonix/sdk` and the `phonix` CLI commands. Breaking changes to either will increment the major version.
