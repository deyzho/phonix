/**
 * Akash deployment helper.
 *
 * Flow:
 *  1. Bundle the user's entry file with esbuild (Akash runtime bootstrap prepended)
 *  2. Upload the bundle to IPFS → get CID
 *  3. Generate an SDL (Stack Definition Language) YAML that downloads the
 *     bundle from IPFS at container startup and runs it with Node.js
 *  4. Shell out to the `provider-services` CLI to create the deployment
 *  5. Parse the DSEQ (deployment sequence) and lease URL from CLI output
 *  6. Return a Deployment object
 *
 * SDL design:
 *  The generated SDL uses the official `node:20-alpine` image and a startup
 *  command that fetches the bundle from IPFS and runs it. This means the
 *  container does not need to be rebuilt when code changes — only the IPFS
 *  upload and a new deployment are required.
 *
 * Required credentials (in .env):
 *   AKASH_MNEMONIC       — 12 or 24-word BIP-39 mnemonic for the Akash wallet
 *   AKASH_IPFS_URL       — IPFS API endpoint for uploading bundles
 *   AKASH_IPFS_API_KEY   — IPFS API key
 *   AKASH_NODE           — Akash RPC node (optional, defaults to mainnet)
 *   AKASH_NET            — mainnet | testnet (optional, defaults to mainnet)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeploymentConfig, Deployment } from '../../types.js';
import { generateRuntimeBootstrap } from '../../runtime/index.js';
import { bundleEntryFile } from '../acurast/deploy.js';

const execFileAsync = promisify(execFile);

const DEFAULT_AKASH_NODE = 'https://rpc.akashnet.net:443';
const DEFAULT_AKASH_CHAIN_ID = 'akashnet-2';

// ─── IPFS upload ──────────────────────────────────────────────────────────────

/**
 * Upload a bundle to IPFS and return its CID.
 * Uses the same Kubo (go-ipfs) HTTP API as the Acurast provider.
 *
 * SECURITY: The IPFS URL is validated to block SSRF via internal endpoints.
 * Only https:// URLs are accepted; private IP ranges are rejected.
 */
async function uploadToIpfs(
  content: string,
  ipfsUrl: string,
  apiKey: string
): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(ipfsUrl);
  } catch {
    throw new Error(`Invalid AKASH_IPFS_URL: "${ipfsUrl}"`);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      `AKASH_IPFS_URL must use https:// to protect bundle uploads in transit. Got: "${parsedUrl.protocol}"`
    );
  }

  const PRIVATE_HOST_RE =
    /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;
  if (PRIVATE_HOST_RE.test(parsedUrl.hostname)) {
    throw new Error(
      `AKASH_IPFS_URL hostname "${parsedUrl.hostname}" resolves to a private address — blocked to prevent SSRF.`
    );
  }

  const uploadUrl = `${ipfsUrl.replace(/\/$/, '')}/api/v0/add?pin=true`;
  const boundary = `phonix-${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="bundle.js"\r\n` +
    `Content-Type: application/javascript\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(
      `IPFS upload failed (${response.status}): ${await response.text()}`
    );
  }

  const result = await response.json() as { Hash?: string; Name?: string };
  const cid = result.Hash;
  if (!cid) {
    throw new Error('IPFS API did not return a CID in the response');
  }
  return cid;
}

// ─── SDL generation ───────────────────────────────────────────────────────────

/**
 * Generate an Akash SDL (Stack Definition Language) YAML for an AxonSDK deployment.
 *
 * The container downloads the bundle from IPFS at startup using wget and runs
 * it with Node.js. Environment variables are injected via the SDL env block.
 *
 * Resources are kept minimal for cost efficiency; increase via replicas or
 * a custom SDL for production workloads.
 */
export function generateAkashSdl(options: {
  bundleCid: string;
  environment?: Record<string, string>;
  replicas?: number;
  maxUaktPerBlock?: number;
  projectName?: string;
}): string {
  const {
    bundleCid,
    environment = {},
    replicas = 1,
    maxUaktPerBlock = 10_000,
    projectName = 'phonix-app',
  } = options;

  // Service name must be lowercase alphanumeric + hyphens
  const serviceName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'phonix-app';

  // Build env block — each entry as "KEY=value"
  const envLines = [
    `- NODE_ENV=production`,
    `- BUNDLE_CID=${bundleCid}`,
    ...Object.entries(environment).map(([k, v]) => `- ${k}=${v}`),
  ].join('\n      ');

  return `---
version: "2.0"

services:
  ${serviceName}:
    image: node:20-alpine
    env:
      ${envLines}
    command:
      - sh
      - -c
      - >-
        apk add --no-cache wget &&
        mkdir -p /app &&
        wget -qO /app/bundle.js https://dweb.link/ipfs/$BUNDLE_CID &&
        node /app/bundle.js
    expose:
      - port: 3000
        as: 80
        to:
          - global: true

profiles:
  compute:
    ${serviceName}:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 1Gi
  placement:
    akash:
      signedBy:
        anyOf:
          - "akash1365yvmc4s7awdyj3n2sav7xfx76adc6dnmlx63"
      pricing:
        ${serviceName}:
          denom: uakt
          amount: ${maxUaktPerBlock}

deployment:
  ${serviceName}:
    akash:
      profile: ${serviceName}
      count: ${replicas}
`;
}

// ─── CLI helpers ──────────────────────────────────────────────────────────────

/**
 * Build a minimal child process environment that inherits only safe,
 * non-sensitive variables from the parent process. Sensitive credentials
 * are passed explicitly via `extra` and are never inherited from the full
 * process.env spread.
 */
function buildMinimalEnv(extra: Record<string, string>): Record<string, string> {
  const inherited: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'USER', 'USERPROFILE', 'TERM', 'LANG', 'TMP', 'TEMP', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) {
    if (process.env[key]) inherited[key] = process.env[key]!;
  }
  return { ...inherited, ...extra };
}

async function resolveAkashCli(): Promise<string> {
  // Try `provider-services` first (newer Akash CLI), fall back to `akash`
  for (const bin of ['provider-services', 'akash']) {
    try {
      await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin], {
        timeout: 5_000,
      });
      return bin;
    } catch {
      // not found, try next
    }
  }
  throw new Error(
    'Akash CLI not found. Install provider-services:\n' +
      '  https://docs.akash.network/guides/cli/akash-provider-services'
  );
}

async function runAkashCli(
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  const cliPath = await resolveAkashCli();
  const mergedEnv = buildMinimalEnv(env ?? {});
  try {
    const { stdout } = await execFileAsync(cliPath, args, {
      env: mergedEnv,
      timeout: 120_000,
    });
    return stdout;
  } catch (err) {
    const execErr = err as { message: string; stderr?: string };
    const detail = execErr.stderr ? `\nstderr: ${execErr.stderr}` : '';
    throw new Error(`Akash CLI failed: ${execErr.message}${detail}`);
  } finally {
    // Overwrite sensitive values in the env dict — best-effort,
    // GC may have already collected the strings, but limits window.
    if (mergedEnv['AKASH_MNEMONIC']) {
      mergedEnv['AKASH_MNEMONIC'] = '\x00'.repeat(mergedEnv['AKASH_MNEMONIC'].length);
    }
  }
}

// ─── Output parsing ───────────────────────────────────────────────────────────

function parseDseq(output: string): string {
  // Look for "dseq: 12345678" or "deployment_sequence: 12345678"
  const match = output.match(/(?:dseq|deployment[_\s]seq(?:uence)?)[:\s]+(\d+)/i);
  if (match) return match[1];
  // Fallback: any long standalone integer
  const numMatch = output.match(/\b(\d{7,})\b/);
  if (numMatch) return numMatch[1];
  return createHash('sha256').update(output).digest('hex').slice(0, 16);
}

function parseLeaseEndpoint(output: string): string | undefined {
  // Look for https:// URLs that look like lease endpoints
  const match = output.match(/https?:\/\/[a-zA-Z0-9.\-]+(:\d+)?/);
  return match ? match[0] : undefined;
}

// ─── Main functions ───────────────────────────────────────────────────────────

export interface AkashDeployOptions {
  config: DeploymentConfig;
  cwd?: string;
  mnemonic?: string;
  ipfsUrl?: string;
  ipfsApiKey?: string;
  akashNode?: string;
  keyName?: string;
}

export async function akashDeploy(options: AkashDeployOptions): Promise<Deployment> {
  const { config, cwd = process.cwd() } = options;

  const mnemonic = options.mnemonic ?? process.env['AKASH_MNEMONIC'] ?? '';
  const ipfsUrl = options.ipfsUrl ?? process.env['AKASH_IPFS_URL'] ?? process.env['ACURAST_IPFS_URL'] ?? '';
  const ipfsApiKey = options.ipfsApiKey ?? process.env['AKASH_IPFS_API_KEY'] ?? process.env['ACURAST_IPFS_API_KEY'] ?? '';
  const akashNode = options.akashNode ?? process.env['AKASH_NODE'] ?? DEFAULT_AKASH_NODE;
  const keyName = options.keyName ?? process.env['AKASH_KEY_NAME'] ?? 'phonix';

  if (!mnemonic) {
    throw new Error(
      'AKASH_MNEMONIC is not set. Add it to your .env file.\n' +
        'Run: axon auth akash  to generate or import one.'
    );
  }
  if (!ipfsUrl) {
    throw new Error(
      'AKASH_IPFS_URL is not set. Akash deployments require IPFS to distribute the bundle.\n' +
        'Run: axon auth akash  to configure an IPFS endpoint.'
    );
  }

  // 1. Resolve and bundle entry file
  const entryPath = resolve(cwd, config.code);
  const normalizedCwd = normalize(cwd) + (cwd.endsWith('/') ? '' : '/');
  if (!normalize(entryPath).startsWith(normalizedCwd)) {
    throw new Error(
      `Entry file path escapes the project directory.\n  Resolved: ${entryPath}\n  Project:  ${cwd}`
    );
  }

  const rawBundle = await bundleEntryFile(entryPath, config.environment ?? {});
  // Prepend Akash runtime bootstrap so phonix.* global is available
  const bootstrapCode = generateRuntimeBootstrap('akash');
  const bundleWithRuntime = bootstrapCode + rawBundle;

  // 2. Upload bundle to IPFS
  const cid = await uploadToIpfs(bundleWithRuntime, ipfsUrl, ipfsApiKey);

  // 3. Generate SDL
  const sdl = generateAkashSdl({
    bundleCid: cid,
    environment: config.environment,
    replicas: config.replicas ?? 1,
    maxUaktPerBlock: config.maxCostPerExecution ?? 10_000,
  });

  // 4. Write SDL to temp file and shell out to Akash CLI
  const tmpDir = await mkdtemp(join(tmpdir(), 'phonix-akash-'));
  const sdlPath = join(tmpDir, 'deploy.yaml');

  try {
    await writeFile(sdlPath, sdl, 'utf8');

    const env: Record<string, string> = {
      AKASH_MNEMONIC: mnemonic,
      AKASH_NODE: akashNode,
      AKASH_CHAIN_ID: process.env['AKASH_CHAIN_ID'] ?? DEFAULT_AKASH_CHAIN_ID,
      AKASH_KEYRING_BACKEND: 'test',
      AKASH_FROM: keyName,
      AKASH_YES: '1', // auto-confirm prompts
    };

    const output = await runAkashCli(
      ['tx', 'deployment', 'create', sdlPath, '--fees', '5000uakt'],
      env
    );

    const dseq = parseDseq(output);
    const leaseEndpoint = parseLeaseEndpoint(output);

    const deployment: Deployment = {
      id: dseq,
      provider: 'akash',
      status: 'pending',
      processorIds: leaseEndpoint ? [leaseEndpoint] : [],
      createdAt: new Date(),
      url: leaseEndpoint ?? `https://cloudmos.io/akash/deployments/${dseq}`,
    };

    return deployment;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function akashEstimate(config: DeploymentConfig): Promise<number> {
  // Akash pricing: ~0.1 AKT/month for 0.5 CPU / 512Mi at mainnet rates.
  // uAKT per block ≈ 1 (1 block ≈ 6 seconds → ~5 blocks/minute → ~432k blocks/month).
  // We use a flat rate based on replicas and duration as a reasonable placeholder.
  const replicas = config.replicas ?? 1;
  const durationHours = (config.schedule.durationMs ?? 86_400_000) / 3_600_000;
  const blocksPerHour = 600; // 1 block / 6s → 600 blocks/hour
  const uaktPerBlock = config.maxCostPerExecution ?? 10_000;
  return Math.round(uaktPerBlock * blocksPerHour * durationHours * replicas);
}

export async function akashListDeployments(
  mnemonic?: string
): Promise<Array<{ id: string; processorIds: string[]; status: string }>> {
  const env: Record<string, string> = {};
  const resolvedMnemonic = mnemonic ?? process.env['AKASH_MNEMONIC'] ?? '';
  if (resolvedMnemonic) env['AKASH_MNEMONIC'] = resolvedMnemonic;
  env['AKASH_NODE'] = process.env['AKASH_NODE'] ?? DEFAULT_AKASH_NODE;
  env['AKASH_CHAIN_ID'] = process.env['AKASH_CHAIN_ID'] ?? DEFAULT_AKASH_CHAIN_ID;
  env['AKASH_KEYRING_BACKEND'] = 'test';

  try {
    const output = await runAkashCli(['query', 'deployment', 'list', '--output', 'json'], env);
    const parsed = JSON.parse(output) as {
      deployments?: Array<{
        deployment?: { deployment_id?: { dseq?: string }; state?: string };
      }>;
    };

    return (parsed.deployments ?? []).map((d) => ({
      id: d.deployment?.deployment_id?.dseq ?? 'unknown',
      processorIds: [],
      status: d.deployment?.state?.toLowerCase() ?? 'pending',
    }));
  } catch {
    return [];
  }
}
