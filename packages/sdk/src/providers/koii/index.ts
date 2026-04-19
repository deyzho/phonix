/**
 * KoiiProvider — full implementation.
 *
 * Deploys AxonSDK scripts as Koii Tasks on the K2 network and exchanges
 * messages with task nodes via their HTTP API.
 *
 * Required credentials (in .env):
 *   KOII_PRIVATE_KEY   — base58-encoded Solana-compatible private key
 *   KOII_IPFS_URL      — IPFS upload endpoint for task bundles
 *   KOII_IPFS_API_KEY  — IPFS API key (optional)
 *   KOII_NETWORK       — 'mainnet' | 'testnet' (optional, default: 'mainnet')
 *   KOII_TASK_ID       — Task public key, set automatically after first deploy
 */

import type { IAxonProvider } from '../base.js';
import type { DeploymentConfig, Deployment, CostEstimate, Message } from '../../types.js';
import { KoiiMessagingClient } from './client.js';
import { koiiDeploy, koiiEstimate, koiiListDeployments } from './deploy.js';

const DEFAULT_KOII_RPC = 'https://mainnet.koii.network';

export class KoiiProvider implements IAxonProvider {
  readonly name = 'koii' as const;

  private client: KoiiMessagingClient;
  private secretKey: string = '';

  constructor(rpcUrl?: string) {
    const rpc = rpcUrl ?? process.env['KOII_RPC_URL'] ?? DEFAULT_KOII_RPC;
    this.client = new KoiiMessagingClient(rpc);
  }

  async connect(secretKey: string): Promise<void> {
    this.secretKey = secretKey;
    await this.client.connect(secretKey);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    return koiiDeploy({ config, secretKey: this.secretKey });
  }

  async estimate(config: DeploymentConfig): Promise<CostEstimate> {
    const amountKoii = await koiiEstimate(config);
    // Approximate KOII/USD rate — replace with live oracle in production
    const KOII_USD_RATE = 0.02;
    return {
      provider: 'koii',
      token: 'KOII',
      amount: amountKoii,
      usdEquivalent: amountKoii * KOII_USD_RATE,
    };
  }

  async listDeployments(): Promise<Deployment[]> {
    const raw = await koiiListDeployments(this.secretKey);
    return raw.map((d) => ({
      id: d.id,
      provider: 'koii' as const,
      status: d.status as Deployment['status'],
      processorIds: d.processorIds,
      createdAt: new Date(),
      url: `https://app.koii.network/tasks/${d.id}`,
    }));
  }

  async send(nodeEndpoint: string, payload: unknown): Promise<void> {
    await this.client.send(nodeEndpoint, payload);
  }

  onMessage(handler: (msg: Message) => void): () => void {
    return this.client.onMessage(handler);
  }

  async teardown(_deploymentId: string): Promise<void> {
    // No centralized registry to teardown from — deployment expires naturally
  }
}
