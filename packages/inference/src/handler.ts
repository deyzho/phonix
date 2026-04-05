/**
 * PhonixInferenceHandler — OpenAI-compatible HTTP handler.
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
 *   import { PhonixInferenceHandler } from '@phonixsdk/inference';
 *   const handler = new PhonixInferenceHandler({ apiKey: process.env.PHONIX_SECRET_KEY, ... });
 *   export const POST = (req: Request) => handler.handleRequest(req);
 */

import { PhonixInferenceRouter } from './router.js';
import type { PhonixInferenceConfig, InferenceRequest, InferenceResponse, ModelInfo } from './types.js';

const SUPPORTED_MODELS: ModelInfo[] = [
  { id: 'phonix-llama-3-70b',      object: 'model', created: 1700000000, owned_by: 'phonixsdk', provider: 'ionet' },
  { id: 'phonix-mistral-7b',       object: 'model', created: 1700000000, owned_by: 'phonixsdk', provider: 'ionet' },
  { id: 'phonix-llama-3-8b',       object: 'model', created: 1700000000, owned_by: 'phonixsdk', provider: 'akash' },
  { id: 'phonix-tee-phi-3-mini',   object: 'model', created: 1700000000, owned_by: 'phonixsdk', provider: 'acurast' },
];

export class PhonixInferenceHandler {
  private router: PhonixInferenceRouter;
  private apiKey: string;

  constructor(config: PhonixInferenceConfig) {
    this.apiKey = config.apiKey;
    this.router = new PhonixInferenceRouter(config);
  }

  /**
   * Main entry point — routes incoming OpenAI-compatible requests to the
   * appropriate Phonix provider.
   */
  async handleRequest(req: Request): Promise<Response> {
    // Auth check
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== this.apiKey) {
      return this.jsonError(401, 'invalid_api_key', 'Invalid API key.');
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

    const route = this.router.pickEndpoint();
    const t0 = Date.now();

    try {
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
        return this.handleChatCompletion(req);
      }

      if (body.stream) {
        // Pass through the SSE stream directly
        return new Response(providerRes.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Phonix-Provider': route.provider,
          },
        });
      }

      const data = await providerRes.json() as InferenceResponse;
      data.provider = route.provider;

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'X-Phonix-Provider': route.provider,
        },
      });

    } catch (err) {
      this.router.markUnavailable(route.provider);
      return this.jsonError(503, 'provider_unavailable', `Provider ${route.provider} is unavailable: ${(err as Error).message}`);
    }
  }

  private handleListModels(): Response {
    return new Response(JSON.stringify({
      object: 'list',
      data: SUPPORTED_MODELS,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  private jsonError(status: number, code: string, message: string): Response {
    return new Response(JSON.stringify({
      error: { message, type: code, code, param: null }
    }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
