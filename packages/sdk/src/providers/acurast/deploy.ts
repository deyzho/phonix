/**
 * Acurast deployment helper.
 *
 * Flow:
 *  1. Bundle the user's entry file with esbuild (single JS file, no external deps)
 *  2. Write the bundle to a temp file
 *  3. Shell out to the `acurast` CLI (from @acurast/cli) to deploy
 *  4. Parse the CLI output to extract deployment ID and processor pubkeys
 *  5. Return a Deployment object
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeploymentConfig, Deployment } from '../../types.js';
import { generateRuntimeBootstrap } from '../../runtime/index.js';

const execFileAsync = promisify(execFile);

// ─── esbuild bundling ────────────────────────────────────────────────────────

/**
 * Bundle an entry file to a single self-contained JS string using esbuild.
 *
 * The Acurast runtime bootstrap (`phonix` global mapping to `_STD_`) is
 * prepended to the output so deployment scripts can use either `phonix.*`
 * or `_STD_.*` at runtime.
 *
 * Environment variables from `axon.json > environment` are injected via
 * esbuild's `define` so they are available as `process.env.KEY` in the bundle.
 */
export async function bundleEntryFile(
  entryPath: string,
  environment: Record<string, string> = {}
): Promise<string> {
  // Dynamic import to keep esbuild as a runtime dep
  let esbuild: typeof import('esbuild');
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new Error(
      'esbuild is required to bundle deployment scripts. Install it with: npm install esbuild'
    );
  }

  // Build esbuild define map: inject environment variables at compile time.
  //
  // SECURITY NOTES:
  //  1. Keys must match SCREAMING_SNAKE_CASE — esbuild treats define keys as JS
  //     expressions, so unsanitised keys could corrupt the build config.
  //  2. Values are baked into the public bundle (uploaded to IPFS, on-chain).
  //     Secret credentials must NEVER appear in axon.json > environment.
  //     Use the provider's secure secret store for sensitive values instead.
  const SAFE_ENV_KEY_RE = /^[A-Z][A-Z0-9_]{0,127}$/;
  // Keys whose values are secrets and must not be inlined into a public bundle
  const SECRET_KEY_PATTERNS = [/_KEY$/, /_SECRET$/, /_TOKEN$/, /_PASSWORD$/, /_MNEMONIC$/, /_PRIVATE_KEY$/];

  const defines: Record<string, string> = {
    'process.env.NODE_ENV': '"production"',
  };
  for (const [key, value] of Object.entries(environment)) {
    if (!SAFE_ENV_KEY_RE.test(key)) {
      throw new Error(
        `Invalid environment variable name in axon.json: "${key}".\n` +
          'Keys must be SCREAMING_SNAKE_CASE (e.g. INFERENCE_API_URL).'
      );
    }
    if (SECRET_KEY_PATTERNS.some((re) => re.test(key))) {
      throw new Error(
        `Environment variable "${key}" looks like a secret credential.\n` +
          'Do not put secrets in axon.json > environment — they are baked into\n' +
          'the public IPFS bundle and become permanently readable by anyone.\n' +
          'Use your provider\'s secure runtime secret store instead.'
      );
    }
    if (value !== '') {
      defines[`process.env.${key}`] = JSON.stringify(value);
    }
  }

  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    format: 'iife',
    write: false,
    minify: false,
    // Acurast TEE runtime provides _STD_ globally — do not tree-shake it
    globalName: '__phonix_bundle',
    define: defines,
  });

  if (result.errors.length > 0) {
    const messages = result.errors.map((e) => e.text).join('\n');
    throw new Error(`esbuild bundling failed:\n${messages}`);
  }

  const outputFile = result.outputFiles?.[0];
  if (!outputFile) {
    throw new Error('esbuild produced no output');
  }

  // Prepend the Acurast runtime bootstrap so `phonix` global is available
  return generateRuntimeBootstrap('acurast') + outputFile.text;
}

// ─── CLI shelling ────────────────────────────────────────────────────────────

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

/** Resolve the path to the acurast CLI binary from @acurast/cli */
async function resolveAcurastCli(): Promise<string> {
  // Try the locally installed @acurast/cli binary first
  try {
    const { createRequire } = await import('node:module');
    const requireFromHere = createRequire(import.meta.url);
    const cliPkg = requireFromHere.resolve('@acurast/cli/package.json');
    const cliDir = cliPkg.replace('/package.json', '');
    // Read the bin field from the package.json
    const pkgRaw = await readFile(cliPkg, 'utf8');
    const pkg = JSON.parse(pkgRaw) as {
      bin?: Record<string, string> | string;
    };
    if (pkg.bin) {
      const binPath =
        typeof pkg.bin === 'string'
          ? pkg.bin
          : pkg.bin['acurast'] ?? Object.values(pkg.bin)[0];
      if (binPath) {
        return resolve(cliDir, binPath);
      }
    }
  } catch {
    // Fall through to PATH lookup
  }
  // Fallback: assume `acurast` is on PATH
  return 'acurast';
}

/** Run an acurast CLI command and return stdout */
async function runAcurastCli(
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  const cliPath = await resolveAcurastCli();
  const mergedEnv = buildMinimalEnv(env ?? {});
  try {
    const { stdout } = await execFileAsync(cliPath, args, {
      env: mergedEnv,
      timeout: 120_000, // 2 minutes
    });
    return stdout;
  } catch (err) {
    const execErr = err as { message: string; stderr?: string };
    const detail = execErr.stderr ? `\nstderr: ${execErr.stderr}` : '';
    throw new Error(`acurast CLI failed: ${execErr.message}${detail}`);
  } finally {
    // Overwrite sensitive values in the env dict — best-effort,
    // GC may have already collected the strings, but limits window.
    if (mergedEnv['ACURAST_MNEMONIC']) {
      mergedEnv['ACURAST_MNEMONIC'] = '\x00'.repeat(mergedEnv['ACURAST_MNEMONIC'].length);
    }
  }
}

// ─── Deployment ID parsing ────────────────────────────────────────────────────

/**
 * Extract a deployment ID from acurast CLI output.
 * The CLI typically prints something like:
 *   "Deployment ID: 0xabcdef..."
 *   or a hex string starting with 0x
 */
function parseDeploymentId(output: string): string {
  // Look for a hex deployment ID
  const idMatch = output.match(/deployment[^\n]*id[^\n]*?:\s*(0x[0-9a-f]+)/i);
  if (idMatch) return idMatch[1];

  // Fallback: first 0x prefixed hash-looking string
  const hexMatch = output.match(/0x[0-9a-f]{16,}/i);
  if (hexMatch) return hexMatch[0];

  // Last resort: generate a deterministic placeholder from output hash
  return '0x' + createHash('sha256').update(output).digest('hex').slice(0, 32);
}

/**
 * Extract processor public keys from acurast CLI output.
 * The CLI lists assigned processors after a successful deployment.
 */
function parseProcessorIds(output: string): string[] {
  const ids: string[] = [];

  // Look for lines like "Processor: 0x..." or "Matched processor: ..."
  const processorRegex = /processor[^\n]*?:\s*(0x[0-9a-f]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = processorRegex.exec(output)) !== null) {
    ids.push(match[1]);
  }

  // Also catch standalone hex pubkeys (64-char hex = 32-byte pubkey)
  if (ids.length === 0) {
    const pubkeyRegex = /\b([0-9a-f]{64})\b/gi;
    while ((match = pubkeyRegex.exec(output)) !== null) {
      ids.push(match[1]);
    }
  }

  return [...new Set(ids)]; // deduplicate
}

// ─── Main deploy function ─────────────────────────────────────────────────────

export interface AcurastDeployOptions {
  config: DeploymentConfig;
  cwd?: string;
  mnemonic?: string;
  ipfsUrl?: string;
  ipfsApiKey?: string;
}

/**
 * Deploy an AxonSDK project to the Acurast network.
 */
export async function acurastDeploy(options: AcurastDeployOptions): Promise<Deployment> {
  const { config, cwd = process.cwd() } = options;

  const mnemonic = options.mnemonic ?? process.env['ACURAST_MNEMONIC'] ?? '';
  const ipfsUrl = options.ipfsUrl ?? process.env['ACURAST_IPFS_URL'] ?? '';
  const ipfsApiKey = options.ipfsApiKey ?? process.env['ACURAST_IPFS_API_KEY'] ?? '';

  if (!mnemonic) {
    throw new Error(
      'ACURAST_MNEMONIC is not set. Add it to your .env file.\n' +
        'Get a mnemonic at: https://docs.acurast.com/developers/get-started'
    );
  }

  // 1. Resolve and bundle the entry file — ensure it stays within the project directory
  const entryPath = resolve(cwd, config.code);
  const normalizedCwd = normalize(cwd) + (cwd.endsWith('/') ? '' : '/');
  if (!normalize(entryPath).startsWith(normalizedCwd)) {
    throw new Error(
      `Entry file path escapes the project directory.\n` +
        `  Resolved: ${entryPath}\n` +
        `  Project:  ${cwd}\n` +
        `Set 'code' in your DeploymentConfig to a path inside the project.`
    );
  }
  let bundledCode: string;
  try {
    bundledCode = await bundleEntryFile(entryPath, config.environment ?? {});
  } catch (err) {
    throw new Error(
      `Failed to bundle entry file '${config.code}':\n${(err as Error).message}`
    );
  }

  // 2. Write bundle to a temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'phonix-'));
  const bundlePath = join(tmpDir, 'bundle.js');
  await writeFile(bundlePath, bundledCode, 'utf8');

  try {
    // 3. Shell out to acurast CLI
    const env: Record<string, string> = {
      ACURAST_MNEMONIC: mnemonic,
    };
    if (ipfsUrl) env['ACURAST_IPFS_URL'] = ipfsUrl;
    if (ipfsApiKey) env['ACURAST_IPFS_API_KEY'] = ipfsApiKey;

    const args = [
      'deploy',
      bundlePath,
      '--replicas', String(config.replicas ?? 1),
    ];

    // Add schedule arguments
    if (config.schedule.type === 'interval' && config.schedule.intervalMs) {
      args.push('--interval', String(config.schedule.intervalMs));
    }
    if (config.schedule.durationMs) {
      args.push('--duration', String(config.schedule.durationMs));
    }
    if (config.maxCostPerExecution) {
      args.push('--max-cost', String(config.maxCostPerExecution));
    }
    // Add destination addresses — validate format to prevent argument injection
    // https:// only — http:// destinations would transmit result payloads in cleartext
    // and could be used as SSRF callback vectors against internal services.
    const DEST_RE = /^(0x[0-9a-fA-F]+|https:\/\/[a-zA-Z0-9.\-]+(:\d+)?(\/[^\s]*)?)$/;
    for (const dest of config.destinations ?? []) {
      if (!DEST_RE.test(dest)) {
        throw new Error(
          `Invalid destination value "${dest}". ` +
            `Must be a 0x hex address or an https:// URL.`
        );
      }
      args.push('--destination', dest);
    }

    const output = await runAcurastCli(args, env);

    // 4. Parse the output
    const deploymentId = parseDeploymentId(output);
    const processorIds = parseProcessorIds(output);

    const deployment: Deployment = {
      id: deploymentId,
      provider: 'acurast',
      status: processorIds.length > 0 ? 'live' : 'pending',
      processorIds,
      createdAt: new Date(),
      url: `https://${deploymentId}.acu.run`,
    };

    return deployment;
  } finally {
    // Clean up temp dir
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Estimate the cost of an Acurast deployment by calling `acurast estimate-fee`.
 * Falls back to a placeholder if the CLI is not available.
 */
export async function acurastEstimate(config: DeploymentConfig): Promise<number> {
  try {
    const args = [
      'estimate-fee',
      '--replicas', String(config.replicas ?? 1),
      '--runtime', config.runtime,
    ];
    if (config.schedule.durationMs) {
      args.push('--duration', String(config.schedule.durationMs));
    }
    const output = await runAcurastCli(args);

    // Parse fee from output like "Estimated fee: 5000000 microACU"
    const feeMatch = output.match(/[\d,]+\s*(?:micro)?ACU/i);
    if (feeMatch) {
      const numStr = feeMatch[0].replace(/[^0-9]/g, '');
      return parseInt(numStr, 10);
    }
    return 0;
  } catch {
    // Return a reasonable placeholder if CLI is not available
    const basePerReplica = 1_000_000; // 1 ACU in microACU
    const replicas = config.replicas ?? 1;
    const durationDays = (config.schedule.durationMs ?? 86_400_000) / 86_400_000;
    return Math.round(basePerReplica * replicas * durationDays);
  }
}

/**
 * List deployments by shelling out to `acurast deployments ls`.
 */
export async function acurastListDeployments(
  mnemonic?: string
): Promise<Array<{ id: string; processorIds: string[]; status: string }>> {
  const env: Record<string, string> = {};
  const resolvedMnemonic = mnemonic ?? process.env['ACURAST_MNEMONIC'] ?? '';
  if (resolvedMnemonic) {
    env['ACURAST_MNEMONIC'] = resolvedMnemonic;
  }

  try {
    const output = await runAcurastCli(['deployments', 'ls'], env);

    // Parse tabular output — each line may look like:
    // "0xabc...  live  3 processors  0xproc1,0xproc2"
    const deployments: Array<{ id: string; processorIds: string[]; status: string }> = [];
    const lines = output.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const idMatch = line.match(/0x[0-9a-f]+/i);
      if (!idMatch) continue;

      const id = idMatch[0];
      const statusMatch = line.match(/\b(live|pending|completed|failed)\b/i);
      const status = statusMatch ? statusMatch[1].toLowerCase() : 'pending';

      // Extract processor IDs from the same line
      const procIds: string[] = [];
      const procRegex = /0x[0-9a-f]{16,}/gi;
      let m: RegExpExecArray | null;
      while ((m = procRegex.exec(line)) !== null) {
        if (m[0] !== id) procIds.push(m[0]);
      }

      deployments.push({ id, processorIds: procIds, status });
    }

    return deployments;
  } catch {
    // Return empty list if CLI fails (e.g., not authenticated)
    return [];
  }
}
