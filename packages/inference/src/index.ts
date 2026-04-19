/**
 * @axonsdk/inference — OpenAI-compatible inference endpoint handler.
 *
 * Drop-in replacement for the OpenAI API that routes requests through
 * Axon's decentralised compute network (io.net, Akash, Acurast).
 *
 * Usage:
 *   // Before — locked to OpenAI
 *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *
 *   // After — routes to cheapest/fastest decentralised compute
 *   const openai = new OpenAI({
 *     baseURL: 'https://api.axonsdk.dev/v1',
 *     apiKey: process.env.AXON_SECRET_KEY,
 *   });
 *
 *   // Everything else stays identical
 *   const completion = await openai.chat.completions.create({ ... });
 */

export { AxonInferenceHandler } from './handler.js';
export { AxonInferenceRouter } from './router.js';
export type { InferenceRequest, InferenceResponse, InferenceStreamChunk, ModelInfo } from './types.js';
