#!/usr/bin/env node
/**
 * @axonsdk/cli — entry point
 *
 * Registers all commands and handles global flags.
 */

import { program } from 'commander';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

// ─── Version ──────────────────────────────────────────────────────────────────

function readVersion(): string {
  try {
    const requireFromHere = createRequire(import.meta.url);
    const pkgPath = requireFromHere.resolve('@axonsdk/cli/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    try {
      // Dev mode: resolve from src/../package.json
      const thisDir = dirname(new URL(import.meta.url).pathname);
      const pkgPath = join(thisDir, '..', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
      return pkg.version;
    } catch {
      return '0.1.0';
    }
  }
}

const VERSION = readVersion();

// ─── Update check ─────────────────────────────────────────────────────────────

async function checkForUpdates(): Promise<void> {
  try {
    const { default: updateNotifier } = await import('update-notifier');
    const { createRequire } = await import('node:module');
    const requireFromHere = createRequire(import.meta.url);
    const pkg = requireFromHere('@axonsdk/cli/package.json') as {
      name: string;
      version: string;
    };
    const notifier = updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 });
    notifier.notify();
  } catch {
    // Update check is non-critical — ignore errors
  }
}

// ─── Command registration ─────────────────────────────────────────────────────

program
  .name('axon')
  .description('Build edge dApps once. Run them confidentially on millions of smartphones.')
  .version(VERSION, '-v, --version', 'Print version and check for updates');

// axon init
program
  .command('init')
  .description('Interactive setup: create axon.json, .env, and template files')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    await runInit(process.cwd());
  });

// axon deploy [template]
program
  .command('deploy [template]')
  .description('Bundle, upload to IPFS, and register a deployment on the provider network')
  .action(async (template?: string) => {
    const { runDeploy } = await import('./commands/deploy.js');
    await runDeploy(template, process.cwd());
  });

// axon status
program
  .command('status')
  .description('List deployments and their current status')
  .action(async () => {
    const { runStatus } = await import('./commands/status.js');
    await runStatus(process.cwd());
  });

// axon teardown <deploymentId>
program
  .command('teardown <deploymentId>')
  .description('Delete a deployment from the provider')
  .action(async (deploymentId: string) => {
    const { runTeardown } = await import('./commands/teardown.js');
    await runTeardown(deploymentId, process.cwd());
  });

// axon send <pubkey> <message>
program
  .command('send <pubkey> <message>')
  .description('Send a test message to a processor node')
  .action(async (pubkey: string, message: string) => {
    const { runSend } = await import('./commands/send.js');
    await runSend(pubkey, message, process.cwd());
  });

// axon template
const templateCmd = program
  .command('template')
  .description('Manage built-in templates');

templateCmd
  .command('list')
  .description('Show available built-in templates')
  .action(async () => {
    const { runTemplateList } = await import('./commands/template.js');
    await runTemplateList();
  });

// axon run-local [template]
program
  .command('run-local [template]')
  .description('Run a deployment script locally using a mock _STD_ environment')
  .action(async (template?: string) => {
    const { runLocal } = await import('./commands/run-local.js');
    await runLocal(template, process.cwd());
  });

// axon auth [provider]
program
  .command('auth [provider]')
  .description('Set up credentials for a provider (acurast | fluence | koii | akash)')
  .action(async (provider?: string) => {
    const { runAuth } = await import('./commands/auth.js');
    await runAuth(provider, process.cwd());
  });

// ─── Global error handler ─────────────────────────────────────────────────────

program.exitOverride();

process.on('unhandledRejection', (err) => {
  console.error('\n  Unexpected error:', (err as Error).message ?? err);
  process.exit(1);
});

// ─── Run ──────────────────────────────────────────────────────────────────────

// Run update check in background (non-blocking)
checkForUpdates().catch(() => {});

program.parseAsync(process.argv).catch((err: Error) => {
  // Commander's exitOverride throws CommanderError for --help / --version
  // which is fine — only re-throw real errors
  if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
    const code = (err as { code: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.version') {
      process.exit(0);
    }
  }
  console.error('\n  Error:', err.message);
  process.exit(1);
});
