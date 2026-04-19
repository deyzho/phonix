'use client';

/**
 * Axon Next.js Example — Confidential Inference dApp
 *
 * The private key (AXON_SECRET_KEY) is held exclusively by the server.
 * This component never imports @axonsdk/sdk — it only calls the server-side
 * API route at /api/axon/send, which relays the message and returns the result.
 *
 * Setup:
 *  1. Deploy the inference template: axon deploy
 *  2. Copy the processor ID from the deploy output
 *  3. Set AXON_SECRET_KEY in your .env.local  (NOT NEXT_PUBLIC_)
 *  4. Set PROCESSOR_ID in your .env.local        (NOT NEXT_PUBLIC_)
 *  5. npm run dev
 */

import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InferenceMessage {
  id: string;
  type: 'prompt' | 'result' | 'error' | 'status';
  text: string;
  timestamp: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  // Runs in the browser where window.crypto is always available.
  return crypto.randomUUID();
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function AxonDemoPage() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<InferenceMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [processorId, setProcessorId] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendPrompt = async () => {
    if (!prompt.trim() || sending || !processorId.trim()) return;

    const trimmedPrompt = prompt.trim();
    const requestId = generateId();

    setMessages((prev) => [
      ...prev,
      { id: requestId, type: 'prompt', text: trimmedPrompt, timestamp: new Date() },
    ]);
    setPrompt('');
    setSending(true);

    try {
      // The private key lives only on the server — this fetch is the only
      // client→network call this page makes.
      const res = await fetch('/api/axon/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processorId: processorId.trim(), prompt: trimmedPrompt, requestId }),
      });

      const data = (await res.json()) as { result?: string; error?: string };

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), type: 'error', text: `Error: ${data.error}`, timestamp: new Date() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), type: 'result', text: data.result ?? '', timestamp: new Date() },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          type: 'error',
          text: `Request failed: ${(err as Error).message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 720,
        margin: '0 auto',
        padding: '2rem 1rem',
        minHeight: '100vh',
        background: '#0f0f0f',
        color: '#e5e5e5',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', margin: 0 }}>
          Axon Inference Demo
        </h1>
        <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.95rem' }}>
          Confidential LLM inference on Acurast smartphone nodes
        </p>
      </div>

      {/* Processor ID input */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <label style={{ fontSize: '0.8rem', color: '#888', display: 'block', marginBottom: 4 }}>
          Processor ID
        </label>
        <input
          type="text"
          value={processorId}
          onChange={(e) => setProcessorId(e.target.value)}
          placeholder="0xabc... (from axon status)"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            background: '#111',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#e5e5e5',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#555' }}>
          Your private key is kept on the server — it is never sent to the browser.
        </p>
      </div>

      {/* Message history */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          minHeight: 300,
          maxHeight: 400,
          overflowY: 'auto',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#555',
              fontSize: '0.9rem',
            }}
          >
            Enter a processor ID and send a prompt to get started
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.type === 'prompt' ? 'row-reverse' : 'row',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.6rem 0.9rem',
                  borderRadius:
                    msg.type === 'prompt' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background:
                    msg.type === 'prompt' ? '#4f46e5' : msg.type === 'error' ? '#2a0a0a' : '#222',
                  border:
                    msg.type === 'error'
                      ? '1px solid #5a1a1a'
                      : msg.type === 'status'
                      ? '1px solid #2a2a2a'
                      : 'none',
                  color:
                    msg.type === 'error' ? '#f87171' : msg.type === 'status' ? '#888' : '#e5e5e5',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.type !== 'prompt' && (
                  <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: 2 }}>
                    {msg.type === 'result' ? 'Processor response' : msg.type}
                  </div>
                )}
                {msg.text}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div
              style={{
                padding: '0.6rem 0.9rem',
                background: '#222',
                borderRadius: '12px 12px 12px 4px',
                color: '#888',
                fontSize: '0.9rem',
              }}
            >
              Processing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a prompt... (Enter to send, Shift+Enter for newline)"
          disabled={sending}
          rows={3}
          style={{
            flex: 1,
            padding: '0.75rem',
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            color: '#e5e5e5',
            fontSize: '0.95rem',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={sendPrompt}
          disabled={!prompt.trim() || !processorId.trim() || sending}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            opacity: !prompt.trim() || !processorId.trim() || sending ? 0.4 : 1,
            alignSelf: 'flex-end',
          }}
        >
          Send
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#111',
          borderRadius: 8,
          fontSize: '0.8rem',
          color: '#555',
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: '#888' }}>How this works:</strong> Your prompt is sent to a
        Next.js API route which securely forwards it to an Acurast processor node running inside a
        TEE on a smartphone. The private key never leaves the server. The processor runs inference
        privately and returns the result over an end-to-end encrypted WebSocket.
        <br />
        <br />
        <a
          href="https://github.com/deyzho/axon-ts"
          style={{ color: '#6366f1', textDecoration: 'none' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          View source on GitHub
        </a>
        {' · '}
        <a
          href="https://docs.acurast.com"
          style={{ color: '#6366f1', textDecoration: 'none' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Acurast docs
        </a>
      </div>
    </main>
  );
}
