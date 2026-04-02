import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { provider, token, customUrl } = query

  if (!provider || provider === 'builtin') {
    return {
      models: [
        { id: 'template', name: '模板匹配', description: '基于关键词的模板选择' }
      ]
    }
  }

  if (!token) {
    return {
      error: 'API token is required'
    }
  }

  try {
    const models = await fetchModels(provider as string, token as string, customUrl as string)
    return { models }
  } catch (error: any) {
    return {
      error: error.message || 'Failed to fetch models'
    }
  }
})

async function fetchModels(provider: string, token: string, customUrl?: string): Promise<any[]> {
  const apiUrl = customUrl || getDefaultApiUrl(provider)

  switch (provider) {
    case 'openai':
      return await fetchOpenAIModels(apiUrl, token)
    case 'anthropic':
      return await fetchAnthropicModels(apiUrl, token)
    case 'google':
      return await fetchGoogleModels(apiUrl, token)
    case 'moonshot':
      return await fetchMoonshotModels(apiUrl, token)
    case 'openrouter':
      return await fetchOpenRouterModels(apiUrl, token)
    case 'local':
      return await fetchLocalModels(apiUrl)
    default:
      return []
  }
}

function getDefaultApiUrl(provider: string): string {
  const urls: Record<string, string> = {
    'openai': 'https://api.openai.com/v1/models',
    'anthropic': 'https://api.anthropic.com/v1/models',
    'google': 'https://generativelanguage.googleapis.com/v1beta/models',
    'moonshot': 'https://api.moonshot.cn/v1/models',
    'openrouter': 'https://openrouter.ai/api/v1/models',
    'local': 'http://localhost:11434/api/tags'
  }
  return urls[provider] || ''
}

async function fetchOpenAIModels(url: string, token: string) {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) throw new Error('Failed to fetch OpenAI models')

  const data = await response.json()
  return data.data
    .filter((m: any) => m.id.includes('gpt'))
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      description: m.description || ''
    }))
}

async function fetchAnthropicModels(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      'x-api-key': token,
      'anthropic-version': '2023-06-01'
    }
  })

  if (!response.ok) throw new Error('Failed to fetch Anthropic models')

  const data = await response.json()
  return data.data.map((m: any) => ({
    id: m.id,
    name: m.display_name || m.id,
    description: ''
  }))
}

async function fetchGoogleModels(url: string, token: string) {
  const response = await fetch(`${url}?key=${token}`)

  if (!response.ok) throw new Error('Failed to fetch Google models')

  const data = await response.json()
  return data.models.map((m: any) => ({
    id: m.name.replace(/^models\//, ''),
    name: m.displayName || m.name,
    description: m.description || ''
  }))
}

async function fetchMoonshotModels(url: string, token: string) {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token.trim()}` }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch Moonshot models: ${error}`)
  }

  const data = await response.json()

  // 标注哪些模型只支持 temperature=1
  const fixedTempModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']

  return data.data.map((m: any) => ({
    id: m.id,
    name: m.id,
    description: fixedTempModels.includes(m.id) ? '该模型只支持 temperature=1' : ''
  }))
}

async function fetchOpenRouterModels(url: string, token: string) {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) throw new Error('Failed to fetch OpenRouter models')

  const data = await response.json()
  return data.data.map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
    description: m.description || ''
  }))
}

async function fetchLocalModels(url: string) {
  const response = await fetch(url)

  if (!response.ok) throw new Error('Failed to fetch local models')

  const data = await response.json()
  return data.models.map((m: any) => ({
    id: m.name,
    name: m.name,
    description: m.details?.description || ''
  }))
}
