// Single source of truth for LLM provider endpoints, default URLs, and auth-header patterns.
// Replaces the three duplicated `getDefaultApiUrl` functions that previously lived in
// chat.post.ts / models.get.ts / test-ai-connection.post.ts.

import type { ProviderId } from './types'

type UrlKind = 'chat' | 'models' | 'auth'

const CHAT_URLS: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  local: 'http://localhost:11434/v1/chat/completions'
}

const MODEL_LIST_URLS: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  moonshot: 'https://api.moonshot.cn/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  // Ollama exposes its own model registry under /api/tags.
  local: 'http://localhost:11434/api/tags'
}

export function getProviderIds(): ProviderId[] {
  return Object.keys(CHAT_URLS) as ProviderId[]
}

export function getDefaultApiUrl(provider: string, kind: UrlKind = 'chat'): string {
  const id = provider as ProviderId
  if (kind === 'models') return MODEL_LIST_URLS[id] || ''
  if (kind === 'auth') {
    // OpenRouter exposes /api/v1/auth/key for key validation; everything else uses the models endpoint.
    if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/auth/key'
    return MODEL_LIST_URLS[id] || ''
  }
  return CHAT_URLS[id] || ''
}

export function buildAuthHeaders(provider: string, token: string): Record<string, string> {
  const cleanToken = token.trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  switch (provider) {
    case 'openai':
    case 'moonshot':
    case 'openrouter':
      headers['Authorization'] = `Bearer ${cleanToken}`
      break
    case 'anthropic':
      headers['x-api-key'] = cleanToken
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'local':
      // No auth header for local Ollama.
      break
    case 'google':
      // Google's API uses `?key=<token>` in the query string, set by the caller.
      break
    default:
      headers['Authorization'] = `Bearer ${cleanToken}`
  }

  return headers
}

// Some legacy Moonshot models do not accept a temperature parameter.
export function isFixedTemperatureModel(model: string): boolean {
  return ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'].some(m => model.includes(m))
}

// Provider sanity check before charging tokens. Returns null when OK, otherwise an error message.
export function validateSettingsForProvider(provider: string, token: string): string | null {
  if (!token) return '请先配置 API Token'
  if (provider === 'moonshot' && !token.trim().startsWith('sk-')) {
    return 'Moonshot API Token 应以 sk- 开头'
  }
  return null
}
