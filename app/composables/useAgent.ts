import type { Message, ReviewResult, ToolCall, ToolResult, AISettings } from '~/types'

const MAX_AGENT_IDLE_ROUNDS = 3
const MAX_AGENT_TOTAL_ROUNDS = 10
const MAX_AGENT_QUEUE_SIZE = 5

export function useAgent() {
  const isAgentRunning = ref(false)
  const isPaused = ref(false)
  const status = ref('')
  const round = ref(0)
  const pendingMessages = ref<{ content: string; timestamp: number }[]>([])
  const history = ref<Message[]>([])
  let abortController: AbortController | null = null

  // 获取 Agent 头像
  function getAgentAvatar(role?: string): string {
    if (role === 'coder') return '🧑‍💻'
    if (role === 'reviewer') return '🔍'
    if (role === 'system') return '⚙️'
    return '✨'
  }

  // 解析 Reviewer 响应
  function parseReviewerResponse(content: string): ReviewResult {
    if (!content) return { verdict: 'FAIL', feedback: '空响应' }

    const trimmed = content.trim()

    // 1. 尝试匹配 markdown 代码块
    const codeBlockMatch = trimmed.match(/```(?:json)?\n?([\s\S]*?)```/)
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim())
        if (parsed.verdict && parsed.feedback) return parsed
      } catch (e) {}
    }

    // 2. 尝试直接解析整个内容
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.verdict && parsed.feedback) {
        return { verdict: parsed.verdict, feedback: parsed.feedback }
      }
    } catch (e) {}

    // 3. 尝试从文本中提取 JSON 对象
    const jsonMatch = trimmed.match(/\{[\s\S]*?"verdict"[\s\S]*?"feedback"[\s\S]*?\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return { verdict: parsed.verdict, feedback: parsed.feedback }
      } catch (e2) {}
    }

    // 4. 尝试匹配文本格式的 verdict
    const textVerdictMatch = trimmed.match(/(?:verdict|Verdict)["']?\s*[:：]\s*["']?(PASS|FAIL|ERROR)["']?/i)
    if (textVerdictMatch) {
      const verdict = textVerdictMatch[1].toUpperCase() as ReviewResult['verdict']
      const feedback = trimmed
        .replace(/(?:verdict|Verdict)["']?\s*[:：]\s*["']?(PASS|FAIL|ERROR)["']?/i, '')
        .replace(/^(?:[-—]+|\s)*/, '')
        .trim() || trimmed
      return { verdict, feedback }
    }

    // fallback
    return { verdict: 'FAIL', feedback: trimmed || '审查结果解析失败' }
  }

  // 提取 shader 代码
  function extractShaderCode(content: string): string | null {
    const match = content.match(/```(?:glsl|shader)\n?([\s\S]*?)```/) ||
                  content.match(/<shader>([\s\S]*?)<\/shader>/)
    return match ? match[1].trim() : null
  }

  // 获取上下文摘要
  function getContextSummary(): string {
    return history.value
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n---\n')
  }

  // 调用 chat API
  async function callChatAPI(
    msgs: Message[],
    settings: AISettings,
    options: { role?: string; stream?: boolean } = {}
  ) {
    const { role = 'default', stream = false } = options

    const history = msgs.map(m => {
      const msg: { role: string; content: string; image?: string } = { role: m.role, content: m.content || '' }
      if (m.image) msg.image = m.image
      return msg
    })

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        settings: settings.provider === 'builtin' ? null : { ...settings },
        stream,
        role
      }),
      signal: abortController?.signal
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    return await response.json()
  }

  // 执行工具调用
  async function executeToolCalls(
    toolCalls: ToolCall[],
    callbacks: {
      requestScreenshot: () => Promise<{ text: string; image?: string }>
      requestCode: () => Promise<string>
    }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const toolCall of toolCalls) {
      const result: ToolResult = { name: toolCall.name, arguments: toolCall.arguments }

      try {
        switch (toolCall.name) {
          case 'capture_screenshot': {
            const screenshotResult = await callbacks.requestScreenshot()
            result.result = screenshotResult.text
            result.image = screenshotResult.image
            break
          }
          case 'get_current_code':
            result.result = await callbacks.requestCode()
            break
          default:
            result.error = `未知工具: ${toolCall.name}`
        }
      } catch (error: any) {
        result.error = error.message
      }

      results.push(result)
    }

    return results
  }

  // Agent 主循环
  async function runAgentLoop(
    initialPrompt: string | null,
    settings: AISettings,
    callbacks: {
      addMessage: (role: Message['role'], content: string, extra?: Partial<Message>) => Message
      addSystemMessage: (content: string, round?: number) => Message
      requestScreenshot: () => Promise<{ text: string; image?: string }>
      requestCode: () => Promise<string>
      requestCompileStatus: () => Promise<{ success: boolean; error: string | null }>
      onShaderCode: (code: string) => void
      onSaveMessages: () => void
      scrollToBottom: () => void
    }
  ) {
    if (isAgentRunning.value) return
    isAgentRunning.value = true
    isPaused.value = false
    round.value = 0
    abortController = new AbortController()

    if (initialPrompt) {
      pendingMessages.value = []
      callbacks.addSystemMessage('🤖 Agent 模式已启动，正在根据需求迭代代码...')
    } else {
      callbacks.addSystemMessage('🤖 Agent 继续运行...')
    }

    let idleRounds = 0
    let hasCompleted = false

    try {
      while (!hasCompleted) {
        // 1. 处理用户消息队列
        if (pendingMessages.value.length > 0) {
          const msgs = [...pendingMessages.value]
          pendingMessages.value = []
          for (const m of msgs) {
            history.value.push({ role: 'user', content: m.content, timestamp: m.timestamp, id: Date.now() })
          }
          idleRounds = 0
          callbacks.addSystemMessage(`收到 ${msgs.length} 条新消息，纳入下一轮迭代...`, round.value)
        }

        round.value++
        idleRounds++

        if (round.value > MAX_AGENT_TOTAL_ROUNDS) {
          callbacks.addSystemMessage(`⚠️ 已达最大总轮次 (${MAX_AGENT_TOTAL_ROUNDS})，Agent 暂停。发送新消息可继续。`, round.value)
          isPaused.value = true
          break
        }

        // ========== Coder 轮次 ==========
        status.value = `🧑‍💻 Coder 写代码中 (第 ${round.value} 轮)...`
        callbacks.scrollToBottom()

        const coderRes = await callChatAPI(history.value, settings, { role: 'coder', stream: false })

        if (abortController.signal.aborted) {
          throw new Error('AbortError')
        }

        const coderContent = coderRes.content || ''
        const shaderCode = coderRes.shaderCode || extractShaderCode(coderContent)

        // 展示 Coder 消息
        callbacks.addMessage('assistant', coderContent, {
          shaderCode,
          agentMeta: { role: 'coder', round: round.value }
        })
        if (shaderCode) {
          callbacks.onShaderCode(shaderCode)
        }

        // 防止 API 报错
        const safeCoderContent = coderContent?.trim() || (coderRes.shaderCode ? '```glsl\n' + coderRes.shaderCode + '\n```' : '代码已生成。')
        history.value.push({ role: 'assistant', content: safeCoderContent, timestamp: Date.now(), id: Date.now() })

        // 等待渲染编译
        status.value = '⏳ 等待渲染编译...'
        await sleep(500)

        // ========== 编译状态 + 截图 ==========
        const compileStatus = await callbacks.requestCompileStatus()

        if (!compileStatus.success) {
          callbacks.addSystemMessage(`❌ 编译失败：${compileStatus.error}`, round.value)
          history.value.push({ role: 'user', content: `编译失败，请修复：\n${compileStatus.error}`, timestamp: Date.now(), id: Date.now() })
          continue
        } else {
          callbacks.addSystemMessage(`✅ 编译通过，正在截图...`, round.value)
        }

        const screenshotResult = await callbacks.requestScreenshot()

        if (abortController.signal.aborted) {
          throw new Error('AbortError')
        }

        // 检查截图有效性
        const imageData = screenshotResult.image
        if (!imageData || typeof imageData !== 'string' || imageData.length < 100) {
          callbacks.addSystemMessage(`❌ 截图失败（无有效图像数据），Agent 暂停。请检查渲染器是否正常。`, round.value)
          isPaused.value = true
          break
        }
        callbacks.addSystemMessage(`📸 截图已获取（${Math.round(imageData.length / 1024)}KB），正在交给 Reviewer...`, round.value)

        // ========== Reviewer 轮次 ==========
        status.value = `🔍 Reviewer 检查中 (第 ${round.value} 轮)...`
        callbacks.scrollToBottom()

        const contextSummary = getContextSummary()
        const reviewerInput: Message = {
          role: 'user',
          content: `请审查当前着色器效果。需求上下文：\n${contextSummary}\n\n当前编译状态：成功。\n截图已经附在本消息中，请直接分析图片给出审查结论（PASS / FAIL / ERROR）。`,
          timestamp: Date.now(),
          id: Date.now(),
          image: imageData
        }

        const reviewerRes = await callChatAPI([...history.value, reviewerInput], settings, { role: 'reviewer', stream: false })

        if (abortController.signal.aborted) {
          throw new Error('AbortError')
        }

        const review = parseReviewerResponse(reviewerRes.content)

        // 展示 Reviewer 消息
        callbacks.addMessage('assistant', `**Reviewer Verdict: ${review.verdict}**\n\n${review.feedback}`, {
          agentMeta: { role: 'reviewer', round: round.value }
        })

        if (review.verdict === 'PASS') {
          callbacks.addSystemMessage('✅ Reviewer 审查通过！Agent 迭代完成。', round.value)
          isPaused.value = false
          hasCompleted = true
          break
        }

        // 检查是否达到 idle 上限且队列为空
        if (idleRounds >= MAX_AGENT_IDLE_ROUNDS && pendingMessages.value.length === 0) {
          callbacks.addSystemMessage(`⏸️ Agent 已连续迭代 ${idleRounds} 轮，等待你的反馈。发送消息即可继续。`, round.value)
          isPaused.value = true
          break
        }

        // 未通过，继续迭代
        history.value.push({ role: 'user', content: `Reviewer 反馈：${review.feedback}\n请根据反馈修改代码。`, timestamp: Date.now(), id: Date.now() })
      }

      callbacks.onSaveMessages()

    } catch (error: any) {
      if (error.message === 'AbortError' || error.name === 'AbortError') {
        callbacks.addSystemMessage('Agent 已停止。')
      } else {
        callbacks.addSystemMessage(`❌ Agent 出错：${error.message || '请检查网络连接和API设置'}`)
      }
      isPaused.value = false
    } finally {
      isAgentRunning.value = false
      status.value = ''
      abortController = null
    }
  }

  // 停止 Agent
  function stopAgent() {
    if (abortController) {
      abortController.abort()
    }
  }

  // 添加待处理消息
  function queueMessage(content: string) {
    pendingMessages.value.push({ content, timestamp: Date.now() })
    if (pendingMessages.value.length > MAX_AGENT_QUEUE_SIZE) {
      pendingMessages.value.shift()
    }
  }

  // 重置 Agent 状态
  function resetAgent() {
    pendingMessages.value = []
    history.value = []
    round.value = 0
    isPaused.value = false
  }

  return {
    isAgentRunning,
    isPaused,
    status,
    round,
    pendingMessages,
    getAgentAvatar,
    parseReviewerResponse,
    extractShaderCode,
    runAgentLoop,
    stopAgent,
    queueMessage,
    resetAgent
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
