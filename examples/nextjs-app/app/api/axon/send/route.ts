/**
 * POST /api/axon/send
 *
 * Server-side proxy that holds the AXON_SECRET_KEY and relays messages to
 * an Acurast processor, waiting for the matching response before returning.
 *
 * The browser never touches the private key — it only calls this endpoint.
 *
 * Expected request body: { processorId: string; prompt: string; requestId: string }
 * Response body:         { result?: string; error?: string }
 */

import { AxonClient } from '@axonsdk/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Give processors up to 30 s to respond before we time out.
export const maxDuration = 35;

export async function POST(request: Request): Promise<NextResponse> {
  const secretKey = process.env['AXON_SECRET_KEY'];
  if (!secretKey) {
    return NextResponse.json(
      { error: 'Server is not configured (AXON_SECRET_KEY missing).' },
      { status: 500 }
    );
  }

  let body: { processorId?: string; prompt?: string; requestId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { processorId, prompt, requestId } = body;

  if (!processorId || typeof processorId !== 'string') {
    return NextResponse.json({ error: 'Missing processorId.' }, { status: 400 });
  }
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 });
  }
  if (!requestId || typeof requestId !== 'string') {
    return NextResponse.json({ error: 'Missing requestId.' }, { status: 400 });
  }

  const client = new AxonClient({
    provider: 'acurast',
    secretKey,
    trustedProcessorIds: [processorId],
  });

  try {
    await client.connect();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to connect: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      resolve(
        NextResponse.json({ error: 'Processor did not respond within 30 s.' }, { status: 504 })
      );
    }, 30_000);

    const unsubscribe = client.onMessage((msg) => {
      const payload = msg.payload as {
        requestId?: string;
        result?: string;
        error?: string;
      };

      if (payload?.requestId !== requestId) return;

      clearTimeout(timeout);
      unsubscribe();
      client.disconnect();

      if (payload.error) {
        resolve(NextResponse.json({ error: payload.error }, { status: 422 }));
      } else {
        resolve(NextResponse.json({ result: payload.result ?? '' }));
      }
    });

    client
      .send(processorId, { requestId, prompt, model: 'default' })
      .catch((err: Error) => {
        clearTimeout(timeout);
        unsubscribe();
        client.disconnect();
        resolve(
          NextResponse.json({ error: `Send failed: ${err.message}` }, { status: 502 })
        );
      });
  });
}
