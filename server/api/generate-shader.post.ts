import { defineEventHandler, readBody } from 'h3'

// 内置着色器模板
const shaderTemplates: Record<string, string> = {
  'rainbow': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 彩虹波浪效果
  float wave1 = sin(uv.x * 10.0 + u_time * 2.0) * 0.5 + 0.5;
  float wave2 = sin(uv.y * 8.0 + u_time * 1.5) * 0.5 + 0.5;
  float wave3 = sin((uv.x + uv.y) * 6.0 + u_time) * 0.5 + 0.5;
  
  vec3 color = vec3(wave1, wave2, wave3);
  color = sin(color * 3.14159 + u_time) * 0.5 + 0.5;
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'lava': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 5; i++) {
    value += amplitude * smoothNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 熔岩灯效果
  float n = fbm(uv * 3.0 + u_time * 0.3);
  n += fbm(uv * 6.0 - u_time * 0.2) * 0.5;
  
  // 熔岩颜色映射
  vec3 color1 = vec3(1.0, 0.3, 0.0); // 橙色
  vec3 color2 = vec3(0.8, 0.0, 0.2); // 红色
  vec3 color3 = vec3(1.0, 0.8, 0.0); // 黄色
  
  vec3 color = mix(color1, color2, n);
  color = mix(color, color3, smoothstep(0.6, 0.9, n));
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'stars': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float star(vec2 uv, float seed) {
  vec2 pos = vec2(
    random(vec2(seed, 0.0)),
    random(vec2(0.0, seed))
  );
  
  float d = length(uv - pos);
  float brightness = random(vec2(seed));
  float twinkle = sin(u_time * 2.0 + seed * 10.0) * 0.5 + 0.5;
  
  return smoothstep(0.005, 0.0, d) * brightness * (0.5 + 0.5 * twinkle);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 夜空渐变
  vec3 nightColor = mix(
    vec3(0.02, 0.02, 0.1),
    vec3(0.0, 0.0, 0.0),
    uv.y
  );
  
  // 星星
  vec3 starColor = vec3(0.0);
  for(float i = 0.0; i < 50.0; i++) {
    starColor += star(uv, i * 0.1) * vec3(1.0, 0.95, 0.8);
  }
  
  // 月亮
  vec2 moonPos = vec2(0.8, 0.8);
  float moonDist = length(uv - moonPos);
  float moon = smoothstep(0.08, 0.07, moonDist);
  vec3 moonColor = vec3(0.9, 0.9, 0.8) * moon;
  
  // 月亮光晕
  float glow = smoothstep(0.15, 0.0, moonDist) * 0.3;
  moonColor += vec3(0.9, 0.9, 0.8) * glow;
  
  gl_FragColor = vec4(nightColor + starColor + moonColor, 1.0);
}`,

  'fire': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 4; i++) {
    value += amplitude * smoothNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 火焰从底部上升
  vec2 fireUV = uv;
  fireUV.y += u_time * 0.5;
  
  float n = fbm(fireUV * vec2(4.0, 8.0));
  n += fbm(fireUV * vec2(8.0, 16.0) + u_time * 0.5) * 0.5;
  
  // 火焰形状 - 底部强，顶部弱
  float shape = 1.0 - uv.y;
  shape = pow(shape, 0.5);
  shape *= (1.0 - abs(uv.x - 0.5) * 1.5);
  
  float fire = n * shape;
  
  // 火焰颜色
  vec3 color1 = vec3(1.0, 1.0, 0.2); // 黄色
  vec3 color2 = vec3(1.0, 0.5, 0.0); // 橙色
  vec3 color3 = vec3(1.0, 0.0, 0.0); // 红色
  vec3 color4 = vec3(0.3, 0.0, 0.0); // 深红色
  
  vec3 color = color4;
  color = mix(color, color3, smoothstep(0.0, 0.2, fire));
  color = mix(color, color2, smoothstep(0.2, 0.5, fire));
  color = mix(color, color1, smoothstep(0.5, 0.8, fire));
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'water': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 水波纹效果
  float ripple1 = sin(uv.x * 20.0 + u_time * 2.0) * 0.02;
  float ripple2 = sin(uv.y * 15.0 + u_time * 1.5) * 0.02;
  float ripple3 = sin((uv.x + uv.y) * 10.0 + u_time) * 0.02;
  
  vec2 distortedUV = uv + vec2(ripple1 + ripple3, ripple2 + ripple3);
  
  // 水色渐变
  vec3 deepWater = vec3(0.0, 0.2, 0.4);
  vec3 shallowWater = vec3(0.0, 0.5, 0.6);
  
  float depth = distortedUV.y + sin(distortedUV.x * 10.0 + u_time) * 0.1;
  vec3 waterColor = mix(shallowWater, deepWater, depth);
  
  // 高光
  float highlight = sin(distortedUV.x * 30.0 + u_time * 3.0) * 
                    sin(distortedUV.y * 30.0 + u_time * 2.0);
  highlight = smoothstep(0.8, 1.0, highlight) * 0.3;
  
  waterColor += vec3(highlight);
  
  gl_FragColor = vec4(waterColor, 1.0);
}`,

  'neon': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float grid(vec2 uv, float size) {
  vec2 grid = fract(uv * size);
  float line = step(0.95, grid.x) + step(0.95, grid.y);
  return line;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 透视网格
  vec2 center = uv - 0.5;
  float perspective = 1.0 / (center.y + 0.5);
  vec2 gridUV = vec2(center.x * perspective, perspective);
  
  // 移动网格
  gridUV.y += u_time * 0.5;
  
  // 网格线
  float g = grid(gridUV, 8.0);
  g += grid(gridUV, 24.0) * 0.5;
  
  // 地平线辉光
  float horizon = 1.0 - abs(center.y - 0.2) * 3.0;
  horizon = max(0.0, horizon);
  
  // 霓虹色
  vec3 gridColor = vec3(0.0, 1.0, 1.0); // 青色
  vec3 horizonColor = vec3(1.0, 0.0, 0.5); // 粉色
  
  vec3 color = gridColor * g;
  color += horizonColor * horizon * 0.5;
  
  // 暗角
  float vignette = 1.0 - length(center) * 0.8;
  color *= vignette;
  
  gl_FragColor = vec4(color, 1.0);
}`
}

// 关键词映射到模板
const keywordMap: Record<string, string[]> = {
  'rainbow': ['rainbow', 'colorful', 'gradient', 'wave', 'waves', '彩虹', '波浪', '渐变'],
  'lava': ['lava', 'blob', 'liquid', 'fluid', 'magma', '熔岩', '流体', '液体'],
  'stars': ['star', 'night', 'sky', 'space', 'cosmos', 'moon', '星空', '星星', '夜空'],
  'fire': ['fire', 'flame', 'burn', 'heat', 'hot', '火焰', '火', '燃烧'],
  'water': ['water', 'ripple', 'ocean', 'sea', 'wave', 'blue', '水', '波纹', '海洋'],
  'neon': ['neon', 'grid', 'retro', 'synthwave', 'cyber', 'digital', '霓虹', '网格', '赛博']
}

function findBestTemplate(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase()
  
  for (const [template, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) {
        return shaderTemplates[template]
      }
    }
  }
  
  return shaderTemplates['rainbow']
}

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
  if (codeBlockMatch) {
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
