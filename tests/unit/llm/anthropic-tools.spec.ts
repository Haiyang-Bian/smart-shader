import { describe, it, expect } from 'vitest'
import { formatToolsForProvider, extractAnthropicToolCalls } from '../../../server/utils/llm/registry'

const sampleTools = [
  {
    name: 'capture_screenshot',
    description: 'capture',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }
  },
  {
    name: 'get_current_code',
    description: 'get code',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }
  }
]

describe('formatToolsForProvider', () => {
  it('returns the Anthropic flat shape with input_schema', () => {
    expect(formatToolsForProvider('anthropic', sampleTools)).toEqual([
      {
        name: 'capture_screenshot',
        description: 'capture',
        input_schema: sampleTools[0].parameters
      },
      {
        name: 'get_current_code',
        description: 'get code',
        input_schema: sampleTools[1].parameters
      }
    ])
  })

  it('returns the OpenAI nested function shape for non-anthropic providers', () => {
    const out = formatToolsForProvider('openai', sampleTools) as Array<{ type: string; function: { name: string } }>
    expect(out).toHaveLength(2)
    expect(out[0].type).toBe('function')
    expect(out[0].function.name).toBe('capture_screenshot')
    expect(out[0].function.parameters).toEqual(sampleTools[0].parameters)
  })

  it('uses the same OpenAI shape for moonshot/openrouter/local', () => {
    for (const provider of ['moonshot', 'openrouter', 'local']) {
      const out = formatToolsForProvider(provider, sampleTools) as Array<{ type: string }>
      expect(out[0].type).toBe('function')
    }
  })
})

describe('extractAnthropicToolCalls', () => {
  it('returns an empty array when no tool_use blocks are present', () => {
    expect(extractAnthropicToolCalls([
      { type: 'text', text: 'hello' }
    ])).toEqual([])
  })

  it('extracts a single tool_use block', () => {
    const calls = extractAnthropicToolCalls([
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 'tu_1', name: 'capture_screenshot', input: { reason: 'check colour' } }
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('tu_1')
    expect(calls[0].name).toBe('capture_screenshot')
    expect(JSON.parse(calls[0].arguments)).toEqual({ reason: 'check colour' })
  })

  it('extracts multiple tool_use blocks in order', () => {
    const calls = extractAnthropicToolCalls([
      { type: 'tool_use', id: 'a', name: 'capture_screenshot', input: {} },
      { type: 'tool_use', id: 'b', name: 'get_current_code', input: { foo: 'bar' } }
    ])
    expect(calls.map(c => c.id)).toEqual(['a', 'b'])
    expect(calls.map(c => c.name)).toEqual(['capture_screenshot', 'get_current_code'])
  })

  it('handles missing input by stringifying an empty object', () => {
    const calls = extractAnthropicToolCalls([
      { type: 'tool_use', id: 'x', name: 'get_current_code' }
    ])
    expect(calls[0].arguments).toBe('{}')
  })

  it('skips entries missing id or name', () => {
    const calls = extractAnthropicToolCalls([
      { type: 'tool_use', name: 'no_id' },
      { type: 'tool_use', id: 'no_name' },
      { type: 'tool_use', id: 'ok', name: 'capture_screenshot', input: {} }
    ])
    expect(calls.map(c => c.id)).toEqual(['ok'])
  })
})