import { describe, it, expect } from 'vitest'
import {
  getDefaultApiUrl,
  buildAuthHeaders,
  isFixedTemperatureModel,
  validateSettingsForProvider,
  getProviderIds
} from '../../../server/utils/llm/registry'

describe('getProviderIds', () => {
  it('lists all supported provider ids', () => {
    const ids = getProviderIds()
    expect(ids).toContain('openai')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('google')
    expect(ids).toContain('moonshot')
    expect(ids).toContain('openrouter')
    expect(ids).toContain('local')
  })
})

describe('getDefaultApiUrl', () => {
  it('returns the OpenAI chat completions URL by default', () => {
    expect(getDefaultApiUrl('openai')).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('returns Anthropic messages URL', () => {
    expect(getDefaultApiUrl('anthropic')).toBe('https://api.anthropic.com/v1/messages')
  })

  it('returns Moonshot chat completions URL', () => {
    expect(getDefaultApiUrl('moonshot')).toBe('https://api.moonshot.cn/v1/chat/completions')
  })

  it('returns OpenRouter chat completions URL', () => {
    expect(getDefaultApiUrl('openrouter')).toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('returns the local Ollama URL', () => {
    expect(getDefaultApiUrl('local')).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('returns model-listing URLs when kind="models"', () => {
    expect(getDefaultApiUrl('openai', 'models')).toBe('https://api.openai.com/v1/models')
    expect(getDefaultApiUrl('moonshot', 'models')).toBe('https://api.moonshot.cn/v1/models')
    expect(getDefaultApiUrl('local', 'models')).toBe('http://localhost:11434/api/tags')
  })

  it('returns OpenRouter auth endpoint when kind="auth"', () => {
    expect(getDefaultApiUrl('openrouter', 'auth')).toBe('https://openrouter.ai/api/v1/auth/key')
  })

  it('returns an empty string for unknown providers', () => {
    expect(getDefaultApiUrl('mystery')).toBe('')
  })
})

describe('buildAuthHeaders', () => {
  it('uses Bearer auth for OpenAI/Moonshot/OpenRouter', () => {
    expect(buildAuthHeaders('openai', 'sk-abc').Authorization).toBe('Bearer sk-abc')
    expect(buildAuthHeaders('moonshot', 'sk-xyz').Authorization).toBe('Bearer sk-xyz')
    expect(buildAuthHeaders('openrouter', 'or-key').Authorization).toBe('Bearer or-key')
  })

  it('uses x-api-key for Anthropic', () => {
    const h = buildAuthHeaders('anthropic', 'ant-key')
    expect(h['x-api-key']).toBe('ant-key')
    expect(h['anthropic-version']).toBe('2023-06-01')
  })

  it('omits auth headers for local (Ollama)', () => {
    const h = buildAuthHeaders('local', '')
    expect(Object.keys(h)).toEqual(['Content-Type'])
  })

  it('omits auth headers for Google (uses query-string key)', () => {
    const h = buildAuthHeaders('google', 'goog-key')
    expect(Object.keys(h)).toEqual(['Content-Type'])
  })

  it('trims whitespace from the token', () => {
    expect(buildAuthHeaders('openai', '  sk-abc  ').Authorization).toBe('Bearer sk-abc')
  })
})

describe('isFixedTemperatureModel', () => {
  it('flags the legacy Moonshot v1 models', () => {
    expect(isFixedTemperatureModel('moonshot-v1-8k')).toBe(true)
    expect(isFixedTemperatureModel('moonshot-v1-32k')).toBe(true)
    expect(isFixedTemperatureModel('moonshot-v1-128k')).toBe(true)
  })

  it('does not flag newer Kimi models', () => {
    expect(isFixedTemperatureModel('kimi-k2')).toBe(false)
    expect(isFixedTemperatureModel('kimi-k2.5')).toBe(false)
  })
})

describe('validateSettingsForProvider', () => {
  it('requires a non-empty token', () => {
    expect(validateSettingsForProvider('openai', '')).toMatch(/API Token/)
  })

  it('rejects Moonshot tokens that do not start with sk-', () => {
    expect(validateSettingsForProvider('moonshot', 'wrong-prefix')).toMatch(/sk-/)
  })

  it('accepts well-formed Moonshot tokens', () => {
    expect(validateSettingsForProvider('moonshot', 'sk-anything')).toBeNull()
  })

  it('accepts tokens for providers without format constraints', () => {
    expect(validateSettingsForProvider('openai', 'any-string')).toBeNull()
    expect(validateSettingsForProvider('anthropic', 'ant-key')).toBeNull()
  })
})
