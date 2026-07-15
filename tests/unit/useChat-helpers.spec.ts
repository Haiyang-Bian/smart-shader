import { describe, it, expect } from 'vitest'
import { safeParseArgs, parseToolCalls, formatToolResults } from '~/composables/useChat'

describe('safeParseArgs', () => {
  it('returns an empty object for undefined input', () => {
    expect(safeParseArgs(undefined)).toEqual({})
  })

  it('parses valid JSON', () => {
    expect(safeParseArgs('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 })
  })

  it('parses arrays', () => {
    expect(safeParseArgs('[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('returns empty object for invalid JSON and no markdown fallback', () => {
    expect(safeParseArgs('not json at all')).toEqual({})
  })

  it('parses a JSON-encoded string', () => {
    expect(safeParseArgs('"hello"')).toBe('hello')
  })

  it('parses a JSON-encoded number', () => {
    expect(safeParseArgs('42')).toBe(42)
  })

  it('falls back to stripping markdown code fences around JSON', () => {
    // The implementation strips ```...``` blocks when the raw string fails to parse.
    // Here the fence is empty so the JSON after it becomes the parseable remainder.
    expect(safeParseArgs('```\n```{"key":"value"}')).toEqual({ key: 'value' })
  })

  it('handles whitespace gracefully', () => {
    expect(safeParseArgs('  {"trimmed":true}  ')).toEqual({ trimmed: true })
  })
})

describe('parseToolCalls', () => {
  it('returns an empty array when the message has no toolCalls', () => {
    expect(parseToolCalls({
      id: '1', role: 'assistant', content: '', timestamp: 0
    })).toEqual([])
  })

  it('normalises structured tool calls', () => {
    expect(parseToolCalls({
      id: '1', role: 'assistant', content: '', timestamp: 0,
      toolCalls: [
        { id: 'a', name: 'capture', arguments: '{"reason":"check"}' },
        { id: 'b', name: 'get_code', arguments: '{}' }
      ]
    })).toEqual([
      { id: 'a', name: 'capture', arguments: '{"reason":"check"}' },
      { id: 'b', name: 'get_code', arguments: '{}' }
    ])
  })

  it('falls back to function.name when top-level name is missing', () => {
    // The implementation serialises `tc.function?.arguments` (which is itself a JSON string).
    expect(parseToolCalls({
      id: '1', role: 'assistant', content: '', timestamp: 0,
      toolCalls: [{ id: 'b', function: { name: 'get_code', arguments: '{}' } }]
    })).toEqual([
      { id: 'b', name: 'get_code', arguments: '"{}"' }
    ])
  })
})

describe('formatToolResults', () => {
  it('returns an empty string when given no results', () => {
    expect(formatToolResults([])).toBe('')
  })

  it('renders a result with a string payload', () => {
    const out = formatToolResults([{ name: 'capture_screenshot', result: 'base64data' }])
    expect(out).toContain('工具: capture_screenshot')
    expect(out).toContain('结果: base64data')
  })

  it('renders an error in preference to a result', () => {
    const out = formatToolResults([{ name: 'get_current_code', result: 'ignored', error: 'boom' }])
    expect(out).toContain('错误: boom')
    expect(out).not.toContain('结果:')
  })

  it('falls back to JSON.stringify for object results', () => {
    const out = formatToolResults([{ name: 'foo', result: { a: 1, b: 2 } }])
    expect(out).toContain('结果: {"a":1,"b":2}')
  })
})
