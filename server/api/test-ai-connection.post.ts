import { defineEventHandler, readBody } from 'h3'
import { logError } from '../utils/logger'
import { getDefaultApiUrl } from '../utils/llm/registry'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { provider, token, customUrl } = body

    if (!token) {
      return {
        success: false,
        message: 'API token is required'
      }
    }

    const apiUrl = customUrl || getDefaultApiUrl(provider, 'auth')

    switch (provider) {
      case 'openai':
        return await testOpenAI(apiUrl, token)
      
      case 'anthropic':
        return await testAnthropic(apiUrl, token)
      
      case 'google':
        return await testGoogle(apiUrl, token)
      
      case 'moonshot':
        return await testMoonshot(apiUrl, token)
      
      case 'openrouter':
        return await testOpenRouter(apiUrl, token)
      
      case 'local':
        return await testLocal(apiUrl)
      
      case 'builtin':
        return {
          success: true,
          message: 'Built-in templates are always available'
        }
      
      default:
        logError('api/test-ai-connection', `Unknown provider: ${provider}`)
        return {
          success: false,
          message: `Unknown provider: ${provider}`
        }
    }
  } catch (error: any) {
    logError('api/test-ai-connection', error.message || 'Failed to test connection')
    return {
      success: false,
      message: error.message || 'Failed to test connection'
    }
  }
})

async function testOpenAI(url: string, token: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    const error = await response.text()
    return { success: false, message: `API error: ${error}` }
  }
  
  const data = await response.json()
  const models = data.data?.length || 0
  return {
    success: true,
    message: `Connection successful! ${models} models available.`
  }
}

async function testAnthropic(url: string, token: string) {
  const baseUrl = url.replace('/models', '')
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      return { success: false, message: 'Invalid API key' }
    }
    const error = await response.text()
    if (response.status === 400) {
      return { success: true, message: 'Connection successful! API key is valid.' }
    }
    return { success: false, message: `API error: ${error}` }
  }
  
  return {
    success: true,
    message: 'Connection successful! API key is valid.'
  }
}

async function testGoogle(url: string, token: string) {
  const response = await fetch(`${url}?key=${token}`, {
    method: 'GET'
  })
  
  if (!response.ok) {
    if (response.status === 400) {
      return { success: false, message: 'Invalid API key' }
    }
    const error = await response.text()
    return { success: false, message: `API error: ${error}` }
  }
  
  return {
    success: true,
    message: 'Connection successful! API key is valid.'
  }
}

// Moonshot 连接测试 - 修复认证问题
async function testMoonshot(url: string, token: string) {
  const trimmedToken = token.trim()
  
  console.log('Testing Moonshot connection:', { url, tokenLength: trimmedToken.length })
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${trimmedToken}`
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Moonshot test error:', response.status, errorText)
    
    let errorMsg = errorText
    try {
      const errorJson = JSON.parse(errorText)
      errorMsg = errorJson.error?.message || errorJson.message || errorText
    } catch {}
    
    if (response.status === 401) {
      return { success: false, message: `Invalid API key: ${errorMsg}` }
    }
    return { success: false, message: `API error: ${errorMsg}` }
  }
  
  const data = await response.json()
  const models = data.data?.length || 0
  return {
    success: true,
    message: `Connection successful! ${models} models available.`
  }
}

async function testOpenRouter(url: string, token: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key' }
    }
    const error = await response.text()
    return { success: false, message: `API error: ${error}` }
  }
  
  const data = await response.json()
  const label = data.data?.label || 'Unknown'
  return {
    success: true,
    message: `Connection successful! Key: ${label}`
  }
}

async function testLocal(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET'
    })
    
    if (!response.ok) {
      return { success: false, message: 'Failed to connect to local server' }
    }
    
    const data = await response.json()
    const models = data.models?.length || 0
    return {
      success: true,
      message: `Connection successful! ${models} models available.`
    }
  } catch (error) {
    return {
      success: false,
      message: 'Could not connect to local server. Is Ollama running?'
    }
  }
}
