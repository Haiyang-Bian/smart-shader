import { describe, it, expect } from 'vitest'
import { parseReviewResult } from '~/composables/useAgent'

describe('parseReviewResult', () => {
  it('returns PASS when content contains "VERDICT: PASS"', () => {
    expect(parseReviewResult('Looks good.\nVERDICT: PASS')).toEqual({
      verdict: 'PASS',
      feedback: 'Looks good.'
    })
  })

  it('returns FAIL when content contains "VERDICT: FAIL"', () => {
    expect(parseReviewResult('Wrong colour.\nVERDICT: FAIL')).toEqual({
      verdict: 'FAIL',
      feedback: 'Wrong colour.'
    })
  })

  it('is case insensitive', () => {
    expect(parseReviewResult('verdict: pass').verdict).toBe('PASS')
    expect(parseReviewResult('Verdict: Fail').verdict).toBe('FAIL')
  })

  it('ignores whitespace around the verdict keyword', () => {
    expect(parseReviewResult('feedback\nVERDICT   :   PASS\nmore').verdict).toBe('PASS')
  })

  it('returns verdict=null when no match is found', () => {
    const result = parseReviewResult('Just some feedback without a verdict line.')
    expect(result.verdict).toBeNull()
    expect(result.feedback).toBe('Just some feedback without a verdict line.')
  })

  it('only matches the verdict keyword with PASS or FAIL — not other words', () => {
    expect(parseReviewResult('VERDICT: MAYBE').verdict).toBeNull()
  })
})
