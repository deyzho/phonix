import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxonInferenceHandler } from '../handler.js';

const TEST_API_KEY = 'test-axon-key-abc123';

function makeHandler(overrides: Record<string, string> = {}) {
  return new AxonInferenceHandler({
    apiKey: TEST_API_KEY,
    ionetEndpoint: 'https://fake-ionet.example.com',
    akashEndpoint: 'https://fake-akash.example.com',
    acurastWsUrl: 'wss://fake-acurast.example.com',
    strategy: 'latency',
    ...overrides,
  });
}

function makeRequest(path: string, method = 'GET', body?: unknown, authKey?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authKey !== undefined) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }
  return new Request(`https://example.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('AxonInferenceHandler — authentication', () => {
  it('should return 401 when Authorization header is missing', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET');
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(401);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('invalid_api_key');
  });

  it('should return 401 when API key is wrong', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET', undefined, 'wrong-key');
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 for malformed Bearer token (no space)', async () => {
    const handler = makeHandler();
    const req = new Request('https://example.com/v1/models', {
      headers: { Authorization: `Bearer${TEST_API_KEY}` },
    });
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(401);
  });

  it('should pass auth with correct API key', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET', undefined, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    // Will be 200 (model list) — not 401
    expect(res.status).not.toBe(401);
  });
});

describe('AxonInferenceHandler — GET /v1/models', () => {
  it('should return a list of models', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET', undefined, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { object: string; data: unknown[] };
    expect(data.object).toBe('list');
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  it('model entries should have id, object, owned_by fields', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET', undefined, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    const data = await res.json() as { data: Array<{ id: string; object: string; owned_by: string }> };
    for (const model of data.data) {
      expect(typeof model.id).toBe('string');
      expect(model.object).toBe('model');
      expect(typeof model.owned_by).toBe('string');
    }
  });

  it('should include axon-llama-3-70b in the model list', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET', undefined, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    const data = await res.json() as { data: Array<{ id: string }> };
    const ids = data.data.map((m) => m.id);
    expect(ids).toContain('axon-llama-3-70b');
  });
});

describe('AxonInferenceHandler — POST /v1/chat/completions (request validation)', () => {
  it('should return 400 when body is not valid JSON', async () => {
    const handler = makeHandler();
    const req = new Request('https://example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: 'not-json',
    });
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(400);
  });

  it('should return 400 when "messages" field is missing', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', { model: 'axon-llama-3-70b' }, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: { message: string } };
    expect(data.error.message).toMatch(/messages/i);
  });

  it('should return 400 when "messages" is not an array', async () => {
    const handler = makeHandler();
    const req = makeRequest(
      '/v1/chat/completions',
      'POST',
      { model: 'axon-llama-3-70b', messages: 'not-an-array' },
      TEST_API_KEY,
    );
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(400);
  });
});

describe('AxonInferenceHandler — routing', () => {
  it('should return 404 for unknown paths', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/unknown', 'GET', undefined, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(404);
  });

  it('response should include Content-Type: application/json for error responses', async () => {
    const handler = makeHandler();
    const req = makeRequest('/v1/models', 'GET');
    const res = await handler.handleRequest(req);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

// ─── POST /v1/chat/completions — routing with mocked fetch ───────────────────

const MOCK_COMPLETION: Record<string, unknown> = {
  id: 'chatcmpl-test123',
  object: 'chat.completion',
  created: 1700000000,
  model: 'axon-llama-3-70b',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello!' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

function mockFetchOk(body: unknown = MOCK_COMPLETION) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    body: null,
  });
}

function mockFetchFail(status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: 'provider error' }),
    body: null,
  });
}

describe('AxonInferenceHandler — POST /v1/chat/completions (with mocked fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const validBody = {
    model: 'axon-llama-3-70b',
    messages: [{ role: 'user' as const, content: 'ping' }],
  };

  it('returns 200 with OpenAI-shaped response on provider success', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { object: string };
    expect(data.object).toBe('chat.completion');
  });

  it('sets X-Axon-Provider header on success', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.headers.get('X-Axon-Provider')).toBeTruthy();
  });

  it('Content-Type is application/json on non-streaming response', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('forwards request with Authorization header to provider', async () => {
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    await handler.handleRequest(req);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TEST_API_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('forwards request body to provider endpoint', async () => {
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const handler = makeHandler();
    const body = { ...validBody, temperature: 0.7, max_tokens: 100 };
    const req = makeRequest('/v1/chat/completions', 'POST', body, TEST_API_KEY);
    await handler.handleRequest(req);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const forwarded = JSON.parse(init.body as string) as typeof body;
    expect(forwarded.messages).toEqual(body.messages);
    expect(forwarded.temperature).toBe(0.7);
    expect(forwarded.max_tokens).toBe(100);
  });

  it('calls provider /v1/chat/completions endpoint path', async () => {
    const fetchSpy = mockFetchOk();
    vi.stubGlobal('fetch', fetchSpy);
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    await handler.handleRequest(req);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/v1/chat/completions');
  });

  it('fails over to next provider when first returns 5xx', async () => {
    // First call fails (ionet), second succeeds (akash)
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}), body: null })
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_COMPLETION, body: null });
    vi.stubGlobal('fetch', fetchSpy);

    const handler = makeHandler({ strategy: 'cost' });
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('returns 503 when all providers fail', async () => {
    // All fetches fail
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({}), body: null,
    }));

    // Single provider so no fallback
    const handler = new AxonInferenceHandler({
      apiKey: TEST_API_KEY,
      ionetEndpoint: 'https://only-provider.example.com',
    });
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(503);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('provider_unavailable');
  });

  it('returns 503 with error body when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const handler = new AxonInferenceHandler({
      apiKey: TEST_API_KEY,
      ionetEndpoint: 'https://unreachable.example.com',
    });
    const req = makeRequest('/v1/chat/completions', 'POST', validBody, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.status).toBe(503);
  });

  it('streaming: passes Content-Type: text/event-stream through', async () => {
    const mockStream = new ReadableStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    }));
    const handler = makeHandler();
    const body = { ...validBody, stream: true };
    const req = makeRequest('/v1/chat/completions', 'POST', body, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('streaming: X-Axon-Provider header is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
    }));
    const handler = makeHandler();
    const req = makeRequest('/v1/chat/completions', 'POST', { ...validBody, stream: true }, TEST_API_KEY);
    const res = await handler.handleRequest(req);
    expect(res.headers.get('X-Axon-Provider')).toBeTruthy();
  });
});
