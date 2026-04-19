/**
 * FluenceProvider — full implementation.
 *
 * Deploys AxonSDK spells to the Fluence P2P network and exchanges messages
 * with workers via @fluencelabs/js-client.
 *
 * Required credentials (in .env):
 *   FLUENCE_PRIVATE_KEY  — hex EVM-compatible private key
 *   FLUENCE_RELAY_ADDR   — Fluence relay multiaddr (optional, uses kras-00 default)
 *   FLUENCE_NETWORK      — 'testnet' | 'mainnet' (optional, default: 'testnet')
 */

import type { IAxonProvider } from '../base.js';
import type { DeploymentConfig, Deployment, CostEstimate, Message } from '../../types.js';
import { FluenceMessagingClient, DEFAULT_FLUENCE_RELAY } from './client.js';
import { fluenceDeploy, fluenceEstimate, fluenceListDeployments } from './deploy.js';

export class FluenceProvider implements IAxonProvider {
  readonly name = 'fluence' as const;

  private client: FluenceMessagingClient;
  // secretKey is intentionally NOT stored — it is passed through to the
  // messaging client which zeroes it from the string reference immediately
  // after key derivation. Retaining it here would expose the raw key to
  // heap dumps, serialisation, and object inspection.

  constructor(relayAddr?: string) {
    const relay =
      relayAddr ?? process.env['FLUENCE_RELAY_ADDR'] ?? DEFAULT_FLUENCE_RELAY;
    this.client = new FluenceMessagingClient(relay);
  }

  async connect(secretKey: string): Promise<void> {
    await this.client.connect(secretKey);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    // secretKey is sourced from FLUENCE_PRIVATE_KEY env var inside fluenceDeploy.
    // We do not retain it on the instance.
    return fluenceDeploy({ config });
  }

  async estimate(config: DeploymentConfig): Promise<CostEstimate> {
    const amountFlt = await fluenceEstimate(config);
    // Approximate FLT/USD rate — replace with live oracle in production
    const FLT_USD_RATE = 0.05;
    return {
      provider: 'fluence',
      token: 'FLT',
      amount: amountFlt,
      usdEquivalent: amountFlt * FLT_USD_RATE,
    };
  }

  async listDeployments(): Promise<Deployment[]> {
    const raw = await fluenceListDeployments();
    return raw.map((d) => ({
      id: d.id,
      provider: 'fluence' as const,
      status: d.status as Deployment['status'],
      processorIds: d.processorIds,
      createdAt: new Date(),
      url: `https://console.fluence.network/deals/${d.id}`,
    }));
  }

  async send(workerId: string, payload: unknown): Promise<void> {
    await this.client.send(workerId, payload);
  }

  onMessage(handler: (msg: Message) => void): () => void {
    return this.client.onMessage(handler);
  }

  async teardown(_deploymentId: string): Promise<void> {
    // No centralized registry to teardown from — deployment expires naturally
  }
}
