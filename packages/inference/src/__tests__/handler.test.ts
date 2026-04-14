import { describe, it, expect, vi, beforeEach } from 'vitest';
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
