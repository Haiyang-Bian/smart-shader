// Test helpers for SSE stream parsing and fetch mocking.
// useAgent's streamChatAPI calls globalThis.fetch('/api/chat', ...) and parses
// `data: {json}\n\n` SSE lines. We construct scripted streams so each test
// scenario can replay the exact AI behaviour it wants to exercise.

import { vi } from 'vitest'

export type SSEEvent = Record<string, unknown>

function encodeSSE(events: SSEEvent[], signal?: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
    cancel() {
      signal?.abort()
    }
  })
}

// Install a mocked fetch that:
//   - responds with the next scripted SSE stream to `/api/chat` calls
//   - returns an empty 204 OK for everything else (e.g. `/api/log` from agent's reportLog)
export function installFetchScript(responses: SSEEvent[][], opts: { failAfter?: boolean } = {}) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = typeof url === 'string' ? url : url instanceof URL ? url.pathname : url.url
    if (!target.includes('/api/chat')) {
      return new Response('', { status: 204 })
    }
    const next = queue.shift()
    if (!next) {
      if (opts.failAfter) {
        throw new Error('fetch queue exhausted')
      }
      return new Response('', { status: 204 })
    }
    return new Response(encodeSSE(next, init?.signal as AbortSignal | undefined), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })
  }))
}

// Compose a "coder reply" event set: a reasoning block + a glsl code block + DONE.
// Mirrors what a real Coder round emits via chat.post.ts streaming.
export function coderEvents(opts: { code: string; reasoning?: string; prelude?: string }): SSEEvent[] {
  const events: SSEEvent[] = []
  if (opts.reasoning) {
    events.push({ type: 'reasoning', content: opts.reasoning + '\n' })
    events.push({ type: 'reasoning_end' })
  }
  if (opts.prelude) events.push({ type: 'content', content: opts.prelude })
  events.push({ type: 'shader', code: opts.code })
  return events
}

// Compose a "reviewer reply" event set: a verdict line + reasoning + DONE.
export function reviewerEvents(opts: { verdict: 'PASS' | 'FAIL'; feedback?: string }): SSEEvent[] {
  const events: SSEEvent[] = []
  if (opts.feedback) events.push({ type: 'reasoning', content: opts.feedback + '\n' })
  events.push({ type: 'content', content: `Looks good.\nVERDICT: ${opts.verdict}` })
  return events
}