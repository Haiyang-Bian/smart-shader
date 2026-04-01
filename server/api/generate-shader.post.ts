import { defineEventHandler, readBody } from 'h3'
import { findBestTemplate, getTemplateDescription } from './templates'

// 中文系统提示词
function getSystemPrompt(): string {
  return `你是一位精通 GLSL 着色器编程的专家。请根据用户的描述生成 fragment shader 代码。

要求：
1. 使用 WebGL 1.0 兼容语法（mediump precision）
2. 必须包含以下 uniform 变量：
   - u_time: float 类型，用于动画
   - u_resolution: vec2 类型，表示画布分辨率
3. 最终颜色输出到 gl_FragColor
4. UV 坐标获取方式：vec2 uv = gl_FragCoord.xy / u_resolution.xy
5. 使用 u_time 创建动画效果
6. 只返回着色器代码，不要任何解释、不要 markdown 代码块标记
7. 代码以 "precision mediump float;" 开头

代码结构示例：
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  // 在这里实现效果
  gl_FragColor = vec4(color, 1.0);
}`
}

// 使用 AI 生成着色器
async function generateWithAI(prompt: string, settings: any): Promise<{ code: string; model: string }> {
  const systemPrompt = getSystemPrompt()
  const apiUrl = settings.customUrl || getDefaultApiUrl(settings.provider)
  
  switch (settings.provider) {
    case 'openai':
      return await callOpenAI(apiUrl, settings.token, settings.model, systemPrompt, prompt, settings.temperature)
    
    case 'anthropic':
      return await callAnthropic(apiUrl, settings.token, settings.model, systemPrompt, prompt)
    
    case 'google':
      return await callGoogle(apiUrl, settings.token, settings.model, systemPrompt, prompt, settings.temperature)
    
    case 'moonshot':
      return await callMoonshot(apiUrl, settings.token, settings.model, systemPrompt, prompt, settings.temperature)
    
    case 'openrouter':
      return await callOpenRouter(apiUrl, settings.token, settings.model, systemPrompt, prompt, settings.temperature)
    
    case 'local':
      return await callLocal(apiUrl, settings.model, systemPrompt, prompt, settings.temperature)
    
    default:
      throw new Error(`不支持的提供商: ${settings.provider}`)
  }
}

function getDefaultApiUrl(provider: string): string {
  const urls: Record<string, string> = {
    'openai': 'https://api.openai.com/v1/chat/completions',
    'anthropic': 'https://api.anthropic.com/v1/messages',
    'google': 'https://generativelanguage.googleapis.com/v1beta/models',
    'moonshot': 'https://api.moonshot.cn/v1/chat/completions',
    'openrouter': 'https://openrouter.ai/api/v1/chat/completions',
    'local': 'http://localhost:11434/v1/chat/completions'
  }
  return urls[provider] || ''
}

async function callOpenAI(url: string, token: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: 2048
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API 错误: ${error}`)
  }
  
  const data = await response.json()
  return {
    code: extractShaderCode(data.choices[0].message.content),
    model: data.model || model
  }
}

async function callAnthropic(url: string, token: string, model: string, systemPrompt: string, userPrompt: string) {
  const baseUrl = url.replace('/models', '')
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API 错误: ${error}`)
  }
  
  const data = await response.json()
  return {
    code: extractShaderCode(data.content[0].text),
    model: data.model || model
  }
}

async function callGoogle(url: string, token: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const response = await fetch(`${url}/${model}:generateContent?key=${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: systemPrompt + '\n\n用户描述：' + userPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: 2048
      }
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google API 错误: ${error}`)
  }
  
  const data = await response.json()
  return {
    code: extractShaderCode(data.candidates[0].content.parts[0].text),
    model: model
  }
}

// 检查模型是否需要固定 temperature
function isFixedTemperatureModel(model: string): boolean {
  const fixedTempModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  return fixedTempModels.some(m => model.includes(m))
}

// Moonshot API
async function callMoonshot(url: string, token: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const cleanToken = token.trim()
  const fixedTemp = isFixedTemperatureModel(model)
  
  console.log('Moonshot API 调用:', { model, fixedTemp })
  
  const requestBody: any = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 2048
  }
  
  // 如果模型支持 temperature，则添加
  if (!fixedTemp) {
    requestBody.temperature = temperature
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanToken}`
    },
    body: JSON.stringify(requestBody)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Moonshot API 错误:', response.status, errorText)
    
    let errorMsg = errorText
    try {
      const errorJson = JSON.parse(errorText)
      errorMsg = errorJson.error?.message || errorJson.message || errorText
    } catch {}
    
    if (response.status === 401) {
      throw new Error(`API Token 无效。请检查：1. Token 是否以 sk- 开头 2. Token 是否已过期`)
    }
    
    throw new Error(`API 错误: ${errorMsg}`)
  }
  
  const data = await response.json()
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('API 返回数据无效')
  }
  
  return {
    code: extractShaderCode(data.choices[0].message.content),
    model: data.model || model
  }
}

async function callOpenRouter(url: string, token: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Smart Shader'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: 2048
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API 错误: ${error}`)
  }
  
  const data = await response.json()
  return {
    code: extractShaderCode(data.choices[0].message.content),
    model: data.model || model
  }
}

async function callLocal(url: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      stream: false
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`本地 API 错误: ${error}`)
  }
  
  const data = await response.json()
  return {
    code: extractShaderCode(data.choices[0].message.content),
    model: model
  }
}

function extractShaderCode(content: string): string {
  const codeBlockMatch = content.match(/```(?:glsl)?\n?([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim()
  }
  return content.trim()
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { prompt, settings } = body
    
    if (!prompt) {
      return {
        error: '请输入描述'
      }
    }
    
    // 使用内置模板
    if (!settings || settings.provider === 'builtin') {
      await new Promise(resolve => setTimeout(resolve, 500))
      const shaderCode = findBestTemplate(prompt)
      
      return {
        shaderCode,
        description: `已根据描述「${prompt}」选择着色器模板。您可以在右侧预览并编辑代码。`,
        model: '模板匹配'
      }
    }
    
    // 验证设置
    if (!settings.token) {
      throw createError({
        statusCode: 400,
        message: '请先配置 API Token'
      })
    }
    
    // Moonshot token 格式验证
    if (settings.provider === 'moonshot') {
      const token = settings.token.trim()
      if (!token.startsWith('sk-')) {
        throw createError({
          statusCode: 400,
          message: 'Moonshot API Token 格式错误，应以 sk- 开头'
        })
      }
    }
    
    // 使用 AI 生成
    const result = await generateWithAI(prompt, settings)
    
    return {
      shaderCode: result.code,
      description: `已使用 ${settings.provider} (${result.model}) 根据描述「${prompt}」生成着色器。您可以在右侧预览并编辑代码。`,
      model: result.model
    }
  } catch (error: any) {
    console.error('着色器生成错误:', error)
    throw createError({
      statusCode: 500,
      message: error.message || '生成失败，请重试'
    })
  }
})
