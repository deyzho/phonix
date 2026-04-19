/**
 * axon send <pubkey> <message> — send a test message to a processor.
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

export async function runSend(
  pubkey: string,
  message: string,
  cwd: string = process.cwd()
): Promise<void> {
  const chalk = await getChalk();
  const ora = await getOra();

  loadDotenv(cwd);

  if (!pubkey || !message) {
    console.error(chalk.red('  Usage: axon send <pubkey> <message>'));
    process.exit(1);
  }

  // Parse message — accept raw JSON or plain string
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    payload = message;
  }

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

  const spinner = ora('Connecting...').start();

  try {
    await client.connect();
    spinner.text = `Sending message to ${chalk.cyan(pubkey.slice(0, 16))}...`;

    await client.send(pubkey, payload);

    spinner.succeed(
      `Message sent to ${chalk.cyan(pubkey.slice(0, 20) + '...')}`
    );

    console.log();
    console.log(`  ${chalk.bold('To:')}     ${chalk.gray(pubkey)}`);
    console.log(
      `  ${chalk.bold('Payload:')} ${chalk.gray(JSON.stringify(payload))}`
    );
    console.log();
    console.log(
      chalk.gray(
        '  Listen for replies with: client.onMessage((msg) => console.log(msg.payload))'
      )
    );
    console.log();
  } catch (err) {
    spinner.fail(`Failed to send message: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    client.disconnect();
  }
}
