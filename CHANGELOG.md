# Changelog

All notable changes to the Axon SDK (TypeScript monorepo) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [@axonsdk/sdk@0.2.5] — 2026-04-13

### Added
- **Security:** `packages/sdk/src/utils/security.ts` — centralised SSRF prevention utility
  - `assertSafeUrl()` — async validator with DNS rebinding defence; blocks private ranges including `169.254.x` (AWS EC2 IMDS, Azure IMDS, GCP metadata), RFC-1918, loopback, and IPv6 link-local
  - `assertSafeUrlSync()` — synchronous variant for non-async contexts
- **Security:** `assertSafeUrl` and `assertSafeUrlSync` exported from `@axonsdk/sdk` public API
- **Tests:** `aws.test.ts` — AwsProvider: name, estimate, listDeployments, connect error, deploy error paths
- **Tests:** `gcp.test.ts` — GcpProvider: name, estimate, listDeployments, missing credential errors
- **Tests:** `azure.test.ts` — AzureProvider: name, estimate, listDeployments, missing credential errors
- **Tests:** `cloudflare.test.ts` — CloudflareProvider: name, estimate, listDeployments, missing credential errors
- **Tests:** `flyio.test.ts` — FlyioProvider: name, estimate, listDeployments, missing credential errors
- **Licensing:** Full Apache-2.0 `LICENSE` file with explicit patent grant (replaces MIT)
- **Security policy:** `SECURITY.md` with responsible disclosure policy
- `CHANGELOG.md` — this file

### Changed
- **Turbo:** Migrated `turbo.json` from v1 schema (`pipeline`) to v2 schema (`tasks`)
- **Turbo:** Root `package.json` bumped turbo to `^2.0.6`
- **Vitest:** `packages/mobile` vitest unified to `^4.1.4` (matches `packages/sdk`)
- **TypeScript:** `packages/cli` and `packages/mobile` TypeScript unified to `^5.9.3` (matches `packages/sdk`)
- **Node.js:** Root `package.json` engines updated to `>=20.x` (was `20.x`)
- **CI:** Added Node.js 22 to test matrix (now tests on 20 and 22)
- **CI:** Added `tsc --noEmit` type-check step before build in CI
- **CI:** Added SBOM generation (`anchore/sbom-action`, SPDX format)
- **Repository URLs:** All four `package.json` files corrected from `deyzho/axonsdk` to `deyzho/phonixsdk`

### Fixed
- Removed dev-only scripts from repo: `clean-phonix.ps1`, `commit-msg.txt`, `fix-rename.ps1`

---

## [@axonsdk/inference@0.1.5] — 2026-04-13

### Added
- **Tests:** `handler.test.ts` — full test suite for `AxonInferenceHandler`:
  - Authentication: missing header → 401, wrong key → 401, malformed Bearer → 401, correct key → pass
  - `GET /v1/models` — returns list with `axon-llama-3-70b` and all expected model fields
  - `POST /v1/chat/completions` — invalid JSON → 400, missing `messages` → 400, non-array `messages` → 400
  - Routing: unknown path → 404, error responses always `Content-Type: application/json`

---

## [@axonsdk/sdk@0.2.0] — 2026-04-13

### Added
- AWS Lambda provider (`@axonsdk/sdk`) — SigV4 signing, Lambda Function URL
- GCP Cloud Run provider — RS256 JWT service-account auth (no external library), 55-min token cache
- Azure Container Instances provider — OAuth2 client credentials flow, 55-min token cache
- Cloudflare Workers provider — esbuild bundle + multipart upload
- Fly.io Machines provider — Machine create + stop + force-delete teardown
- `teardown(deploymentId)` on all 10 providers and `AxonClient`
- `axon teardown <id>` CLI command
- `withRetry<T>()` exponential backoff utility (`packages/sdk/src/utils/retry.ts`)
- `getGcpAccessToken()` / `clearGcpTokenCache()` in `packages/sdk/src/providers/gcp/auth.ts`
- `getAzureAccessToken()` / `clearAzureTokenCache()` in `packages/sdk/src/providers/azure/auth.ts`

---

## [@axonsdk/sdk@0.1.0] — 2026-04-05

### Added
- Initial release of the Axon TypeScript SDK
- `AxonClient` — single-provider facade
- `AxonRouter` — multi-provider routing with circuit breaker, health monitor, and scoring strategies
- Five decentralised compute providers: io.net, Akash, Acurast, Fluence, Koii
- `@axonsdk/inference` — OpenAI-compatible inference endpoint
- `@axonsdk/mobile` — React Native / Expo SDK with iOS Keychain / Android Keystore
- `@axonsdk/cli` — `axon init`, `axon auth`, `axon deploy`, `axon run-local`, `axon status`, `axon send`
- Status dashboard (`status/`)
- Deployment templates: inference, oracle
- Example app: Next.js integration
- Apache-2.0 licence across all packages

---

[@axonsdk/sdk@0.2.5]: https://github.com/deyzho/phonixsdk/compare/sdk-v0.2.0...sdk-v0.2.5
[@axonsdk/inference@0.1.5]: https://github.com/deyzho/phonixsdk/compare/inference-v0.1.0...inference-v0.1.5
[@axonsdk/sdk@0.2.0]: https://github.com/deyzho/phonixsdk/compare/sdk-v0.1.0...sdk-v0.2.0
[@axonsdk/sdk@0.1.0]: https://github.com/deyzho/phonixsdk/releases/tag/sdk-v0.1.0
