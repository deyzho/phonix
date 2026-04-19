/**
 * IoNetProvider — GPU compute via io.net clusters.
 *
 * io.net aggregates hundreds of thousands of GPUs into on-demand clusters,
 * offering the lowest-cost GPU compute available anywhere. AxonSDK integrates
 * io.net as a first-class provider, enabling automatic routing between:
 *
 *  - TEE smartphone compute (Acurast) — private, low-cost, always-on
 *  - GPU cloud compute (io.net, Akash) — fast, scalable, inference-optimised
 *
 * The AxonRouter can automatically select between TEE and GPU compute
 * depending on workload requirements using the 'latency' or 'cost' strategy.
 *
 * Required credentials (run `axon auth ionet`):
 *   IONET_API_KEY    — io.net API key from console.io.net
 *   IONET_CLUSTER_ID — target cluster ID (optional — auto-selected if omitted)
 */

import type { IAxonProvider } from '../base.js';
import type { DeploymentConfig, Deployment, CostEstimate, Message } from '../../types.js';
import { IoNetMessagingClient } from './client.js';
import { ionetDeploy, ionetEstimate, ionetListDeployments } from './deploy.js';

export class IoNetProvider implements IAxonProvider {
  readonly name = 'ionet' as const;

  private client: IoNetMessagingClient;

  constructor() {
    this.client = new IoNetMessagingClient();
  }

  async connect(secretKey: string): Promise<void> {
    await this.client.connect(secretKey);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    return ionetDeploy({ config });
  }

  async estimate(config: DeploymentConfig): Promise<CostEstimate> {
    return ionetEstimate(config);
  }

  async listDeployments(): Promise<Deployment[]> {
    const raw = await ionetListDeployments();
    return raw.map((d) => ({
      id: d.id,
      provider: 'ionet' as const,
      status: d.status as Deployment['status'],
      processorIds: d.processorIds,
      createdAt: new Date(),
      url: `https://console.io.net/jobs/${d.id}`,
    }));
  }

  async send(workerEndpoint: string, payload: unknown): Promise<void> {
    await this.client.send(workerEndpoint, payload);
  }

  onMessage(handler: (msg: Message) => void): () => void {
    return this.client.onMessage(handler);
  }

  async teardown(_deploymentId: string): Promise<void> {
    // No centralized registry to teardown from — deployment expires naturally
  }
}
