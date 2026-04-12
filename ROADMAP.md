# Axon SDK Roadmap

Priorities may shift based on community feedback and provider availability.

---

## v0.2 — Current release

- ✅ io.net provider — GPU clusters (A100, H100, RTX), job submission, HTTP messaging
- ✅ Acurast provider — full deploy, TEE messaging, and runtime adapter
- ✅ Fluence provider — deploy via CLI, P2P messaging
- ✅ Koii provider — deploy via CLI, HTTP task node messaging
- ✅ Akash Network provider — container deployments via SDL + IPFS bundle distribution; HTTP lease messaging
- ✅ Provider-agnostic runtime bootstrap (`axon.*` global injected at bundle time)
- ✅ `axon auth` — interactive credential wizard for all providers
- ✅ `axon run-local` — local mock runtime with SSRF and DNS rebinding protection
- ✅ `@axonsdk/inference` — OpenAI-compatible inference handler with latency-based routing
- ✅ Inference template — LLM inference with private execution option
- ✅ Oracle template — scheduled data feed with signed results
- ✅ Security hardening — input validation, prototype pollution prevention, response caps, path traversal guard, `chmod 600` on secrets
- ✅ `@axonsdk/mobile` — React Native / Expo SDK with `useAxon`, `useMessages`, `useSend` hooks; `AxonProvider` context; iOS Keychain / Android Keystore; AppState lifecycle management
- ✅ Python SDK — `axon` PyPI package with async client, multi-provider router, CLI, and cloud provider extras
- ✅ Full test suite — 135+ tests across all providers and core modules

---

## v0.3 — Next

- [ ] **`axon logs`** — stream processor stdout from deployed scripts
- [ ] **`axon update`** — redeploy an existing deployment with new code
- [ ] **`axon stop`** — cancel an active deployment
- [ ] **Live provider CI** — integration tests running against provider sandboxes in GitHub Actions
- [ ] **Coverage report** — add coverage thresholds to the CI pipeline
- [ ] **`axon template publish`** — allow community members to publish templates to a registry
- [ ] **AWS provider** — Lambda and ECS support
- [ ] **Cloudflare Workers provider** — Workers and AI Gateway support

---

## v0.4 — LLM routing

- [ ] **`@axonsdk/llm`** — unified LLM client routing across Claude, Gemini, GPT-4, and self-hosted models
- [ ] **Multi-provider deploy** — deploy to multiple providers simultaneously with a single command
- [ ] **Persistent leases** — auto-renew and monitor long-running deployments
- [ ] **Bring your own model** — route to self-hosted open-source models on your own compute alongside hosted APIs

---

## v0.5 — Developer experience

- [ ] **Documentation site** — full API reference, guides, and interactive examples
- [ ] **VSCode extension** — inline cost estimates and one-click deploy
- [ ] **Dashboard** — web UI for managing deployments and viewing routing analytics across all providers
- [ ] **Template marketplace** — browse and install community templates

---

## Long-term

- **Streaming results** — push-based result delivery without polling
- **Cost analytics** — per-request cost breakdown and optimisation recommendations
- **SLA routing** — route based on latency SLA targets, not just current metrics
- **Python runtime support** — deploy Python scripts to all providers that support it

---

## Versioning policy

Axon follows [Semantic Versioning](https://semver.org). The public API is the `AxonClient` interface in `@axonsdk/sdk` and the `axon` CLI commands. Breaking changes to either will increment the major version.
