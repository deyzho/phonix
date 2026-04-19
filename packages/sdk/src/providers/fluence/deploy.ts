/**
 * Fluence deployment helpers.
 *
 * Flow:
 *  1. Bundle the entry file with esbuild (IIFE, phonix runtime prepended)
 *  2. Write to a temp directory as a Fluence spell JS file
 *  3. Shell out to the `fluence` CLI to deploy the spell
 *  4. Parse output for deal ID and worker peer IDs
 *  5. Return a Deployment object
 *
 * Requires the Fluence CLI: npm install -g @fluencelabs/cli
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeploymentConfig, Deployment } from '../../types.js';
import { generateRuntimeBootstrap } from '../../runtime/index.js';

const execFileAsync = promisify(execFile);

// ─── esbuild bundling ─────────────────────────────────────────────────────────

async function bundleForFluence(
  entryPath: string,
  environment: Record<string, string> = {}
): Promise<string> {
  let esbuild: typeof import('esbuild');
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new Error('esbuild is required. Install it with: npm install esbuild');
  }

  const SAFE_ENV_KEY_RE = /^[A-Z][A-Z0-9_]{0,127}$/;
  const SECRET_KEY_PATTERNS = [/_KEY$/, /_SECRET$/, /_TOKEN$/, /_PASSWORD$/, /_MNEMONIC$/, /_PRIVATE_KEY$/];

  const defines: Record<string, string> = {
    'process.env.NODE_ENV': '"production"',
  };
  for (const [key, value] of Object.entries(environment)) {
    if (!SAFE_ENV_KEY_RE.test(key)) {
      throw new Error(`Invalid environment variable name: "${key}". Keys must be SCREAMING_SNAKE_CASE.`);
    }
    if (SECRET_KEY_PATTERNS.some((re) => re.test(key))) {
      throw new Error(
        `"${key}" looks like a secret. Do not bake credentials into the public bundle via axon.json > environment.`
      );
    }
    if (value !== '') defines[`process.env.${key}`] = JSON.stringify(value);
  }

  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    format: 'iife',
    write: false,
    minify: false,
    globalName: '__phonix_bundle',
    define: defines,
  });

  if (result.errors.length > 0) {
    throw new Error(`esbuild failed:\n${result.errors.map((e) => e.text).join('\n')}`);
  }

  const outputFile = result.outputFiles?.[0];
  if (!outputFile) throw new Error('esbuild produced no output');

  // Prepend the Fluence runtime bootstrap
  return generateRuntimeBootstrap('fluence') + outputFile.text;
}

// ─── CLI helpers ──────────────────────────────────────────────────────────────

async function resolveFluenceCli(): Promise<string> {
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('@fluencelabs/cli/package.json');
    const cliDir = pkgPath.replace('/package.json', '');
    const pkgRaw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as { bin?: Record<string, string> | string };
    if (pkg.bin) {
      const binPath =
        typeof pkg.bin === 'string'
          ? pkg.bin
          : pkg.bin['fluence'] ?? Object.values(pkg.bin)[0];
      if (binPath) return resolve(cliDir, binPath);
    }
  } catch {
    // Fall through
  }
  return 'fluence'; // Assume on PATH
}

async function runFluenceCli(
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  const cliPath = await resolveFluenceCli();
  const mergedEnv = { ...process.env, ...(env ?? {}) } as Record<string, string>;
  try {
    const { stdout } = await execFileAsync(cliPath, args, {
      env: mergedEnv,
      timeout: 180_000, // 3 minutes (deal creation can be slow)
    });
    return stdout;
  } catch (err) {
    const execErr = err as { message: string; stderr?: string };
    const detail = execErr.stderr ? `\nstderr: ${execErr.stderr}` : '';
    throw new Error(`fluence CLI failed: ${execErr.message}${detail}`);
  }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseDealId(output: string): string {
  // "Deal ID: 0xabc..." or "deal: 0xabc..."
  const match = output.match(/deal[^\n]*?:\s*(0x[0-9a-f]+)/i);
  if (match) return match[1];
  const hexMatch = output.match(/0x[0-9a-f]{16,}/i);
  if (hexMatch) return hexMatch[0];
  return '0x' + createHash('sha256').update(output).digest('hex').slice(0, 32);
}

function parseWorkerIds(output: string): string[] {
  const ids: string[] = [];
  // "Worker: 12D3KooW..." — PeerIds are base58/multihash format
  const peerIdRegex = /worker[^\n]*?:\s*(12D3KooW[A-Za-z0-9]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = peerIdRegex.exec(output)) !== null) ids.push(match[1]);

  if (ids.length === 0) {
    // Fallback: any PeerId-shaped string
    const fallback = output.match(/12D3KooW[A-Za-z0-9]+/g);
    if (fallback) ids.push(...fallback);
  }
  return [...new Set(ids)];
}

// ─── Main deploy ──────────────────────────────────────────────────────────────

export interface FluenceDeployOptions {
  config: DeploymentConfig;
  secretKey?: string;
  cwd?: string;
}

export async function fluenceDeploy(options: FluenceDeployOptions): Promise<Deployment> {
  const { config, cwd = process.cwd() } = options;

  // Only FLUENCE_PRIVATE_KEY is accepted — never fall back to AXON_SECRET_KEY.
  // AXON_SECRET_KEY is a P-256 scalar; Fluence requires Ed25519. Reusing the
  // same key material across different elliptic curves compromises both identities
  // and is cryptographically unsound.
  const privateKey =
    options.secretKey ??
    process.env['FLUENCE_PRIVATE_KEY'] ??
    '';

  if (!privateKey) {
    throw new Error(
      'FLUENCE_PRIVATE_KEY is not set. Add it to your .env file.\n' +
        'Run: axon auth fluence  to generate and configure credentials.\n' +
        'Do not use AXON_SECRET_KEY — Fluence requires a separate Ed25519 key.'
    );
  }

  // Validate and bundle entry file
  const entryPath = resolve(cwd, config.code);
  const normalizedCwd = normalize(cwd) + (cwd.endsWith('/') ? '' : '/');
  if (!normalize(entryPath).startsWith(normalizedCwd)) {
    throw new Error(
      `Entry file path escapes the project directory.\n  Resolved: ${entryPath}`
    );
  }

  let bundledCode: string;
  try {
    bundledCode = await bundleForFluence(entryPath, config.environment ?? {});
  } catch (err) {
    throw new Error(`Failed to bundle for Fluence: ${(err as Error).message}`);
  }

  // Write to temp dir as a spell JS file
  const tmpDir = await mkdtemp(join(tmpdir(), 'phonix-fluence-'));
  const spellPath = join(tmpDir, 'spell.js');
  await writeFile(spellPath, bundledCode, 'utf8');

  try {
    const env: Record<string, string> = {
      FLUENCE_PRIVATE_KEY: privateKey,
    };
    if (process.env['FLUENCE_NETWORK']) env['FLUENCE_ENV'] = process.env['FLUENCE_NETWORK'];

    const args = ['deploy', '--spell', spellPath, '--no-input'];
    if (config.replicas) args.push('--workers', String(config.replicas));

    const output = await runFluenceCli(args, env);

    const dealId = parseDealId(output);
    const workerIds = parseWorkerIds(output);

    return {
      id: dealId,
      provider: 'fluence',
      status: workerIds.length > 0 ? 'live' : 'pending',
      processorIds: workerIds,
      createdAt: new Date(),
      url: `https://console.fluence.network/deals/${dealId}`,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Estimate the cost of a Fluence deployment.
 * Returns an approximate FLT amount based on duration and replicas.
 */
export async function fluenceEstimate(config: DeploymentConfig): Promise<number> {
  try {
    const args = ['deal', 'estimate', '--workers', String(config.replicas ?? 1)];
    if (config.schedule.durationMs) {
      args.push('--duration', String(Math.ceil(config.schedule.durationMs / 3600_000) + 'h'));
    }
    const output = await runFluenceCli(args);
    const match = output.match(/([\d.]+)\s*FLT/i);
    if (match) return parseFloat(match[1]);
  } catch {
    // CLI not available — use placeholder estimate
  }
  // ~0.1 FLT per replica per day
  const replicas = config.replicas ?? 1;
  const durationDays = (config.schedule.durationMs ?? 86_400_000) / 86_400_000;
  return Math.round(replicas * durationDays * 0.1 * 1e6) / 1e6;
}

/**
 * List active Fluence deployments (deals) for the current key.
 */
export async function fluenceListDeployments(secretKey?: string): Promise<
  Array<{ id: string; processorIds: string[]; status: string }>
> {
  const env: Record<string, string> = {};
  const key = secretKey ?? process.env['FLUENCE_PRIVATE_KEY'] ?? '';
  if (key) env['FLUENCE_PRIVATE_KEY'] = key;

  try {
    const output = await runFluenceCli(['deal', 'list', '--no-input'], env);
    const deployments: Array<{ id: string; processorIds: string[]; status: string }> = [];
    const lines = output.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const idMatch = line.match(/0x[0-9a-f]{16,}/i);
      if (!idMatch) continue;
      const id = idMatch[0];
      const statusMatch = line.match(/\b(active|pending|completed|failed|ended)\b/i);
      const status = statusMatch ? statusMatch[1].toLowerCase() : 'pending';
      const workerIds: string[] = [];
      const workerMatch = line.match(/12D3KooW[A-Za-z0-9]+/g);
      if (workerMatch) workerIds.push(...workerMatch);
      deployments.push({ id, processorIds: workerIds, status });
    }
    return deployments;
  } catch {
    return [];
  }
}
