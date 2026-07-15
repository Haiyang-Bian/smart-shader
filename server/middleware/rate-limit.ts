// In-memory IP-based rate limiter for expensive LLM and admin-login endpoints.
//
// Token bucket: each IP starts with N tokens, refills at N/60 per second.
// When a request arrives we refill proportionally to elapsed time, decrement, and
// reject with 429 if the bucket is empty.
//
// Limits are configurable via runtimeConfig.rateLimitPerMinute (default 20).
// Override with NUXT_RATE_LIMIT_PER_MINUTE for production tuning.
//
// Limitation: the bucket is per-process. For multi-instance deployments,
// replace this with a Redis-backed implementation.

import { defineEventHandler, getRequestIP, getRequestURL } from 'h3'
import { logWarn } from '../utils/logger'

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()
const PROTECTED_PATHS = ['/api/chat', '/api/generate-shader', '/api/admin/login']
const WINDOW_MS = 60_000

// Periodically reap expired buckets so the map can't grow unbounded.
// Runs every 5 minutes and removes buckets idle for >10 minutes.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [ip, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) buckets.delete(ip)
  }
}, 5 * 60 * 1000).unref()

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!PROTECTED_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) return

  const limit = useRuntimeConfig(event).rateLimitPerMinute as number
  if (!limit || limit <= 0) return

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const now = Date.now()
  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now }
    buckets.set(ip, bucket)
  }

  // Refill proportional to time since lastRefill.
  const elapsed = now - bucket.lastRefill
  if (elapsed > 0) {
    const refill = (elapsed / WINDOW_MS) * limit
    bucket.tokens = Math.min(limit, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  if (bucket.tokens < 1) {
    logWarn('middleware/rate-limit', 'Rate limit exceeded', { ip, path: url.pathname, limit })
    throw createError({ statusCode: 429, message: '请求过于频繁，请稍后再试' })
  }

  bucket.tokens -= 1
})
