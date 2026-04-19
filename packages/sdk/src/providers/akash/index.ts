/**
 * AkashProvider — full implementation of IAxonProvider for the Akash Network.
 *
 * Akash is a decentralised cloud computing marketplace where providers bid to
 * run containerised workloads. AxonSDK wraps the full deployment lifecycle:
 *
 *  1. Bundle the user's TypeScript/JavaScript entry file with esbuild
 *  2. Upload the bundle to IPFS (CID used as the immutable source of truth)
 *  3. Generate an Akash SDL that downloads the bundle at container startup
 *  4. Create the deployment via the provider-services CLI
 *  5. Communicate with running containers over HTTPS (POST /message)
 *
 * Required credentials (in .env — run `axon auth akash` to set up):
 *   AKASH_MNEMONIC       — BIP-39 wallet mnemonic (12 or 24 words)
 *   AKASH_IPFS_URL       — IPFS API endpoint for uploading bundles
 *   AKASH_IPFS_API_KEY   — IPFS API key (optional for public nodes)
 *   AKASH_NODE           — Akash RPC node (default: https://rpc.akashnet.net:443)
 *   AKASH_NET            — mainnet | testnet (default: mainnet)
 */

import type { IAxonProvider } from '../base.js';
import type { DeploymentConfig, Deployment, CostEstimate, Message } from '../../types.js';
import { AkashMessagingClient } from './client.js';
import { akashDeploy, akashEstimate, akashListDeployments } from './deploy.js';

export class AkashProvider implements IAxonProvider {
  readonly name = 'akash' as const;

  private client: AkashMessagingClient;

  constructor() {
    this.client = new AkashMessagingClient();
  }

  async connect(secretKey: string): Promise<void> {
    await this.client.connect(secretKey);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    return akashDeploy({ config });
  }

  async estimate(config: DeploymentConfig): Promise<CostEstimate> {
    const uakt = await akashEstimate(config);
    // Approximate AKT/USD rate — replace with live oracle in production
    const AKT_USD_RATE = 1.5;
    const akt = uakt / 1_000_000;
    return {
      provider: 'akash',
      token: 'AKT',
      amount: uakt,
      usdEquivalent: akt * AKT_USD_RATE,
    };
  }

  async listDeployments(): Promise<Deployment[]> {
    const raw = await akashListDeployments();
    return raw.map((d) => ({
      id: d.id,
      provider: 'akash' as const,
      status: d.status as Deployment['status'],
      processorIds: d.processorIds,
      createdAt: new Date(),
      url: `https://cloudmos.io/akash/deployments/${d.id}`,
    }));
  }

  async send(leaseEndpoint: string, payload: unknown): Promise<void> {
    await this.client.send(leaseEndpoint, payload);
  }

  onMessage(handler: (msg: Message) => void): () => void {
    return this.client.onMessage(handler);
  }

  async teardown(_deploymentId: string): Promise<void> {
    // No centralized registry to teardown from — deployment expires naturally
  }
}
