/**
 * axon auth [provider] — credential setup wizard.
 *
 * Guides the developer through generating and configuring credentials for a
 * specific provider. Reads and writes the project's .env file.
 *
 * Usage:
 *   axon auth           — prompts for provider, then runs that wizard
 *   axon auth acurast   — Acurast wallet + IPFS setup
 *   axon auth fluence   — Fluence EVM wallet setup
 *   axon auth koii      — Koii Solana-compatible wallet setup
 */

import { readFile, writeFile, access, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { generateP256KeyPair } from '@axonsdk/sdk';
import type { ProviderName } from '@axonsdk/sdk';

async function getChalk() {
  return (await import('chalk')).default;
}
async function getInquirer() {
  return (await import('inquirer')).default;
}
async function getOra() {
  return (await import('ora')).default;
}

// ─── .env helpers ─────────────────────────────────────────────────────────────

async function readEnv(cwd: string): Promise<Record<string, string>> {
  const envPath = join(cwd, '.env');
  try {
    const raw = await readFile(envPath, 'utf8');
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

async function updateEnv(
  cwd: string,
  updates: Record<string, string>
): Promise<void> {
  const envPath = join(cwd, '.env');
  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    // .env doesn't exist yet — create it
  }

  const lines = raw.split('\n');
  const updated = new Set<string>();

  // Sanitize a value before writing to .env.
  // Newlines in values would inject new key=value pairs, allowing an attacker
  // who controls a credential input (e.g. a poisoned mnemonic) to overwrite
  // other keys in the file. We strip CR/LF and double-quote the value.
  function sanitizeEnvValue(v: string): string {
    return v.replace(/[\r\n]/g, '');
  }
  function serializeEnvLine(key: string, value: string): string {
    const safe = sanitizeEnvValue(value);
    // Quote if the value contains spaces, #, $, or other shell-special chars
    const needsQuotes = /[\s#$`"'\\]/.test(safe);
    return needsQuotes ? `${key}="${safe.replace(/"/g, '\\"')}"` : `${key}=${safe}`;
  }

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      updated.add(key);
      return serializeEnvLine(key, updates[key]);
    }
    return line;
  });

  // Append any keys that weren't already in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!updated.has(key)) {
      newLines.push(serializeEnvLine(key, value));
    }
  }

  await writeFile(envPath, newLines.join('\n'), 'utf8');
  // Restrict .env to owner read/write only — credentials stored in plain text
  // must not be readable by other OS users on a shared machine.
  try {
    await chmod(envPath, 0o600);
  } catch {
    // chmod is a no-op on Windows; ignore the error silently
  }
}

// ─── Acurast wizard ───────────────────────────────────────────────────────────

async function runAcurastAuth(cwd: string): Promise<void> {
  const chalk = await getChalk();
  const inquirer = await getInquirer();
  const ora = await getOra();

  console.log();
  console.log(chalk.bold('  Acurast Credential Setup'));
  console.log(chalk.gray('  You need three things: a P256 key, a wallet mnemonic, and an IPFS endpoint.\n'));

  const existing = await readEnv(cwd);
  const updates: Record<string, string> = {};

  // ── 1. P256 secret key ────────────────────────────────────────────────────
  if (!existing['AXON_SECRET_KEY']) {
    const spinner = ora('Generating P256 keypair...').start();
    const { secretKeyHex } = generateP256KeyPair();
    updates['AXON_SECRET_KEY'] = secretKeyHex;
    spinner.succeed('P256 keypair generated');
    console.log(chalk.green('  ✓ AXON_SECRET_KEY generated and saved to .env'));
  } else {
    console.log(chalk.green('  ✓ AXON_SECRET_KEY already set'));
  }

  // ── 2. Acurast mnemonic ───────────────────────────────────────────────────
  if (!existing['ACURAST_MNEMONIC']) {
    console.log();
    console.log(chalk.bold('  Acurast wallet mnemonic'));
    console.log(chalk.gray('  Acurast uses a Polkadot-compatible wallet (12 or 24-word mnemonic).'));
    console.log();
    console.log(chalk.cyan('  Options:'));
    console.log('   a) Create a new wallet in the Acurast Console:');
    console.log(chalk.white('      https://console.acurast.com'));
    console.log('   b) Use SubWallet browser extension (recommended):');
    console.log(chalk.white('      https://subwallet.app'));
    console.log('   c) Fund testnet wallet at:');
    console.log(chalk.white('      https://faucet.acurast.com'));
    console.log();

    const { mnemonic } = await inquirer.prompt<{ mnemonic: string }>([
      {
        type: 'password',
        name: 'mnemonic',
        message: 'Paste your mnemonic (or press Enter to skip):',
        mask: '*',
      },
    ]);

    if (mnemonic.trim()) {
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        console.log(chalk.red(`  Error: a BIP-39 mnemonic must be exactly 12 or 24 words (got ${wordCount}).`));
        console.log(chalk.gray('  Re-run \`axon auth acurast\` and paste the correct mnemonic.'));
        return;
      }
      updates['ACURAST_MNEMONIC'] = mnemonic.trim();
    } else {
      console.log(chalk.gray('  Skipped — add ACURAST_MNEMONIC to .env manually before deploying.'));
    }
  } else {
    console.log(chalk.green('  ✓ ACURAST_MNEMONIC already set'));
  }

  // ── 3. IPFS credentials ───────────────────────────────────────────────────
  if (!existing['ACURAST_IPFS_URL']) {
    console.log();
    console.log(chalk.bold('  IPFS endpoint'));
    console.log(chalk.gray('  Axon uploads your deployment bundle to IPFS before registering on-chain.'));
    console.log();
    console.log(chalk.cyan('  Options:'));
    console.log('   a) Infura (free tier available):');
    console.log(chalk.white('      https://app.infura.io  →  IPFS section  →  copy endpoint'));
    console.log('   b) web3.storage (free, IPFS + Filecoin):');
    console.log(chalk.white('      https://web3.storage  →  Create account  →  API tokens'));
    console.log('   c) Local IPFS node (kubo):');
    console.log(chalk.white('      http://localhost:5001'));
    console.log();

    const { ipfsUrl, ipfsApiKey } = await inquirer.prompt<{
      ipfsUrl: string;
      ipfsApiKey: string;
    }>([
      {
        type: 'input',
        name: 'ipfsUrl',
        message: 'IPFS endpoint URL (or Enter to skip):',
        default: '',
      },
      {
        type: 'password',
        name: 'ipfsApiKey',
        message: 'IPFS API key (or Enter to skip):',
        mask: '*',
      },
    ]);

    if (ipfsUrl.trim()) updates['ACURAST_IPFS_URL'] = ipfsUrl.trim();
    if (ipfsApiKey.trim()) updates['ACURAST_IPFS_API_KEY'] = ipfsApiKey.trim();
  } else {
    console.log(chalk.green('  ✓ ACURAST_IPFS_URL already set'));
  }

  if (Object.keys(updates).length > 0) {
    const spinner = ora('Saving to .env...').start();
    await updateEnv(cwd, updates);
    // Restrict .env to owner-read/write only — prevents other local users reading secrets
    await chmod(join(cwd, '.env'), 0o600).catch(() => {});
    await enforceGitignore(cwd, chalk);
    spinner.succeed('.env updated');
  }

  console.log();
  console.log(chalk.bold.green('  Acurast credentials configured.'));
  console.log(chalk.gray('  Run: axon deploy'));
  console.log();
}

// ─── Fluence wizard ───────────────────────────────────────────────────────────

async function runFluenceAuth(cwd: string): Promise<void> {
  const chalk = await getChalk();
  const ora = await getOra();

  console.log();
  console.log(chalk.bold('  Fluence Credential Setup'));
  console.log(chalk.gray('  Fluence uses an EVM-compatible wallet (hex private key).\n'));

  const existing = await readEnv(cwd);
  const updates: Record<string, string> = {};

  // Generate or detect AXON_SECRET_KEY
  if (!existing['AXON_SECRET_KEY']) {
    const spinner = ora('Generating P256 keypair...').start();
    const { secretKeyHex } = generateP256KeyPair();
    updates['AXON_SECRET_KEY'] = secretKeyHex;
    spinner.succeed('P256 keypair generated');
  } else {
    console.log(chalk.green('  ✓ AXON_SECRET_KEY already set'));
  }

  // Generate Fluence EVM private key
  if (!existing['FLUENCE_PRIVATE_KEY']) {
    const spinner = ora('Generating Fluence EVM wallet...').start();

    let privateKeyHex: string;
    let address: string;

    try {
      const { ethers } = await import('ethers');
      const wallet = ethers.Wallet.createRandom();
      privateKeyHex = wallet.privateKey;
      address = wallet.address;
      spinner.succeed('EVM wallet generated');
      console.log(chalk.gray('    Address: ' + address));
      console.log(chalk.gray('    Fund it at: https://faucet.fluence.dev'));
    } catch {
      // ethers not installed — generate a random 32-byte hex key
      const { randomBytes } = await import('node:crypto');
      privateKeyHex = '0x' + randomBytes(32).toString('hex');
      address = '(install ethers to derive address)';
      spinner.succeed('Private key generated (install ethers for full key management)');
    }

    updates['FLUENCE_PRIVATE_KEY'] = privateKeyHex;

    console.log();
    console.log(chalk.cyan('  Next steps for Fluence:'));
    console.log(`   1. Fund your wallet at: ${chalk.white('https://faucet.fluence.dev')}`);
    console.log(`   2. Install Fluence CLI: ${chalk.white('npm install -g @fluencelabs/cli')}`);
    console.log(`   3. Set network (optional): ${chalk.white('FLUENCE_NETWORK=testnet in .env')}`);
    console.log();
  } else {
    console.log(chalk.green('  ✓ FLUENCE_PRIVATE_KEY already set'));
  }

  // Set default relay if not configured
  if (!existing['FLUENCE_RELAY_ADDR']) {
    updates['FLUENCE_RELAY_ADDR'] =
      '/dns4/kras-00.fluence.dev/tcp/19001/wss/p2p/12D3KooWSD5PToNiLQwKDXsu8JSysCwUt8BVUJEqCHcDe7P5h45e';
    console.log(chalk.gray('  Default relay set: kras-00.fluence.dev'));
  }

  if (Object.keys(updates).length > 0) {
    const spinner = ora('Saving to .env...').start();
    await updateEnv(cwd, updates);
    await chmod(join(cwd, '.env'), 0o600).catch(() => {});
    await enforceGitignore(cwd, chalk);
    spinner.succeed('.env updated');
  }

  console.log();
  console.log(chalk.bold.green('  Fluence credentials configured.'));
  console.log(chalk.gray('  Run: axon deploy'));
  console.log();
}

// ─── Koii wizard ──────────────────────────────────────────────────────────────

async function runKoiiAuth(cwd: string): Promise<void> {
  const chalk = await getChalk();
  const inquirer = await getInquirer();
  const ora = await getOra();

  console.log();
  console.log(chalk.bold('  Koii Credential Setup'));
  console.log(chalk.gray('  Koii uses a Solana-compatible wallet (base58 or hex private key).\n'));

  const existing = await readEnv(cwd);
  const updates: Record<string, string> = {};

  // Generate or detect AXON_SECRET_KEY
  if (!existing['AXON_SECRET_KEY']) {
    const spinner = ora('Generating P256 keypair...').start();
    const { secretKeyHex } = generateP256KeyPair();
    updates['AXON_SECRET_KEY'] = secretKeyHex;
    spinner.succeed('P256 keypair generated');
  } else {
    console.log(chalk.green('  ✓ AXON_SECRET_KEY already set'));
  }

  // Generate Koii Solana-compatible keypair
  if (!existing['KOII_PRIVATE_KEY']) {
    const spinner = ora('Generating Koii wallet...').start();

    let privateKeyBase58: string;
    let publicKeyBase58: string;

    try {
      const { Keypair } = (await import('@_koii/web3.js')) as {
        Keypair: {
          generate(): {
            secretKey: Uint8Array;
            publicKey: { toBase58(): string };
          };
        };
      };
      const kp = Keypair.generate();
      privateKeyBase58 = uint8ArrayToBase58(kp.secretKey);
      publicKeyBase58 = kp.publicKey.toBase58();
      spinner.succeed('Koii wallet generated');
      console.log(chalk.gray('    Public key: ' + publicKeyBase58));
    } catch {
      // @_koii/web3.js not installed — generate random key
      const { randomBytes } = await import('node:crypto');
      const keyBytes = randomBytes(64);
      privateKeyBase58 = uint8ArrayToBase58(keyBytes);
      publicKeyBase58 = '(install @_koii/web3.js to derive public key)';
      spinner.succeed('Private key generated (install @_koii/web3.js for full support)');
    }

    updates['KOII_PRIVATE_KEY'] = privateKeyBase58;

    console.log();
    console.log(chalk.cyan('  Next steps for Koii:'));
    console.log(`   1. Get KOII tokens: ${chalk.white('https://app.koii.network')}`);
    console.log(`   2. Set IPFS endpoint: ${chalk.white('KOII_IPFS_URL=https://... in .env')}`);
    console.log(`   3. Install Koii CLI: ${chalk.white('npm install -g @_koii/create-task-cli')}`);
    console.log();
  } else {
    console.log(chalk.green('  ✓ KOII_PRIVATE_KEY already set'));
  }

  // IPFS for Koii
  if (!existing['KOII_IPFS_URL'] && !existing['ACURAST_IPFS_URL']) {
    const { ipfsUrl } = await inquirer.prompt<{ ipfsUrl: string }>([
      {
        type: 'input',
        name: 'ipfsUrl',
        message: 'IPFS endpoint URL for Koii (or Enter to skip):',
        default: '',
      },
    ]);
    if (ipfsUrl.trim()) updates['KOII_IPFS_URL'] = ipfsUrl.trim();
  } else {
    console.log(chalk.green('  ✓ IPFS endpoint already set'));
  }

  if (Object.keys(updates).length > 0) {
    const spinner = ora('Saving to .env...').start();
    await updateEnv(cwd, updates);
    await chmod(join(cwd, '.env'), 0o600).catch(() => {});
    await enforceGitignore(cwd, chalk);
    spinner.succeed('.env updated');
  }

  console.log();
  console.log(chalk.bold.green('  Koii credentials configured.'));
  console.log(chalk.gray('  Run: axon deploy'));
  console.log();
}

// ─── Akash wizard ─────────────────────────────────────────────────────────────

async function runAkashAuth(cwd: string): Promise<void> {
  const chalk = await getChalk();
  const inquirer = await getInquirer();
  const ora = await getOra();

  console.log();
  console.log(chalk.bold('  Akash Credential Setup'));
  console.log(chalk.gray('  Akash is a decentralised cloud marketplace. You need a BIP-39 mnemonic\n  and an IPFS endpoint to upload deployment bundles.\n'));

  const existing = await readEnv(cwd);
  const updates: Record<string, string> = {};

  // ── 1. Akash mnemonic ─────────────────────────────────────────────────────
  if (!existing['AKASH_MNEMONIC']) {
    console.log(chalk.bold('  Akash wallet mnemonic'));
    console.log(chalk.gray('  Akash uses a Cosmos-SDK wallet (12 or 24-word BIP-39 mnemonic).'));
    console.log();
    console.log(chalk.cyan('  Options:'));
    console.log('   a) Create a new wallet with the Akash CLI:');
    console.log(chalk.white('      provider-services keys add axon'));
    console.log('   b) Import an existing mnemonic from Keplr or another Cosmos wallet.');
    console.log('   c) Fund testnet wallet (AKT) at:');
    console.log(chalk.white('      https://faucet.sandbox-01.aksh.pw'));
    console.log();

    const { mnemonic } = await inquirer.prompt<{ mnemonic: string }>([
      {
        type: 'password',
        name: 'mnemonic',
        message: 'Paste your 12 or 24-word mnemonic (or Enter to skip):',
        mask: '*',
      },
    ]);

    if (mnemonic.trim()) {
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        console.log(chalk.red(`  Error: a BIP-39 mnemonic must be exactly 12 or 24 words (got ${wordCount}).`));
        console.log(chalk.gray('  Re-run \`axon auth akash\` and paste the correct mnemonic.'));
        return;
      }
      updates['AKASH_MNEMONIC'] = mnemonic.trim();
    } else {
      console.log(chalk.gray('  Skipped — add AKASH_MNEMONIC to .env manually before deploying.'));
    }
  } else {
    console.log(chalk.green('  ✓ AKASH_MNEMONIC already set'));
  }

  // ── 2. IPFS endpoint ──────────────────────────────────────────────────────
  if (!existing['AKASH_IPFS_URL'] && !existing['ACURAST_IPFS_URL']) {
    console.log();
    console.log(chalk.bold('  IPFS endpoint'));
    console.log(chalk.gray('  Axon uploads your bundle to IPFS; the Akash container fetches it at startup.'));
    console.log();
    console.log(chalk.cyan('  Options:'));
    console.log('   a) Infura (free tier): https://app.infura.io  →  IPFS section');
    console.log('   b) web3.storage: https://web3.storage');
    console.log('   c) Local kubo node: https://localhost:5001');
    console.log();

    const { ipfsUrl, ipfsApiKey } = await inquirer.prompt<{
      ipfsUrl: string;
      ipfsApiKey: string;
    }>([
      {
        type: 'input',
        name: 'ipfsUrl',
        message: 'IPFS endpoint URL (must be https://, or Enter to skip):',
        default: '',
      },
      {
        type: 'password',
        name: 'ipfsApiKey',
        message: 'IPFS API key (or Enter to skip):',
        mask: '*',
      },
    ]);

    if (ipfsUrl.trim()) updates['AKASH_IPFS_URL'] = ipfsUrl.trim();
    if (ipfsApiKey.trim()) updates['AKASH_IPFS_API_KEY'] = ipfsApiKey.trim();
  } else {
    console.log(chalk.green('  ✓ IPFS endpoint already set'));
  }

  // ── 3. Akash node (optional) ──────────────────────────────────────────────
  if (!existing['AKASH_NODE']) {
    updates['AKASH_NODE'] = 'https://rpc.akashnet.net:443';
    updates['AKASH_CHAIN_ID'] = 'akashnet-2';
    updates['AKASH_KEY_NAME'] = 'axon';
    console.log(chalk.gray('  Defaults set: AKASH_NODE=https://rpc.akashnet.net:443, AKASH_KEY_NAME=axon'));
  }

  if (Object.keys(updates).length > 0) {
    const spinner = ora('Saving to .env...').start();
    await updateEnv(cwd, updates);
    await chmod(join(cwd, '.env'), 0o600).catch(() => {});
    await enforceGitignore(cwd, chalk);
    spinner.succeed('.env updated');
  }

  console.log();
  console.log(chalk.bold.green('  Akash credentials configured.'));
  console.log(chalk.gray('  Make sure provider-services CLI is installed:'));
  console.log(chalk.white('    https://docs.akash.network/guides/cli/akash-provider-services'));
  console.log(chalk.gray('  Then run: axon deploy'));
  console.log();
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runAuth(
  provider: string | undefined,
  cwd: string = process.cwd()
): Promise<void> {
  const chalk = await getChalk();
  const inquirer = await getInquirer();

  let resolvedProvider: ProviderName;

  if (provider && ['acurast', 'fluence', 'koii', 'akash'].includes(provider)) {
    resolvedProvider = provider as ProviderName;
  } else {
    if (provider) {
      console.log(chalk.yellow(`  Unknown provider: ${provider}. Choose one below.\n`));
    }

    const { chosen } = await inquirer.prompt<{ chosen: ProviderName }>([
      {
        type: 'list',
        name: 'chosen',
        message: 'Configure credentials for which provider?',
        choices: [
          { name: 'Acurast  — Smartphones as edge nodes (v0.1)', value: 'acurast' },
          { name: 'Fluence  — Decentralized cloud (v0.2)', value: 'fluence' },
          { name: 'Koii     — Community-owned compute (v0.2)', value: 'koii' },
          { name: 'Akash    — Decentralised cloud marketplace (v0.2)', value: 'akash' },
        ],
      },
    ]);
    resolvedProvider = chosen;
  }

  // Check if .env exists; if not, create it
  try {
    await access(join(cwd, '.env'));
  } catch {
    await writeFile(join(cwd, '.env'), '# Axon environment variables\n', 'utf8');
  }

  switch (resolvedProvider) {
    case 'acurast':
      await runAcurastAuth(cwd);
      break;
    case 'fluence':
      await runFluenceAuth(cwd);
      break;
    case 'koii':
      await runKoiiAuth(cwd);
      break;
    case 'akash':
      await runAkashAuth(cwd);
      break;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure .env is listed in .gitignore.
 * Prints a loud warning and offers to add it automatically if missing.
 * A missing .gitignore entry is the single most common cause of accidental
 * credential exposure (git push of .env to a public repository).
 */
async function enforceGitignore(cwd: string, chalk: Awaited<ReturnType<typeof getChalk>>): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore');
  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // .gitignore doesn't exist yet — create it with .env entry
    await writeFile(gitignorePath, '# Axon secrets — never commit!\n.env\n', 'utf8');
    console.log(chalk.green('  ✓ Created .gitignore with .env entry'));
    return;
  }

  const lines = content.split('\n').map((l) => l.trim());
  const alreadyIgnored = lines.some((l) => l === '.env' || l === '**/.env');
  if (!alreadyIgnored) {
    const newContent = content.trimEnd() + '\n\n# Axon secrets — never commit!\n.env\n';
    await writeFile(gitignorePath, newContent, 'utf8');
    console.log(chalk.green('  ✓ Added .env to .gitignore'));
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function uint8ArrayToBase58(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const byte of bytes) {
    n = n * BigInt(256) + BigInt(byte);
  }
  let result = '';
  while (n > 0n) {
    result = BASE58_ALPHABET[Number(n % 58n)] + result;
    n = n / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}
