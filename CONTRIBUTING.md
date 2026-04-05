# Contributing to Phonix

Thank you for your interest in contributing! Phonix is an open-source project and all contributions are welcome — from bug reports and docs fixes to new providers and templates.

---

## Getting started

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/phonix.git
cd phonix

# Install dependencies
npm install

# Build all packages
npm run build

# Run the full test suite
cd packages/sdk && npx vitest run
cd packages/mobile && npx vitest run
```

---

## Project structure

```
phonix/
├── packages/
│   ├── sdk/          # @phonixsdk/sdk — core TypeScript library
│   │   └── src/
│   │       ├── providers/
│   │       │   ├── acurast/   # Acurast TEE smartphone network
│   │       │   ├── fluence/   # Fluence decentralised cloud
│   │       │   ├── koii/      # Koii community compute
│   │       │   └── akash/     # Akash container marketplace
│   │       └── runtime/
│   │           └── adapters/  # Per-provider runtime bootstraps
│   ├── cli/          # @phonixsdk/cli — command-line tool (Commander.js)
│   └── mobile/       # @phonixsdk/mobile — React Native / Expo SDK
├── templates/
│   ├── inference/    # Confidential LLM inference template
│   └── oracle/       # Price feed oracle template
└── examples/
    └── nextjs-app/   # Next.js integration example
```

---

## Making changes

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes** — keep commits focused and descriptive.

3. **Add or update tests** for any new behaviour:
   - SDK changes → `packages/sdk/src/__tests__/`
   - Mobile changes → `packages/mobile/src/__tests__/`

4. **Run the test suite** and ensure all tests pass:
   ```bash
   # SDK (104 tests)
   cd packages/sdk && npx vitest run

   # Mobile (31 tests)
   cd packages/mobile && npx vitest run
   ```

5. **Open a pull request** against `main` with a clear title and description of what changed and why.

---

## Adding a new provider

Each provider lives in `packages/sdk/src/providers/<name>/` and must:

1. **Implement `IPhonixProvider`** (`packages/sdk/src/providers/base.ts`):
   - `connect(secretKey)` / `disconnect()`
   - `deploy(config)` → `Deployment`
   - `estimate(config)` → `CostEstimate`
   - `listDeployments()` → `Deployment[]`
   - `send(processorId, payload)` → `void`
   - `onMessage(handler)` → unsubscribe function
   - `readonly name: ProviderName`

2. **Write a runtime adapter** in `packages/sdk/src/runtime/adapters/<name>.ts` that returns a JavaScript preamble string defining `globalThis.phonix`.

3. **Wire it in** (all of these must be updated):
   - `packages/sdk/src/types.ts` — add to `ProviderName` union
   - `packages/sdk/src/runtime/index.ts` — add `case` to `generateRuntimeBootstrap()`
   - `packages/sdk/src/client.ts` — add `case` to `createProvider()`
   - `packages/sdk/src/config.ts` — add to `VALID_PROVIDERS` and `generateEnv()`
   - `packages/sdk/src/index.ts` — export the provider class
   - `packages/cli/src/commands/auth.ts` — add `run<Name>Auth()` wizard and add to provider list
   - `packages/cli/src/index.ts` — update auth command description

4. **Write tests** in `packages/sdk/src/__tests__/<name>.test.ts` covering:
   - `estimate()` returns a `CostEstimate` with the right token
   - `listDeployments()` returns an array (including when CLI is absent)
   - `onMessage()` returns an unsubscribe function
   - Client SSRF protection (if applicable)

5. **Update `@phonixsdk/mobile`** if the provider can be called from a mobile app (add to `MobileProviderName`).

---

## Areas where contributions are most welcome

- **Integration tests** against live Acurast testnet and Akash sandbox
- **New provider support** — Bacalhau, Render Network, Lilypad
- **Template library** — additional ready-to-deploy templates (web scraper, AI agent, ML pipeline)
- **Mobile examples** — Expo Snack examples, React Native starter
- **Documentation** — guides, examples, and API reference improvements
- **Bug reports** — clear reproduction steps with OS, Node.js version, and provider name

---

## Code style

- **TypeScript throughout** — no untyped `any` unless truly unavoidable; use `unknown` + type guards instead
- **Keep functions small and single-purpose** — prefer composition over long imperative blocks
- **Security-sensitive code** (key handling, network requests, JSON parsing) must include comments explaining the threat being mitigated
- **No `console.log` in library code** — use the provider's `print` global or throw a typed `PhonixError`
- **SSRF protection is required** for any code that makes outbound HTTP calls based on user-supplied URLs — validate against `PRIVATE_HOST_RE` and enforce `https://`
- **Prototype pollution prevention** — use `Object.create(null)` for maps built from untrusted input; block `__proto__`, `constructor`, `prototype` keys in JSON parsers

---

## Running a specific package's tests

```bash
# Core SDK
cd packages/sdk
npx vitest run

# Mobile package
cd packages/mobile
npx vitest run

# Watch mode during development
cd packages/sdk
npx vitest
```

---

## Reporting security issues

Please do **not** open a public GitHub issue for security vulnerabilities. Instead, email the maintainer directly so the issue can be assessed and a fix prepared before public disclosure. Include:

- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested mitigations

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
