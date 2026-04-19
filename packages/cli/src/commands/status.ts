/**
 * axon status — list deployments and their current status.
 *
 * Prints a table of deployments with ID, status, processor pubkeys, and URL.
 */

import { loadConfig, AxonClient } from '@axonsdk/sdk';
import { config as loadDotenv } from '../utils/env.js';
import type { Deployment } from '@axonsdk/sdk';

async function getChalk() {
  const mod = await import('chalk');
  return mod.default;
}

async function getOra() {
  const mod = await import('ora');
  return mod.default;
}

function formatStatus(status: Deployment['status'], chalk: Awaited<ReturnType<typeof getChalk>>) {
  switch (status) {
    case 'live':
      return chalk.bold.green('live');
    case 'pending':
      return chalk.yellow('pending');
    case 'completed':
      return chalk.blue('completed');
    case 'failed':
      return chalk.red('failed');
    default:
      return status;
  }
}

export async function runStatus(cwd: string = process.cwd()): Promise<void> {
  const chalk = await getChalk();
  const ora = await getOra();

  loadDotenv(cwd);

  let axonConfig;
  try {
    axonConfig = await loadConfig(cwd);
  } catch (err) {
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }

  const client = new AxonClient({
    provider: axonConfig.provider,
    secretKey: process.env['AXON_SECRET_KEY'],
  });

  const spinner = ora(`Fetching deployments from ${axonConfig.provider}...`).start();

  let deployments: Deployment[];
  try {
    deployments = await client.listDeployments();
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to fetch deployments: ${(err as Error).message}`);
    process.exit(1);
  }

  if (deployments.length === 0) {
    console.log(chalk.gray('\n  No deployments found.'));
    console.log(
      chalk.gray('  Run ') +
        chalk.white('axon deploy') +
        chalk.gray(' to create your first deployment.\n')
    );
    return;
  }

  console.log();
  console.log(
    chalk.bold(
      `  ${deployments.length} deployment${deployments.length === 1 ? '' : 's'} on ${axonConfig.provider}:\n`
    )
  );

  // Print table header
  const ID_WIDTH = 38;
  const STATUS_WIDTH = 12;
  const PROC_WIDTH = 12;

  const headerLine = [
    chalk.bold.gray('  ID'.padEnd(ID_WIDTH)),
    chalk.bold.gray('Status'.padEnd(STATUS_WIDTH)),
    chalk.bold.gray('Processors'.padEnd(PROC_WIDTH)),
    chalk.bold.gray('URL'),
  ].join('  ');

  console.log(headerLine);
  console.log(chalk.gray('  ' + '─'.repeat(90)));

  for (const dep of deployments) {
    const id = dep.id.length > ID_WIDTH - 2 ? dep.id.slice(0, ID_WIDTH - 5) + '...' : dep.id;
    const status = formatStatus(dep.status, chalk);
    const procCount = String(dep.processorIds.length);
    const url = dep.url ?? chalk.gray('—');

    const line = [
      `  ${chalk.cyan(id.padEnd(ID_WIDTH - 2))}`,
      status.padEnd(STATUS_WIDTH + 9), // +9 for chalk escape codes
      procCount.padEnd(PROC_WIDTH),
      url,
    ].join('  ');

    console.log(line);

    // Print processor IDs
    for (const pid of dep.processorIds) {
      console.log(chalk.gray(`    processor: ${pid}`));
    }
  }

  console.log();
}
