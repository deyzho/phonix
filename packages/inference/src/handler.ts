/**
 * AxonInferenceHandler — OpenAI-compatible HTTP handler.
 *
 * Implements the OpenAI Chat Completions API surface:
 *   POST /v1/chat/completions   — chat completion (streaming + non-streaming)
 *   GET  /v1/models             — list available models
 *
 * Drop this into any Node.js HTTP server, Next.js API route, Express app,
 * or Cloudflare Worker.
 *
 * Example (Next.js App Router):
 *   // app/api/v1/chat/completions/route.ts
 *   import { AxonInferenceHandler } from '@axonsdk/inference';
 *   const handler = new AxonInferenceHandler({ apiKey: process.env.AXON_SECRET_KEY, ... });
 *   export const POST = (req: Request) => handler.handleRequest(req);
 */

import { AxonInferenceRouter } from './router.js';
import type { AxonInferenceConfig, InferenceRequest, InferenceResponse, ModelInfo } from './types.js';
import { assertSafeUrl } from '@axonsdk/sdk';

const RATE_LIMIT_RPM = 60;

const SUPPORTED_MODELS: ModelInfo[] = [
  { id: 'axon-llama-3-70b',      object: 'model', created: 1700000000, owned_by: 'axonsdk', provider: 'ionet' },
  { id: 'axon-mistral-7b',       object: 'model', created: 1700000000, owned_by: 'axonsdk', provider: 'ionet' },
  { id: 'axon-llama-3-8b',       object: 'model', created: 1700000000, owned_by: 'axonsdk', provider: 'akash' },
  { id: 'axon-tee-phi-3-mini',   object: 'model', created: 1700000000, owned_by: 'axonsdk', provider: 'acurast' },
];

export class AxonInferenceHandler {
  private router: AxonInferenceRouter;
  private apiKey: string;
  private readonly rateLimitStore = new Map<string, number[]>();

  constructor(config: AxonInferenceConfig) {
    this.apiKey = config.apiKey;
    this.router = new AxonInferenceRouter(config);
  }

  /**
   * Main entry point — routes incoming OpenAI-compatible requests to the
   * appropriate Axon provider.
   */
  async handleRequest(req: Request): Promise<Response> {
    // Auth check
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== this.apiKey) {
      return this.jsonError(401, 'invalid_api_key', 'Invalid API key.');
    }

    const rateLimitKey = req.headers.get('Authorization') ?? 'anonymous';
    if (!this.checkRateLimit(rateLimitKey)) {
      return this.jsonError(429, 'rate_limit_exceeded', 'Rate limit exceeded. Max 60 requests per minute.');
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    // Route to appropriate handler
    if (path.endsWith('/chat/completions') && req.method === 'POST') {
      return this.handleChatCompletion(req);
    }
    if (path.endsWith('/models') && req.method === 'GET') {
      return this.handleListModels();
    }

    return this.jsonError(404, 'not_found', `Unknown endpoint: ${path}`);
  }

  private async handleChatCompletion(req: Request): Promise<Response> {
    let body: InferenceRequest;
    try {
      body = await req.json() as InferenceRequest;
    } catch {
      return this.jsonError(400, 'invalid_request', 'Request body must be valid JSON.');
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      return this.jsonError(400, 'invalid_request', '"messages" is required.');
    }

    return this.dispatchToProvider(body);
  }

  /**
   * Dispatch a parsed request body to the best available provider,
   * with automatic failover on errors or non-2xx responses.
   */
  private async dispatchToProvider(body: InferenceRequest, attempt = 0): Promise<Response> {
    if (attempt >= 5) {
      return this.jsonError(503, 'provider_unavailable', 'All providers are currently unavailable.');
    }

    // pickEndpoint() throws when no providers remain — convert to 503
    let route: ReturnType<AxonInferenceRouter['pickEndpoint']>;
    try {
      route = this.router.pickEndpoint();
    } catch {
      return this.jsonError(503, 'provider_unavailable', 'No inference providers are currently available.');
    }

    const t0 = Date.now();

    try {
      // Validate the endpoint URL before making any outbound request (defence-in-depth).
      await assertSafeUrl(route.endpoint, route.provider, 'inference endpoint');

      // Forward to the selected provider's inference endpoint
      const providerRes = await fetch(`${route.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      this.router.recordLatency(route.provider, Date.now() - t0);

      if (!providerRes.ok) {
        this.router.markUnavailable(route.provider);
        // Retry on next available provider
        return this.dispatchToProvider(body, attempt + 1);
      }

      if (body.stream) {
        // Pass through the SSE stream directly
        return new Response(providerRes.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Axon-Provider': route.provider,
          },
        });
      }

      const data = await providerRes.json() as InferenceResponse;
      data.provider = route.provider;

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'X-Axon-Provider': route.provider,
        },
      });

    } catch (err) {
      // Network-level error (fetch threw) — mark unavailable and try next
      this.router.markUnavailable(route.provider);
      return this.dispatchToProvider(body, attempt + 1);
    }
  }

  private handleListModels(): Response {
    return new Response(JSON.stringify({
      object: 'list',
      data: SUPPORTED_MODELS,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (this.rateLimitStore.get(key) ?? []).filter(t => t > windowStart);
    if (timestamps.length >= RATE_LIMIT_RPM) return false;
    timestamps.push(now);
    this.rateLimitStore.set(key, timestamps);
    return true;
  }

  private jsonError(status: number, code: string, message: string): Response {
    return new Response(JSON.stringify({
      error: { message, type: code, code, param: null }
    }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
