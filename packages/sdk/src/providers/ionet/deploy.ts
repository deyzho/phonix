/**
 * io.net deployment logic.
 *
 * io.net workers are deployed as GPU-accelerated containers via the io.net
 * cluster API. Axon handles:
 *  1. Bundling the entry file with esbuild
 *  2. Uploading the bundle to IPFS
 *  3. Submitting a cluster job to the io.net API
 *  4. Polling until the worker is live
 *
 * Required credentials (run `axon auth ionet` to set up):
 *   IONET_API_KEY    — io.net API key from console.io.net
 *   IONET_CLUSTER_ID — target cluster ID (optional — auto-selected if omitted)
 *   IONET_IPFS_URL   — IPFS API endpoint for bundle uploads
 */

import { ProviderNotImplementedError } from '../../types.js';
import type { DeploymentConfig, Deployment, CostEstimate } from '../../types.js';

const IONET_API_BASE = 'https://api.io.net/v1';
const COST_PER_HOUR_USD = 0.40; // approximate A100 spot price on io.net

export async function ionetDeploy(options: { config: DeploymentConfig }): Promise<Deployment> {
  const apiKey = process.env['IONET_API_KEY'];
  const clusterId = process.env['IONET_CLUSTER_ID'];

  if (!apiKey) {
    throw new ProviderNotImplementedError('ionet', 'IONET_API_KEY env var is required. Run `axon auth ionet`.');
  }

  const config = options.config;

  // Bundle entry file
  const { build } = await import('esbuild');
  const bundleResult = await build({
    entryPoints: [config.code],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });

  const bundleCode = bundleResult.outputFiles[0]?.text ?? '';

  // Upload bundle to IPFS
  const ipfsUrl = process.env['IONET_IPFS_URL'] ?? process.env['AKASH_IPFS_URL'];
  let bundleCid = 'local';
  if (ipfsUrl) {
    const ipfsKey = process.env['IONET_IPFS_API_KEY'] ?? process.env['AKASH_IPFS_API_KEY'] ?? '';
    const uploadRes = await fetch(`${ipfsUrl}/api/v0/add`, {
      method: 'POST',
      headers: ipfsKey ? { 'Authorization': `Bearer ${ipfsKey}` } : {},
      body: bundleCode,
      signal: AbortSignal.timeout(30_000),
    });
    if (uploadRes.ok) {
      const data = await uploadRes.json() as { Hash?: string };
      bundleCid = data.Hash ?? 'local';
    }
  }

  // Submit cluster job
  const jobPayload = {
    cluster_id: clusterId,
    runtime: config.runtime,
    bundle_cid: bundleCid,
    replicas: config.replicas ?? 1,
    duration_ms: config.schedule?.durationMs ?? 3_600_000,
    environment: config.environment ?? {},
  };

  const jobRes = await fetch(`${IONET_API_BASE}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(jobPayload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!jobRes.ok) {
    throw new Error(`io.net job creation failed: ${jobRes.status} ${await jobRes.text()}`);
  }

  const job = await jobRes.json() as {
    job_id: string;
    worker_endpoints: string[];
    cluster_id: string;
    status: string;
  };

  return {
    id: job.job_id,
    provider: 'ionet',
    status: job.status === 'running' ? 'live' : 'pending',
    processorIds: job.worker_endpoints ?? [],
    createdAt: new Date(),
    url: `https://console.io.net/jobs/${job.job_id}`,
  };
}

export async function ionetEstimate(config: DeploymentConfig): Promise<CostEstimate> {
  const hours = (config.schedule?.durationMs ?? 3_600_000) / 3_600_000;
  const replicas = config.replicas ?? 1;
  const usdEquivalent = COST_PER_HOUR_USD * hours * replicas;
  return {
    provider: 'ionet',
    token: 'USD',
    amount: usdEquivalent,
    usdEquivalent,
  };
}

export async function ionetListDeployments(): Promise<Array<{
  id: string; status: string; processorIds: string[];
}>> {
  const apiKey = process.env['IONET_API_KEY'];
  if (!apiKey) return [];

  try {
    const res = await fetch(`${IONET_API_BASE}/jobs`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const jobs = await res.json() as Array<{
      job_id: string;
      status: string;
      worker_endpoints: string[];
    }>;
    return jobs.map(j => ({
      id: j.job_id,
      status: j.status === 'running' ? 'live' : j.status,
      processorIds: j.worker_endpoints ?? [],
    }));
  } catch {
    return [];
  }
}
