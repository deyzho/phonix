import type {
  DeploymentConfig,
  Deployment,
  CostEstimate,
  Message,
  ProviderName,
} from '../types.js';

/**
 * The unified provider interface every AxonSDK backend must satisfy.
 *
 * Five primitives map to five method groups:
 *   Deploy → deploy()
 *   Match  → (handled internally by provider)
 *   Execute → (handled by deployed code)
 *   Message → send() / onMessage()
 *   Pay    → estimate()
 */
export interface IAxonProvider {
  readonly name: ProviderName;

  /**
   * Authenticate against the provider network.
   * @param secretKey — P256 private key hex string (or provider equivalent)
   */
  connect(secretKey: string): Promise<void>;

  /** Tear down any open connections gracefully. */
  disconnect(): void;

  /**
   * Deploy code to the network and return a Deployment object.
   * Implementations must bundle the entry file, upload it, and register it.
   */
  deploy(config: DeploymentConfig): Promise<Deployment>;

  /**
   * Estimate the cost of a deployment without actually deploying.
   */
  estimate(config: DeploymentConfig): Promise<CostEstimate>;

  /**
   * Return a list of all deployments owned by the current keypair.
   */
  listDeployments(): Promise<Deployment[]>;

  /**
   * Delete/stop a deployment by its ID.
   * Should be a no-op (not throw) if the deployment no longer exists.
   */
  teardown(deploymentId: string): Promise<void>;

  /**
   * Send a message payload to a specific processor node.
   * @param processorId — processor public key (hex string)
   * @param payload     — arbitrary JSON-serialisable data
   */
  send(processorId: string, payload: unknown): Promise<void>;

  /**
   * Register a handler for incoming messages from processors.
   * @returns An unsubscribe function — call it to remove the handler.
   */
  onMessage(handler: (msg: Message) => void): () => void;
}
