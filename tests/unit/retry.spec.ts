import { describe, it, expect, vi } from 'vitest'
import { withRetry, fetchWithRetry } from '../../server/utils/retry'

describe('withRetry', () => {
  it('returns the value when the function succeeds on first try', async () => {
    const fn = vi.fn(async () => 'ok')
    const result = await withRetry(fn, { baseDelayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on TypeError (network failure) and eventually succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new TypeError('fetch failed')
      return 'recovered'
    })
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exceeding attempts', async () => {
    const fn = vi.fn(async () => { throw new TypeError('persistent') })
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow('persistent')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry on AbortError', async () => {
    const fn = vi.fn(async () => { throw new DOMException('aborted', 'AbortError') })
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('honours an AbortSignal mid-backoff', async () => {
    const ac = new AbortController()
    const fn = vi.fn(async () => { throw new TypeError('boom') })
    setTimeout(() => ac.abort(), 5)
    await expect(withRetry(fn, { attempts: 5, baseDelayMs: 100, signal: ac.signal })).rejects.toThrow(/Abort/)
  })

  it('invokes onRetry with attempt metadata', async () => {
    let calls = 0
    const fn = async () => { calls++; if (calls < 3) throw new TypeError('x'); return 'y' }
    const events: Array<{ attempt: number; reason: string }> = []
    await withRetry(fn, {
      attempts: 3, baseDelayMs: 1,
      onRetry: info => events.push({ attempt: info.attempt, reason: info.reason })
    })
    expect(events).toHaveLength(2)
    expect(events[0].attempt).toBe(1)
    expect(events[0].reason).toContain('x')
  })
})

describe('fetchWithRetry', () => {
  it('returns the response on 2xx without retrying', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('hello', { status: 200 })))
    try {
      const res = await fetchWithRetry('https://api.example.com/x', {}, { baseDelayMs: 1 })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('hello')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('retries on 429 then succeeds', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      if (calls < 2) return new Response('', { status: 429 })
      return new Response('ok', { status: 200 })
    }))
    try {
      const res = await fetchWithRetry('https://api.example.com/x', {}, { baseDelayMs: 1 })
      expect(res.status).toBe(200)
      expect(calls).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not retry on 400 (client error)', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      return new Response('', { status: 400 })
    }))
    try {
      const res = await fetchWithRetry('https://api.example.com/x', {}, { baseDelayMs: 1 })
      expect(res.status).toBe(400)
      expect(calls).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('retries on 500 then throws after attempts exhausted', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      return new Response('', { status: 500 })
    }))
    try {
      await expect(fetchWithRetry('https://api.example.com/x', {}, { attempts: 2, baseDelayMs: 1 }))
        .rejects.toThrow(/500/)
      expect(calls).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})