// Smoke test that proves the Vitest + happy-dom setup is working end-to-end.
// Real tests for composables and adapters live in sibling *.spec.ts files.

import { describe, it, expect } from 'vitest'

describe('vitest infrastructure', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs asynchronously', async () => {
    const value = await Promise.resolve('hello')
    expect(value).toBe('hello')
  })

  it('has a DOM environment (happy-dom)', () => {
    expect(typeof document).toBe('object')
  })
})
