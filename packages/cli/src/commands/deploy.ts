/**
 * axon deploy [template] — bundle, upload to IPFS, register deployment.
 *
 * Loads axon.json, instantiates AxonClient, calls client.deploy(),
 * and prints a friendly success message.
 */

import { loadConfig, AxonClient } from '@axonsdk/sdk';
import type { DeploymentConfig } from '@axonsdk/sdk';
import { config as loadDotenv } from '../utils/env.js';

async function getChalk() {
  const mod = await import('chalk');
  return mod.default;
}

async function getOra() {
  const mod = await import('ora');
  return mod.default;
}

export async function runDeploy(
  _template: string | undefined,
  cwd: string = process.cwd()
): Promise<void> {
  const chalk = await getChalk();
  const ora = await getOra();

  // Load .env first
  loadDotenv(cwd);

  const spinner = ora('Loading axon.json...').start();

  let axonConfig;
  try {
    axonConfig = await loadConfig(cwd);
    spinner.text = 'Connecting to provider...';
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }

  // Build client from config
  const client = new AxonClient({
    provider: axonConfig.provider,
    secretKey: process.env['AXON_SECRET_KEY'],
  });

  try {
    await client.connect();
  } catch (err) {
    spinner.fail(
      `Failed to connect to ${axonConfig.provider}: ${(err as Error).message}`
    );
    process.exit(1);
  }

  try {
    spinner.text = `Deploying to ${chalk.cyan(axonConfig.provider)}...`;

    const deployConfig: DeploymentConfig = {
      runtime: axonConfig.runtime,
      code: axonConfig.entryFile,
      schedule: axonConfig.schedule,
      replicas: axonConfig.replicas,
      maxCostPerExecution: axonConfig.maxCostPerExecution,
      environment: axonConfig.environment,
      destinations: axonConfig.destinations,
    };

    const deployment = await client.deploy(deployConfig);

    spinner.succeed(
      `Deployment ${chalk.bold.green('live')}!`
    );

    console.log();
    console.log(
      `  ${chalk.bold('Deployment ID:')} ${chalk.cyan(deployment.id)}`
    );

    if (deployment.url) {
      console.log(
        `  ${chalk.bold('URL:')}           ${chalk.underline.blue(deployment.url)}`
      );
    }

    console.log(
      `  ${chalk.bold('Status:')}        ${chalk.green(deployment.status)}`
    );

    if (deployment.processorIds.length > 0) {
      console.log(
        `  ${chalk.bold('Processors:')}    ${deployment.processorIds.length} matched`
      );
      for (const id of deployment.processorIds) {
        console.log(`    ${chalk.gray('•')} ${id}`);
      }
    } else {
      console.log(
        chalk.yellow(
          '\n  No processors matched yet — check back with `axon status` in a few minutes.'
        )
      );
    }

    console.log();
    console.log(chalk.bold('  Send your first message:'));
    const firstProcessor =
      deployment.processorIds[0] ?? '<processorId>';
    console.log(
      chalk.white(`  axon send ${firstProcessor} '{"prompt":"Hello world"}'`)
    );
    console.log();
  } catch (err) {
    spinner.fail(
      `Deployment failed: ${(err as Error).message}`
    );

    if ((err as Error).message.includes('ACURAST_MNEMONIC')) {
      console.log();
      console.log(
        chalk.yellow(
          '  Tip: Set ACURAST_MNEMONIC in your .env file and try again.'
        )
      );
    }

    process.exit(1);
  } finally {
    client.disconnect();
  }
}
