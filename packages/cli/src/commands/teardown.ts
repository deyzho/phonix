/**
 * axon teardown <deploymentId> — delete a deployment from the provider.
 */

import { loadConfig, AxonClient } from '@axonsdk/sdk';
import { config as loadDotenv } from '../utils/env.js';

async function getChalk() {
  const mod = await import('chalk');
  return mod.default;
}

async function getOra() {
  const mod = await import('ora');
  return mod.default;
}

export async function runTeardown(
  deploymentId: string,
  cwd: string = process.cwd()
): Promise<void> {
  const chalk = await getChalk();
  const ora = await getOra();

  loadDotenv(cwd);
  const spinner = ora(`Tearing down ${deploymentId}...`).start();

  let axonConfig;
  try {
    axonConfig = await loadConfig(cwd);
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }

  const client = new AxonClient({
    provider: axonConfig.provider,
    secretKey: process.env['AXON_SECRET_KEY'],
  });

  try {
    await client.connect();
    await client.teardown(deploymentId);
    spinner.succeed(
      `Deployment ${chalk.bold.cyan(deploymentId)} removed from ${chalk.cyan(axonConfig.provider)}.`
    );
  } catch (err) {
    spinner.fail(`Teardown failed: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    client.disconnect();
  }
}
