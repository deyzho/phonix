/**
 * axon init — interactive project setup.
 *
 * Steps:
 *  1. Ask: project name, provider, template
 *  2. Write axon.json
 *  3. Write .env with placeholder comments
 *  4. Copy template files into cwd
 *  5. Print success message + next steps
 */

import { writeFile, copyFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { generateConfig, generateP256KeyPair } from '@axonsdk/sdk';
import type { ProviderName, RuntimeType } from '@axonsdk/sdk';

// ─── Lazy imports for ESM-only packages ──────────────────────────────────────

async function getInquirer() {
  const mod = await import('inquirer');
  return mod.default;
}

async function getChalk() {
  const mod = await import('chalk');
  return mod.default;
}

async function getOra() {
  const mod = await import('ora');
  return mod.default;
}

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = {
  inference: {
    name: 'Confidential Inference',
    description: 'LLM inference running privately inside a TEE on Acurast phones',
    provider: 'acurast' as ProviderName,
  },
  oracle: {
    name: 'Data Oracle',
    description: 'Fetches external data, signs it, and pushes to a destination',
    provider: 'acurast' as ProviderName,
  },
  blank: {
    name: 'Blank',
    description: 'Empty project — start from scratch',
    provider: 'acurast' as ProviderName,
  },
} as const;

type TemplateName = keyof typeof TEMPLATES;

// ─── File path resolution ─────────────────────────────────────────────────────

/**
 * Resolve the absolute path to a built-in template directory.
 */
function resolveTemplatePath(templateName: TemplateName): string {
  // Try to find the templates directory relative to the CLI package
  const requireFromHere = createRequire(import.meta.url);
  try {
    // When installed as a package, templates are at @axonsdk/cli/../../../templates
    const cliPkg = requireFromHere.resolve('@axonsdk/cli/package.json');
    const cliRoot = dirname(cliPkg);
    return join(cliRoot, '..', '..', 'templates', templateName);
  } catch {
    // Development fallback: resolve from monorepo root
    const thisDir = dirname(new URL(import.meta.url).pathname);
    return join(thisDir, '..', '..', '..', '..', 'templates', templateName);
  }
}

// ─── Template file copying ────────────────────────────────────────────────────

const BLANK_INDEX_TS = `// axon deployment script
// This runs ON the device inside the TEE
declare const _STD_: any;

_STD_.ws.open(
  'wss://ws-1.ws-server-1.acurast.com/ws',
  {},
  () => { print('Connected to Axon WS'); },
  (payload: string) => {
    // Handle incoming messages
    print('Received: ' + payload);
    _STD_.ws.send(payload); // echo back
  },
  (err: any) => { print('Error: ' + JSON.stringify(err)); }
);
`;

async function copyTemplateFiles(
  templateName: TemplateName,
  cwd: string
): Promise<void> {
  if (templateName === 'blank') {
    // Write a blank index.ts
    const srcDir = join(cwd, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'index.ts'), BLANK_INDEX_TS, 'utf8');
    return;
  }

  const templateDir = resolveTemplatePath(templateName);
  const srcDir = join(cwd, 'src');
  await mkdir(srcDir, { recursive: true });

  try {
    // Copy src/index.ts
    await copyFile(join(templateDir, 'src', 'index.ts'), join(srcDir, 'index.ts'));
  } catch {
    // If template files are not found (e.g. not installed), fall back to blank
    await writeFile(join(srcDir, 'index.ts'), BLANK_INDEX_TS, 'utf8');
  }
}

// ─── Main init command ────────────────────────────────────────────────────────

export async function runInit(cwd: string = process.cwd()): Promise<void> {
  const chalk = await getChalk();
  const inquirer = await getInquirer();
  const ora = await getOra();

  console.log();
  console.log(chalk.bold.cyan('  Welcome to Axon SDK v0.1'));
  console.log(chalk.gray('  Build edge dApps once. Run them on millions of phones.\n'));

  // Check if axon.json already exists
  const configPath = join(cwd, 'axon.json');
  try {
    await access(configPath);
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('axon.json already exists. Overwrite?'),
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.gray('  Aborted.'));
      return;
    }
  } catch {
    // File doesn't exist — proceed
  }

  // ── Prompt user ──────────────────────────────────────────────────────────

  const answers = await inquirer.prompt<{
    projectName: string;
    provider: ProviderName;
    template: TemplateName;
    replicas: number;
  }>([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: 'my-edge-app',
      validate: (v: string) =>
        v.trim() ? true : 'Project name cannot be empty',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: [
        { name: 'Acurast  (v0.1 — fully supported)', value: 'acurast' },
        { name: 'Fluence  (v0.2 — coming soon)', value: 'fluence' },
        { name: 'Koii     (v0.2 — coming soon)', value: 'koii' },
      ],
      default: 'acurast',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Template:',
      choices: [
        {
          name: `inference  — ${TEMPLATES.inference.description}`,
          value: 'inference',
        },
        {
          name: `oracle     — ${TEMPLATES.oracle.description}`,
          value: 'oracle',
        },
        {
          name: `blank      — ${TEMPLATES.blank.description}`,
          value: 'blank',
        },
      ],
      default: 'inference',
    },
    {
      type: 'number',
      name: 'replicas',
      message: 'Number of processor replicas:',
      default: 3,
      validate: (v: number) => (v >= 1 && v <= 100 ? true : 'Must be between 1 and 100'),
    },
  ]);

  const spinner = ora('Initialising project...').start();

  try {
    // ── Generate and write axon.json ─────────────────────────────────────
    const configContent = generateConfig({
      projectName: answers.projectName,
      provider: answers.provider,
      runtime: 'nodejs' as RuntimeType,
      entryFile: 'src/index.ts',
      scheduleType: 'on-demand',
      durationMs: 86_400_000,
      replicas: answers.replicas,
    });
    await writeFile(configPath, configContent, 'utf8');

    // ── Generate P256 keypair and write .env stub ──────────────────────────
    // A minimal .env is written here; the auth wizard (run next) fills it in.
    const { secretKeyHex } = generateP256KeyPair();
    const envContent =
      `# ─── Axon environment variables ────────────────────────────────────────────\n` +
      `# Run: axon auth ${answers.provider}   to set up credentials interactively.\n` +
      `#\n` +
      `# P256 private key — auto-generated by axon init\n` +
      `AXON_SECRET_KEY=${secretKeyHex}\n`;

    await writeFile(join(cwd, '.env'), envContent, 'utf8');

    // ── Write .gitignore entry for .env ────────────────────────────────────
    let gitignoreContent = '';
    try {
      const { readFile } = await import('node:fs/promises');
      gitignoreContent = await readFile(join(cwd, '.gitignore'), 'utf8');
    } catch {
      // .gitignore doesn't exist yet
    }
    const alreadyIgnored = gitignoreContent
      .split('\n')
      .some((line) => line.trim() === '.env');
    if (!alreadyIgnored) {
      const newGitignore =
        (gitignoreContent ? gitignoreContent.trimEnd() + '\n\n' : '') +
        '# Axon secrets\n.env\nnode_modules/\ndist/\n';
      await writeFile(join(cwd, '.gitignore'), newGitignore, 'utf8');
    }

    // ── Copy template files ────────────────────────────────────────────────
    await copyTemplateFiles(answers.template, cwd);

    spinner.succeed('Project initialised!');

    // ── Offer to configure credentials now ────────────────────────────────
    console.log();
    const { setupNow } = await inquirer.prompt<{ setupNow: boolean }>([
      {
        type: 'confirm',
        name: 'setupNow',
        message: `Configure ${answers.provider} credentials now? ${chalk.gray('(recommended)')}`,
        default: true,
      },
    ]);

    if (setupNow) {
      const { runAuth } = await import('./auth.js');
      await runAuth(answers.provider, cwd);
    }

    // ── Print next steps ───────────────────────────────────────────────────
    console.log();
    console.log(chalk.bold('  Next steps:'));
    console.log();
    if (!setupNow) {
      console.log(
        `  ${chalk.cyan('1.')} Configure credentials:`
      );
      console.log(chalk.bold.white(`       axon auth ${answers.provider}`));
      console.log();
      console.log(
        `  ${chalk.cyan('2.')} Edit ${chalk.yellow('src/index.ts')} with your deployment logic`
      );
      console.log();
      console.log(`  ${chalk.cyan('3.')} Deploy:`);
      console.log(chalk.bold.white('       axon deploy'));
    } else {
      console.log(
        `  ${chalk.cyan('1.')} Edit ${chalk.yellow('src/index.ts')} with your deployment logic`
      );
      console.log();
      console.log(`  ${chalk.cyan('2.')} Test locally:`);
      console.log(chalk.bold.white('       axon run-local'));
      console.log();
      console.log(`  ${chalk.cyan('3.')} Deploy:`);
      console.log(chalk.bold.white('       axon deploy'));
    }
    console.log();
    console.log(
      `  ${chalk.cyan('4.')} Send a test message:`
    );
    console.log(chalk.bold.white('       axon send <processorId> \'{"hello":"world"}\''));
    console.log();
    console.log(
      chalk.gray(
        `  Docs: https://github.com/deyzho/axon-ts#readme`
      )
    );
    console.log();
  } catch (err) {
    spinner.fail('Initialisation failed');
    throw err;
  }
}
