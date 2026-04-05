/**
 * @phonixsdk/inference — OpenAI-compatible inference endpoint handler.
 *
 * Drop-in replacement for the OpenAI API that routes requests through
 * Phonix's decentralised compute network (io.net, Akash, Acurast).
 *
 * Usage:
 *   // Before — locked to OpenAI
 *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *
 *   // After — routes to cheapest/fastest decentralised compute
 *   const openai = new OpenAI({
 *     baseURL: 'https://api.phonixsdk.dev/v1',
 *     apiKey: process.env.PHONIX_SECRET_KEY,
 *   });
 *
 *   // Everything else stays identical
 *   const completion = await openai.chat.completions.create({ ... });
 */

export { PhonixInferenceHandler } from './handler.js';
export { PhonixInferenceRouter } from './router.js';
export type { InferenceRequest, InferenceResponse, InferenceStreamChunk, ModelInfo } from './types.js';
