// Retry transient failures with exponential backoff + jitter.
// Used by every server endpoint that calls a remote AI provider so a single
// network blip does not abort the user's request.
//
// Only retries on:
//   - network errors (TypeError thrown by fetch on connection failure)
//   - HTTP {408, 429, 500, 502, 503, 504}
//
// Non-retryable: any other 4xx. Those bubble up immediately.
//
// Backoff: baseDelay * (3 ** (attempt - 1)) + ±50% jitter.
// Default: 3 attempts with 1000ms base → roughly 1s / 3s / 10s before each retry.
// Pass `signal` (an AbortSignal) to short-circuit retries when the client disconnects.

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  signal?: AbortSignal
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void
  // Override which status codes are retryable (default set below).
  retryableStatuses?: number[]
}

const DEFAULT_RETRYABLE = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function classifyError(err: unknown): string | null {
  // fetch throws TypeError on network failure in Node 18+ undici.
  if (err instanceof TypeError) return 'network error: ' + err.message
  if (err instanceof DOMException && err.name === 'AbortError') return null // not retryable, signal aborted
  // Errors thrown by fetchWithRetry for retryable HTTP statuses look like `Error('HTTP 429')`.
  if (err instanceof Error && /^HTTP \d{3}$/.test(err.message)) return err.message
  return null
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3)
  const baseDelay = opts.baseDelayMs ?? 1000
  const retryable = new Set(opts.retryableStatuses ?? [...DEFAULT_RETRYABLE])

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const reason = classifyError(err)
      if (!reason) throw err // non-retryable
      if (attempt >= attempts) throw err
      // Exponential backoff with ±50% jitter
      const base = baseDelay * Math.pow(3, attempt - 1)
      const jitter = base * (Math.random() - 0.5)
      const delay = Math.round(base + jitter)
      opts.onRetry?.({ attempt, delayMs: delay, reason })
      await sleep(delay, opts.signal)
    }
  }
  throw lastError
}

// Convenience helper: fetch with retry that also handles HTTP status codes.
// Throws on the final non-2xx response (after retries).
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const res = await fetch(url, init)
    const retryable = new Set(opts.retryableStatuses ?? [...DEFAULT_RETRYABLE])
    if (!res.ok && retryable.has(res.status)) {
      // Force the response body to be consumed so the connection can be reused.
      await res.text().catch(() => {})
      throw new Error(`HTTP ${res.status}`)
    }
    return res
  }, opts)
}