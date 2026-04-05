// OpenAI-compatible request/response types

export interface InferenceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceRequest {
  model: string;
  messages: InferenceMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface InferenceChoice {
  index: number;
  message: InferenceMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface InferenceUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface InferenceResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: InferenceChoice[];
  usage: InferenceUsage;
  provider: string;  // Which Phonix provider handled this request
}

export interface InferenceStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  provider: string;  // 'ionet' | 'akash' | 'acurast'
}

export interface PhonixInferenceConfig {
  /** Phonix secret key — same as PHONIX_SECRET_KEY */
  apiKey: string;
  /** Preferred provider for inference. Default: auto (cost-optimised) */
  preferredProvider?: 'ionet' | 'akash' | 'acurast';
  /** Routing strategy. Default: 'cost' */
  strategy?: 'cost' | 'latency' | 'availability' | 'balanced';
  /** io.net worker endpoint (required if using ionet) */
  ionetEndpoint?: string;
  /** Akash lease endpoint */
  akashEndpoint?: string;
  /** Acurast WebSocket URL */
  acurastWsUrl?: string;
}
