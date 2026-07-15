import { defineEventHandler, readBody } from 'h3'
import { getDb } from '../utils/db'
import { logInfo, logError, logWarn } from '../utils/logger'
import { getDefaultApiUrl, buildAuthHeaders, isFixedTemperatureModel, validateSettingsForProvider } from '../utils/llm/registry'
import { extractShaderCode } from '../utils/llm/shader'
import { fetchWithRetry } from '../utils/retry'

// 工具定义
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'capture_screenshot',
      description: '捕获当前着色器渲染效果的截图，用于查看当前视觉效果',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '为什么需要这个截图'
          }
        },
        required: ['reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_code',
      description: '获取当前编辑器中的 GLSL 代码，用于分析或修改现有代码',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '为什么需要查看代码'
          }
        },
        required: ['reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_code_range',
      description: '获取代码特定行范围的内容，用于查看大文件的特定部分。代码总行数可通过 get_current_code 获取',
      parameters: {
        type: 'object',
        properties: {
          start_line: {
            type: 'integer',
            description: '开始行号（从1开始）'
          },
          end_line: {
            type: 'integer',
            description: '结束行号（包含）'
          },
          reason: {
            type: 'string',
            description: '为什么需要查看这段代码'
          }
        },
        required: ['start_line', 'end_line', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'modify_code_range',
      description: '修改代码中特定行范围的内容。只在你确定需要修改的具体行时使用，避免输出整个着色器',
      parameters: {
        type: 'object',
        properties: {
          start_line: {
            type: 'integer',
            description: '开始行号（从1开始）'
          },
          end_line: {
            type: 'integer',
            description: '结束行号（包含）'
          },
          new_code: {
            type: 'string',
            description: '新的代码内容，将替换指定行范围的内容'
          },
          reason: {
            type: 'string',
            description: '为什么需要修改这段代码'
          }
        },
        required: ['start_line', 'end_line', 'new_code', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'insert_code',
      description: '在指定行号后插入新代码。用于添加新功能而不修改现有代码',
      parameters: {
        type: 'object',
        properties: {
          line_number: {
            type: 'integer',
            description: '插入位置的行号（新代码将插入在该行之后，从1开始）'
          },
          new_code: {
            type: 'string',
            description: '要插入的新代码'
          },
          reason: {
            type: 'string',
            description: '为什么需要插入这段代码'
          }
        },
        required: ['line_number', 'new_code', 'reason']
      }
    }
  }
]

// 人性化的系统提示词
function getSystemPrompt(): string {
  return `你是一位友好、专业的 GLSL 着色器编程助手。你的任务是与用户进行自然对话，帮助他们创建、理解和优化着色器代码。

交流风格：
1. 像朋友一样自然交谈，用语轻松但不失专业
2. 回答要简洁，避免长篇大论
3. 主动询问用户的具体需求，帮助他们完善想法
4. 当用户描述模糊时，给出建设性的建议
5. 如果用户用中文，你用中文回复；用户用英文，你用英文回复

你能做的事情：
1. 根据描述生成 GLSL 着色器代码
2. 解释代码的工作原理
3. 帮助调试和修复错误
4. 提供优化建议
5. 回答关于 WebGL/GLSL 的技术问题
6. 根据用户提供的代码进行修改和优化

代码生成/修改规则：
1. 使用 WebGL 1.0 兼容语法（mediump precision）
2. 必须包含：uniform float u_time; uniform vec2 u_resolution;
3. UV 坐标：vec2 uv = gl_FragCoord.xy / u_resolution.xy;
4. 输出到 gl_FragColor
5. 使用 u_time 实现动画效果
6. 如果用户提供了现有代码，请在其基础上进行修改而非重新写
7. 保持代码的可读性和结构清晰

当你生成或修改着色器代码时，请使用 Markdown 代码块格式返回（语言标记为 glsl）：

\`\`\`glsl
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
// ... 代码 ...
\`\`\`

你可以使用提供的工具来获取当前渲染效果截图或代码。当你需要查看当前状态但用户没有提供时，主动调用相应工具。

在代码块之外，你可以自由地解释、讨论或询问。如果用户要求优化代码，请说明你做了哪些改进。`
}

// 最大上下文消息数
const MAX_CONTEXT_MESSAGES = 20
// 最大token估算数
const MAX_CONTEXT_TOKENS = 4000

// 支持图片的模型
const VISION_MODELS = [
  'gpt-4-vision',
  'gpt-4o',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'gemini-1.5',
  'gemini-pro-vision',
  'kimi-k2',
  'kimi-k2.5'
]

// 工具已对所有模型开放
const TOOL_MODELS: string[] = []

// 检查模型是否支持图片
function supportsVision(model: string): boolean {
  return VISION_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()))
}

// 检查模型是否支持 tool use（已取消限制）
function supportsTools(_model: string): boolean {
  return true
}

// 估计token数量
function estimateTokens(content: string, image?: string): number {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = content.length - chineseChars
  let tokens = Math.ceil(chineseChars * 2 + otherChars * 0.25)
  if (image) {
    // base64 图片非常占 token，保守估算（约每4个base64字符对应1个token）
    tokens += Math.ceil(image.length / 4)
  }
  return tokens
}

// 智能截断上下文
function truncateContext(messages: any[]): any[] {
  let totalTokens = 0
  const result: any[] = []
  const hasImage = messages.some(m => m.image)
  const maxTokens = hasImage ? 2000 : MAX_CONTEXT_TOKENS
  const maxMessages = hasImage ? 6 : MAX_CONTEXT_MESSAGES

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const tokens = estimateTokens(msg.content || '', msg.image)

    if (totalTokens + tokens > maxTokens || result.length >= maxMessages) {
      break
    }

    result.unshift(msg)
    totalTokens += tokens
  }

  return result
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { messages, settings, stream = false, toolResults = [], enableTools: requestEnableTools = false, systemPrompt, conversationId: bodyConvId } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { error: '请提供消息列表' }
    }

    // 持久化对话和消息
    const convId = bodyConvId ? ensureConversation(bodyConvId, messages) : undefined
    if (convId) {
      persistMessages(convId, messages)
      logInfo('api/chat', 'Request persisted', { conversationId: convId, msgCount: messages.length })
    }

    // 如果有工具执行结果，添加到消息中
    if (toolResults.length > 0) {
      const toolResultContent = formatToolResultsForAI(toolResults)
      messages.push({
        role: 'tool',
        content: toolResultContent
      })
      if (convId) persistMessages(convId, messages)
    }

    // 检查最后一条消息是否包含图片
    const lastMessage = messages[messages.length - 1]
    const hasImage = lastMessage?.image || lastMessage?.content?.includes('data:image')

    // 截断过长的上下文
    const truncatedMessages = truncateContext(messages)

    // 内置模式
    if (!settings || settings.provider === 'builtin') {
      const result = await handleBuiltinMode(truncatedMessages, hasImage, stream, event, convId)
      if (!stream && convId && result && typeof result === 'object') {
        persistMessages(convId, [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          role: 'assistant',
          content: result.content || '',
          shaderCode: result.shaderCode || null,
          reasoning: result.reasoning || null,
          timestamp: Date.now(),
          rawResponse: JSON.stringify(result)
        }])
      }
      return result
    }

    // 验证设置
    const validationError = validateSettingsForProvider(settings.provider, settings.token)
    if (validationError) {
      throw createError({ statusCode: 400, message: validationError })
    }

    // 如果包含图片但模型不支持，给出提示
    if (hasImage && !supportsVision(settings.model)) {
      const messagesWithoutImage = truncatedMessages.map(m => ({
        ...m,
        image: undefined
      }))

      if (stream) {
        return createWarningStream('当前模型不支持图片，将只根据文字描述回复。如需视觉反馈，请使用支持多模态的模型（如 GPT-4o、Claude 3、Kimi K2 等）。', event)
      }

      const result = await handleNormalResponse(messagesWithoutImage, settings, false,
        '（用户发送了一张渲染截图，但当前模型不支持图片识别。以下是基于文字描述的回复。）')
      if (convId) {
        persistMessages(convId, [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          role: 'assistant',
          content: result.content || '',
          shaderCode: result.shaderCode || null,
          toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : null,
          timestamp: Date.now(),
          rawResponse: JSON.stringify(result)
        }])
      }
      return result
    }

    // 判断是否需要启用工具（优先使用请求中的设置）
    const enableTools = requestEnableTools && supportsTools(settings.model)

    // 流式或非流式处理
    if (stream) {
      let assistantMsgId: string | undefined
      if (convId) {
        assistantMsgId = Date.now().toString(36) + Math.random().toString(36).slice(2)
        persistMessages(convId, [{ id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() }])
      }
      return await handleStreamResponse(truncatedMessages, settings, enableTools, event, convId, assistantMsgId)
    } else {
      const result = await handleNormalResponse(truncatedMessages, settings, enableTools, systemPrompt)
      if (convId) {
        persistMessages(convId, [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          role: 'assistant',
          content: result.content || '',
          shaderCode: result.shaderCode || null,
          toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : null,
          timestamp: Date.now(),
          rawResponse: JSON.stringify(result)
        }])
      }
      return result
    }

  } catch (error: any) {
    logError('api/chat', error.message || '处理失败', { stack: error.stack })
    throw createError({ statusCode: 500, message: error.message || '处理失败' })
  }
})

// 格式化工具结果给 AI
function formatToolResultsForAI(results: any[]): string {
  return results.map(r => {
    if (r.name === 'capture_screenshot') {
      return `[截图已捕获] ${r.result || '成功'}`
    } else if (r.name === 'get_current_code') {
      return `[当前代码]\n\`\`\`glsl\n${r.result || '无法获取代码'}\n\`\`\``
    } else if (r.name === 'get_code_range') {
      const rangeInfo = r.arguments ? `(第 ${JSON.parse(r.arguments).start_line} 到 ${JSON.parse(r.arguments).end_line} 行)` : ''
      return `[代码片段 ${rangeInfo}]\n\`\`\`glsl\n${r.result || '无法获取代码片段'}\n\`\`\``
    } else if (r.name === 'modify_code_range') {
      const args = r.arguments ? JSON.parse(r.arguments) : {}
      return `[代码修改成功] 第 ${args.start_line} 到 ${args.end_line} 行已替换为新代码`
    } else if (r.name === 'insert_code') {
      const args = r.arguments ? JSON.parse(r.arguments) : {}
      return `[代码插入成功] 在第 ${args.line_number} 行后插入了新代码`
    }
    return `[工具执行: ${r.name}] ${r.result || r.error || ''}`
  }).join('\n\n')
}

// 创建警告流
function createWarningStream(warning: string, event: any) {
  event.node.res.setHeader('Content-Type', 'text/event-stream')
  event.node.res.setHeader('Cache-Control', 'no-cache')
  event.node.res.setHeader('Connection', 'keep-alive')

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: `⚠️ ${warning}\n\n` })}\n\n`))
      await new Promise(r => setTimeout(r, 500))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })
}

// 内置模板模式
async function handleBuiltinMode(messages: any[], hasImage: boolean, stream: boolean, event: any, convId?: string) {
  const lastMessage = messages[messages.length - 1]
  const prompt = lastMessage?.content || ''

  const thoughts = [
    '理解用户需求中...',
    hasImage ? '注意到用户附带了渲染截图...' : '分析关键词：' + prompt.slice(0, 20) + '...',
    '匹配合适的着色器效果...',
    '生成代码中...'
  ]

  const { findBestTemplate, getTemplateDescription } = await import('./templates')

  // 检查是否是技术问题
  const isQuestion = prompt.includes('?') || prompt.includes('？') ||
                     prompt.includes('怎么') || prompt.includes('为什么') ||
                     prompt.includes('如何') || prompt.includes('是什么')

  if (isQuestion && !prompt.match(/(彩虹|波浪|熔岩|星空|火焰|水|霓虹|shader|效果)/i)) {
    const answer = hasImage
      ? `我看到你分享了一张截图！📸\n\n作为内置助手，我目前还不能分析图片内容。但如果你描述一下想要的效果或遇到的问题，我很乐意帮你生成新的着色器代码或解释现有代码。`
      : `你好！我是你的着色器助手。🎨\n\n我可以帮你：\n• 生成各种视觉效果的 GLSL 着色器代码\n• 解释着色器的工作原理\n• 调试和优化现有代码\n• 回答 WebGL/GLSL 相关问题\n\n试着描述你想要的效果，比如："创建一个彩虹波浪效果" 或 "我想做一个星空动画"。\n\n有什么我可以帮你的吗？`

    if (stream) {
      return createMockStream(thoughts, answer, null, event, convId)
    }

    return { content: answer, shaderCode: null, reasoning: thoughts.join('\n'), model: '内置助手' }
  }

  // 生成着色器模式
  const shaderCode = findBestTemplate(prompt)
  const description = getTemplateDescription(prompt)

  let response
  if (hasImage) {
    response = `收到你的反馈！我为你重新生成了一个${description}效果。你可以在右侧预览窗口看到新效果。\n\n（注：内置模式无法分析图片内容，建议切换到支持多模态的 AI 模型以获得更准确的视觉反馈）`
  } else {
    response = `好的！我为你生成了一个${description}效果。你可以在右侧预览窗口看到实时效果。\n\n这个着色器使用了噪声函数和正弦波来创建动态效果。如果你想要调整颜色或动画速度，随时告诉我！`
  }

  if (stream) {
    return createMockStream(thoughts, response, shaderCode, event, convId)
  }

  return {
    content: response,
    shaderCode,
    reasoning: thoughts.join('\n'),
    model: '模板匹配'
  }
}

// 创建模拟流
function createMockStream(thoughts: string[], content: string, shaderCode: string | null, event: any, convId?: string) {
  event.node.res.setHeader('Content-Type', 'text/event-stream')
  event.node.res.setHeader('Cache-Control', 'no-cache')
  event.node.res.setHeader('Connection', 'keep-alive')

  const encoder = new TextEncoder()
  const rawLines: string[] = []

  const stream = new ReadableStream({
    async start(controller) {
      for (const thought of thoughts) {
        const line = `data: ${JSON.stringify({ type: 'reasoning', content: thought + '\n' })}\n\n`
        rawLines.push(line)
        controller.enqueue(encoder.encode(line))
        await new Promise(r => setTimeout(r, 200))
      }

      rawLines.push(`data: ${JSON.stringify({ type: 'reasoning_end' })}\n\n`)
      controller.enqueue(encoder.encode(rawLines[rawLines.length - 1]))

      for (const char of content) {
        const line = `data: ${JSON.stringify({ type: 'content', content: char })}\n\n`
        rawLines.push(line)
        controller.enqueue(encoder.encode(line))
        await new Promise(r => setTimeout(r, 30))
      }

      if (shaderCode) {
        const line = `data: ${JSON.stringify({ type: 'shader', code: shaderCode })}\n\n`
        rawLines.push(line)
        controller.enqueue(encoder.encode(line))
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      if (convId) {
        persistMessages(convId, [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          role: 'assistant',
          content,
          shaderCode,
          reasoning: thoughts.join('\n'),
          timestamp: Date.now(),
          rawResponse: rawLines.join('')
        }])
      }
      controller.close()
    }
  })

  return stream
}

// 流式响应
async function handleStreamResponse(messages: any[], settings: any, enableTools: boolean, event: any, convId?: string, assistantMsgId?: string) {
  const apiUrl = settings.customUrl || getDefaultApiUrl(settings.provider)

  const requestBody = prepareRequestBody(messages, settings, enableTools)

  const response = await fetchWithRetry(apiUrl, {
    method: 'POST',
    headers: prepareHeaders(settings),
    body: JSON.stringify({
      ...requestBody,
      stream: true
    })
  }, {
    signal: event.node.req.signal,
    baseDelayMs: 1000,
    onRetry: info => logWarn('api/chat', `Retrying after ${info.reason}`, { attempt: info.attempt, delayMs: info.delayMs })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API 错误: ${error}`)
  }

  event.node.res.setHeader('Content-Type', 'text/event-stream')
  event.node.res.setHeader('Cache-Control', 'no-cache')
  event.node.res.setHeader('Connection', 'keep-alive')

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应')

  const encoder = new TextEncoder()
  let buffer = ''
  let fullContent = ''
  let inShaderBlock = false
  let shaderBuffer = ''
  const toolCalls: any[] = []
  const rawLines: string[] = []

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += new TextDecoder().decode(value)
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue

            rawLines.push(line)
            const data = line.slice(6)
            if (data === '[DONE]') {
              // 检查是否有工具调用
              if (toolCalls.length > 0) {
                // 验证并修复工具调用的参数
                const validatedToolCalls = toolCalls.map(tc => {
                  // 确保 arguments 是有效的 JSON 字符串
                  if (!tc.arguments) {
                    tc.arguments = '{}'
                  } else {
                    try {
                      JSON.parse(tc.arguments)
                    } catch (e) {
                      // 尝试修复无效的 JSON
                      try {
                        const fixed = tc.arguments.trim()
                        JSON.parse(fixed)
                        tc.arguments = fixed
                      } catch (e2) {
                        // 如果无法修复，使用空对象
                        tc.arguments = '{}'
                      }
                    }
                  }
                  return tc
                })
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_calls', calls: validatedToolCalls })}\n\n`))
              }

              // 尝试从 Markdown 代码块提取代码（支持 glsl/shader 语言标记）
              const shaderMatch = fullContent.match(/```(?:glsl|shader)\n?([\s\S]*?)```/) ||
                                 fullContent.match(/<shader>([\s\S]*?)<\/shader>/)

              const extractedShader = shaderMatch?.[1] ? shaderMatch[1].trim() : null
              if (extractedShader) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'shader', code: extractedShader })}\n\n`))
              }

              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              if (convId && assistantMsgId) {
                updateAssistantMessage(convId, assistantMsgId, {
                  content: fullContent,
                  reasoning: '',
                  shaderCode: extractedShader,
                  rawResponse: rawLines.join('\n')
                })
                logInfo('api/chat', 'Stream persisted', { conversationId: convId, assistantMsgId })
              }
              controller.close()
              return
            }

            try {
              const parsed = JSON.parse(data)

              // 检查是否有工具调用 (Kimi format)
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                const deltaToolCalls = parsed.choices[0].delta.tool_calls
                for (const tc of deltaToolCalls) {
                  if (tc.function?.name) {
                    toolCalls.push({
                      id: tc.id,
                      name: tc.function.name,
                      arguments: tc.function.arguments || ''
                    })
                  } else if (tc.function?.arguments && toolCalls.length > 0) {
                    // 追加参数
                    toolCalls[toolCalls.length - 1].arguments += tc.function.arguments
                  }
                }
                continue
              }

              let content = ''

              if (settings.provider === 'anthropic') {
                content = parsed.delta?.text || parsed.content_block?.text || ''
              } else {
                content = parsed.choices?.[0]?.delta?.content || ''
              }

              if (!content) continue

              fullContent += content

              // 检测代码块开始 ```glsl 或 ```shader
              const codeBlockStart = content.match(/```(?:glsl|shader)/)
              if (codeBlockStart) {
                inShaderBlock = true
                const beforeCode = content.split(codeBlockStart[0])[0]
                if (beforeCode) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: beforeCode })}\n\n`))
                }
                shaderBuffer = ''
                continue
              }

              // 检测代码块结束 ```
              if (inShaderBlock && content.includes('```')) {
                inShaderBlock = false
                const parts = content.split('```')
                shaderBuffer += parts[0]
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'shader', code: shaderBuffer.trim() })}\n\n`))
                if (parts[1]) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: parts[1] })}\n\n`))
                }
                shaderBuffer = ''
                continue
              }

              if (inShaderBlock) {
                shaderBuffer += content
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`))
              }

            } catch (e) {}
          }
        }
        if (convId && assistantMsgId) {
          updateAssistantMessage(convId, assistantMsgId, {
            content: fullContent,
            reasoning: '',
            shaderCode: null,
            rawResponse: rawLines.join('\n')
          })
        }
        controller.close()
      } catch (error) {
        if (convId && assistantMsgId) {
          updateAssistantMessage(convId, assistantMsgId, {
            content: fullContent,
            reasoning: '',
            shaderCode: null,
            rawResponse: rawLines.join('\n')
          })
        }
        controller.error(error)
      }
    }
  })
}

// 普通响应
async function handleNormalResponse(messages: any[], settings: any, enableTools: boolean, customSystemPrompt?: string) {
  const apiUrl = settings.customUrl || getDefaultApiUrl(settings.provider)

  const requestBody = prepareRequestBody(messages, settings, enableTools, customSystemPrompt)

  const response = await fetchWithRetry(apiUrl, {
    method: 'POST',
    headers: prepareHeaders(settings),
    body: JSON.stringify(requestBody)
  }, {
    signal: event.node.req.signal,
    baseDelayMs: 1000,
    onRetry: info => logWarn('api/chat', `Retrying after ${info.reason}`, { attempt: info.attempt, delayMs: info.delayMs })
  })

  if (!response.ok) {
    throw new Error(`API 错误: ${await response.text()}`)
  }

  const data = await response.json()
  let content = ''
  let toolCalls: any[] = []

  // 检查是否有工具调用 (Kimi format)
  if (data.choices?.[0]?.message?.tool_calls) {
    toolCalls = data.choices[0].message.tool_calls.map((tc: any) => {
      let args = tc.function.arguments
      // 验证并修复参数
      if (!args) {
        args = '{}'
      } else {
        try {
          JSON.parse(args)
        } catch (e) {
          try {
            const fixed = args.trim()
            JSON.parse(fixed)
            args = fixed
          } catch (e2) {
            args = '{}'
          }
        }
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args
      }
    })
  }

  if (settings.provider === 'anthropic') {
    content = data.content?.[0]?.text || ''
  } else {
    content = data.choices?.[0]?.message?.content || ''
  }

  // 支持 Markdown 代码块和旧的 <shader> 标签
  const shaderMatch = content.match(/```(?:glsl|shader)\n?([\s\S]*?)```/) ||
                     content.match(/<shader>([\s\S]*?)<\/shader>/)
  const shaderCode = shaderMatch?.[1] ? shaderMatch[1].trim() : null

  // 移除代码块内容，保留其他文本
  const cleanContent = content
    .replace(/```(?:glsl|shader)\n?[\s\S]*?```/, '')
    .replace(/<shader>[\s\S]*?<\/shader>/, '')
    .trim()

  return {
    content: cleanContent,
    shaderCode,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: data.model || settings.model,
    _raw: data // 内部字段，主 handler 会用来提取 rawResponse
  }
}

// 准备请求头
function prepareHeaders(settings: any): Record<string, string> {
  return buildAuthHeaders(settings.provider, settings.token)
}

// 准备请求体
function prepareRequestBody(messages: any[], settings: any, enableTools: boolean, customSystemPrompt?: string): any {
  const systemPrompt = customSystemPrompt || getSystemPrompt()
  const msgs = messages.filter(m => m.role !== 'system').map(m => {
    // 处理包含图片的消息
    if (m.image && supportsVision(settings.model)) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content || '' },
          {
            type: 'image_url',
            image_url: { url: m.image }
          }
        ]
      }
    }
    return { role: m.role, content: m.content || '' }
  })

  const body: any = {
    model: settings.model,
    messages: [{ role: 'system', content: systemPrompt }, ...msgs],
    max_tokens: settings.maxTokens || 2048
  }

  // 只有非固定 temperature 模型才添加 temperature 参数
  if (!isFixedTemperatureModel(settings.model)) {
    body.temperature = settings.temperature ?? 0.7
  }

  // 添加工具支持
  if (enableTools) {
    body.tools = TOOLS
  }

  return body
}

// (extractShaderCode moved to server/utils/llm/shader.ts so it can be imported from unit tests.)

// ==================== Database Helpers ====================

function ensureConversation(conversationId: string, messages: any[]): string {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(conversationId)
  if (!existing) {
    const firstUser = messages.find((m: any) => m.role === 'user')
    const title = firstUser ? (firstUser.content || '').slice(0, 30) : '新对话'
    const now = Date.now()
    db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(conversationId, title, now, now)
  }
  return conversationId
}

function persistMessages(conversationId: string, messages: any[]) {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, image, reasoning, shader_code, tool_calls, raw_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const m of messages) {
    const msgId = String(m.id || Date.now() + Math.random())
    stmt.run(
      msgId,
      conversationId,
      m.role,
      m.content || '',
      m.image || null,
      m.reasoning || null,
      m.shaderCode || null,
      m.toolCalls ? (typeof m.toolCalls === 'string' ? m.toolCalls : JSON.stringify(m.toolCalls)) : null,
      m.rawResponse || null,
      m.timestamp || Date.now()
    )
  }
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId)
}

function updateAssistantMessage(conversationId: string, msgId: string, data: any) {
  const db = getDb()
  db.prepare(
    `UPDATE messages SET content = ?, reasoning = ?, shader_code = ?, raw_response = ? WHERE id = ? AND conversation_id = ?`
  ).run(
    data.content ?? '',
    data.reasoning ?? null,
    data.shaderCode ?? null,
    data.rawResponse ?? null,
    msgId,
    conversationId
  )
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId)
}
