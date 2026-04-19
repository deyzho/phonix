/**
 * AxonSDK Inference Template — Confidential LLM Inference
 *
 * This script runs ON the device inside the Trusted Execution Environment (TEE).
 * Prompts and responses are private — the device owner and provider cannot see them.
 *
 * How it works:
 *  1. The processor connects to the provider's WebSocket endpoint
 *  2. Your dApp sends { prompt, requestId, model? } via client.send()
 *  3. This script calls your configured LLM API and sends the result back
 *
 * Configuration (set in axon.json > environment, or .env for local testing):
 *   INFERENCE_API_URL  — Base URL of your LLM API (default: http://localhost:11434)
 *                        Supports any OpenAI-compatible endpoint (Ollama, vLLM, etc.)
 *   INFERENCE_API_KEY  — API key (empty string for local Ollama)
 *   INFERENCE_MODEL    — Model name to use (default: llama3)
 *
 * Deploy:   axon deploy
 * Test locally: axon run-local
 *
 * Note: For local testing, INFERENCE_API_URL must use https:// (SSRF protection).
 * Point it at a publicly accessible LLM endpoint or a local Ollama instance
 * with ngrok/cloudflared for tunnelling.
 */

// `phonix` is the provider-agnostic runtime global injected at bundle time.
// In local mode (_STD_ backward compat is also available via the mock shim).
declare const phonix: {
  ws: {
    open(
      url: string,
      options: Record<string, unknown>,
      onOpen: () => void,
      onMessage: (payload: string) => void,
      onError: (err: unknown) => void
    ): void;
    send(payload: string): void;
    close(): void;
  };
  http: {
    POST(
      url: string,
      headers: Record<string, string>,
      body: string,
      callback: (response: string) => void
    ): void;
  };
};

// ─── Configuration ────────────────────────────────────────────────────────────
// These values are injected by esbuild at bundle time from axon.json > environment.

const _RAW_INFERENCE_API_URL: string =
  (typeof process !== 'undefined' && process.env?.['INFERENCE_API_URL']) || '';

// Enforce HTTPS for any non-localhost endpoint.
// Plain HTTP transmits the API key and all prompt/response content in cleartext.
// For local development with Ollama on localhost, use a tunnel (ngrok/cloudflared)
// to expose it via https:// OR accept that local-only traffic is unencrypted.
(function validateInferenceUrl() {
  if (!_RAW_INFERENCE_API_URL) return; // empty = Ollama localhost default (local only)
  try {
    const u = new URL(_RAW_INFERENCE_API_URL);
    if (
      u.protocol !== 'https:' &&
      u.hostname !== 'localhost' &&
      u.hostname !== '127.0.0.1'
    ) {
      // Cannot throw here (TEE env), so log loudly and halt
      print('[phonix:inference] FATAL: INFERENCE_API_URL must use https:// for non-localhost endpoints.');
      print('[phonix:inference] FATAL: Plain HTTP exposes the API key and all prompts in transit.');
      // Intentionally do not connect — stall the script
      return;
    }
  } catch {
    print('[phonix:inference] FATAL: INFERENCE_API_URL is not a valid URL: ' + _RAW_INFERENCE_API_URL);
    return;
  }
})();

const INFERENCE_API_URL: string = _RAW_INFERENCE_API_URL || 'http://localhost:11434';

const INFERENCE_API_KEY: string =
  (typeof process !== 'undefined' && process.env?.['INFERENCE_API_KEY']) || '';

const INFERENCE_MODEL: string =
  (typeof process !== 'undefined' && process.env?.['INFERENCE_MODEL']) || 'llama3';

const WS_URL = 'wss://ws-1.ws-server-1.acurast.com/ws';

// ─── Inference engine ─────────────────────────────────────────────────────────

/**
 * Call the configured LLM API and deliver the result via callback.
 *
 * Uses the OpenAI-compatible chat completions endpoint, which is supported by:
 *  - Ollama  (http://localhost:11434/v1/chat/completions)
 *  - OpenAI  (https://api.openai.com/v1/chat/completions)
 *  - vLLM    (http://your-vllm-server/v1/chat/completions)
 *  - Any OpenAI-compatible provider
 */
function runInference(
  prompt: string,
  model: string,
  onResult: (result: string) => void,
  onError: (err: string) => void
): void {
  const apiUrl = INFERENCE_API_URL.replace(/\/$/, '') + '/v1/chat/completions';

  const requestBody = JSON.stringify({
    model: model || INFERENCE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature: 0.7,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (INFERENCE_API_KEY) {
    headers['Authorization'] = 'Bearer ' + INFERENCE_API_KEY;
  }

  print('[phonix:inference] Calling ' + apiUrl + ' model=' + (model || INFERENCE_MODEL));

  phonix.http.POST(apiUrl, headers, requestBody, (response: string) => {
    let parsed: {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
      error?: { message?: string };
    };
    try {
      parsed = JSON.parse(response) as typeof parsed;
    } catch {
      onError('LLM API returned non-JSON response: ' + response.slice(0, 200));
      return;
    }

    if (parsed.error) {
      onError('LLM API error: ' + (parsed.error.message ?? JSON.stringify(parsed.error)));
      return;
    }

    const choice = parsed.choices?.[0];
    if (!choice) {
      onError('LLM API returned no choices: ' + response.slice(0, 200));
      return;
    }

    // Support both chat completions (message.content) and text completions (text)
    const text = choice.message?.content ?? choice.text ?? '';
    onResult(text);
  });
}

// ─── WebSocket handler ────────────────────────────────────────────────────────

phonix.ws.open(
  WS_URL,

  // WebSocket options
  { headers: {} },

  // onOpen — called when the connection is established
  () => {
    print('[phonix:inference] Connected — ready to receive prompts');
  },

  // onMessage — called for each incoming message from your dApp
  (payload: string) => {
    print('[phonix:inference] Received: ' + payload);

    let parsed: { prompt?: string; requestId?: string; model?: string };
    try {
      parsed = JSON.parse(payload) as typeof parsed;
    } catch {
      print('[phonix:inference] Error: payload is not valid JSON');
      phonix.ws.send(JSON.stringify({ error: 'Invalid JSON payload', requestId: null }));
      return;
    }

    const { prompt, requestId, model } = parsed;

    if (!prompt) {
      phonix.ws.send(
        JSON.stringify({
          error: 'Missing required field: prompt',
          requestId: requestId ?? null,
        })
      );
      return;
    }

    // Run inference and send the result back
    runInference(
      prompt,
      model ?? INFERENCE_MODEL,

      // onResult
      (result: string) => {
        phonix.ws.send(
          JSON.stringify({
            requestId: requestId ?? null,
            result,
            model: model ?? INFERENCE_MODEL,
            timestamp: Date.now(),
          })
        );
        print('[phonix:inference] Result sent (' + result.length + ' chars)');
      },

      // onError
      (err: string) => {
        print('[phonix:inference] Inference error: ' + err);
        phonix.ws.send(
          JSON.stringify({
            error: err,
            requestId: requestId ?? null,
          })
        );
      }
    );
  },

  // onError — called on WebSocket errors
  (err: unknown) => {
    print('[phonix:inference] WebSocket error: ' + JSON.stringify(err));
  }
);

// TypeScript stub for the `print` global available in Acurast TEE and mocked locally
declare function print(msg: string): void;
