import type { Message, ToolCall, ToolResult, AISettings } from '../../types'

const MAX_AGENT_ROUNDS = 10

// Agent 系统提示词
const AGENT_SYSTEM_PROMPT = `你是一个智能着色器开发助手，由两个内部角色协同工作：

## 🧑‍💻 Coder（代码生成者）
职责：根据需求生成或修改 GLSL 着色器代码，可以调用工具获取当前状态

## 🔍 Reviewer（代码审查者）
职责：检查生成的着色器是否满足需求，评估视觉效果，给出 PASS/FAIL 结论

## 可用工具
- capture_screenshot: 捕获当前渲染截图（带 reason 参数）
- get_current_code: 获取当前编辑器代码（带 reason 参数）

## 规则
- WebGL 1.0 语法，必须包含 u_time 和 u_resolution
- Coder 生成代码后用 \`\`\`glsl 包裹
- Reviewer 最后必须输出 "VERDICT: PASS" 或 "VERDICT: FAIL"，然后说明原因
- 保持代码可读性

请开始工作。当前角色：Coder`

export function useAgent() {
  const isAgentRunning = ref(false)
  const isPaused = ref(false)
  const status = ref('')
  const round = ref(0)
  const currentRole = ref<'coder' | 'reviewer'>('coder')
  let abortController: AbortController | null = null
  let interruptRequested = false

  function getAgentAvatar(role?: string): string {
    if (role === 'coder') return '🧑‍💻'
    if (role === 'reviewer') return '🔍'
    if (role === 'system') return '⚙️'
    return '✨'
  }

  function parseReviewResult(content: string): { verdict: 'PASS' | 'FAIL' | null; feedback: string } {
    const verdictMatch = content.match(/VERDICT\s*:\s*(PASS|FAIL)/i)
    if (verdictMatch?.[1]) {
      return {
        verdict: verdictMatch[1].toUpperCase() as 'PASS' | 'FAIL',
        feedback: content.replace(/VERDICT\s*:\s*(PASS|FAIL)/i, '').trim()
      }
    }
    return { verdict: null, feedback: content }
  }

  // 流式调用 chat API
  async function* streamChatAPI(
    messages: Message[],
    settings: AISettings,
    options: { enableTools?: boolean } = {}
  ) {
    const { enableTools = false } = options

    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content || '',
      ...(m.image ? { image: m.image } : {})
    }))

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: formattedMessages,
        settings: settings.provider === 'builtin' ? null : { ...settings },
        stream: true,
        enableTools
      }),
      signal: abortController?.signal
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          yield parsed
        } catch (e) {}
      }
    }
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
            const res = await callbacks.requestScreenshot()
            result.result = res.text
            result.image = res.image
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

  // Agent 主循环 - 流式输出
  async function runAgentLoop(
    initialPrompt: string | null,
    messages: Message[],
    settings: AISettings,
    callbacks: {
      addMessage: (role: Message['role'], content: string, extra?: Partial<Message>) => Message
      updateLastMessage: (updater: Partial<Message> | ((msg: Message) => Partial<Message>)) => void
      addSystemMessage: (content: string) => void
      requestScreenshot: () => Promise<{ text: string; image?: string }>
      requestCode: () => Promise<string>
      onShaderCode: (code: string) => void
      onSaveMessages: () => void
      scrollToBottom: () => void
    }
  ) {
    if (isAgentRunning.value) return
    isAgentRunning.value = true
    isPaused.value = false
    interruptRequested = false
    round.value = 0
    currentRole.value = 'coder'
    abortController = new AbortController()

    // 工作内存 - 只包含当前轮次的对话
    const workingMemory: Message[] = [...messages]

    callbacks.addSystemMessage('🤖 Agent 模式已启动，Coder 开始工作...')

    try {
      while (round.value < MAX_AGENT_ROUNDS) {
        round.value++

        // ========== Coder 阶段（流式）==========
        currentRole.value = 'coder'
        status.value = `🧑‍💻 Coder 工作中 (第 ${round.value} 轮)...`
        callbacks.scrollToBottom()

        const coderMessages: Message[] = [
          { id: 'sys', role: 'system', content: AGENT_SYSTEM_PROMPT, timestamp: Date.now() },
          ...workingMemory.filter(m => m.role !== 'system'),
          ...(round.value === 1 && initialPrompt
            ? [{ id: Date.now(), role: 'user' as const, content: initialPrompt, timestamp: Date.now() }]
            : [])
        ]

        // 添加一条空的 assistant 消息用于流式更新
        const coderMsgId = Date.now() + Math.random()
        callbacks.addMessage('assistant', '', {
          id: coderMsgId,
          agentMeta: { role: 'coder', round: round.value },
          isStreaming: true
        })

        let coderContent = ''
        let shaderCode: string | null = null
        let pendingToolCalls: ToolCall[] = []

        // 流式接收
        for await (const chunk of streamChatAPI(coderMessages, settings, { enableTools: true })) {
          if (abortController.signal.aborted) throw new Error('AbortError')

          if (chunk.type === 'content') {
            coderContent += chunk.content || ''
            callbacks.updateLastMessage({ content: coderContent })
            callbacks.scrollToBottom()
          } else if (chunk.type === 'shader' && chunk.code) {
            shaderCode = chunk.code
            callbacks.updateLastMessage({ shaderCode })
            callbacks.onShaderCode(chunk.code)
          } else if (chunk.type === 'tool_calls' && chunk.calls) {
            pendingToolCalls = chunk.calls
          }
        }

        // 完成流式输出
        callbacks.updateLastMessage({ isStreaming: false })

        // 检查是否为空内容
        if (!coderContent.trim() && !shaderCode) {
          coderContent = '（Coder 未返回有效内容）'
          callbacks.updateLastMessage({ content: coderContent })
        }

        // 保存到工作内存
        workingMemory.push({
          id: coderMsgId,
          role: 'assistant',
          content: coderContent,
          timestamp: Date.now(),
          shaderCode,
          agentMeta: { role: 'coder', round: round.value }
        })

        // 处理工具调用
        if (pendingToolCalls.length > 0) {
          status.value = '🔧 执行工具调用...'
          callbacks.scrollToBottom()

          const toolResults = await executeToolCalls(pendingToolCalls, callbacks)

          // 添加工具结果消息
          const toolResultContent = toolResults.map(r =>
            r.image ? `[截图已捕获] ${r.result}` : `[${r.name}] ${r.result || r.error}`
          ).join('\n')

          callbacks.addMessage('system', toolResultContent, {
            toolResults,
            image: toolResults.find(r => r.name === 'capture_screenshot')?.image
          })

          // 添加用户消息形式的工具结果到工作内存，让 AI 继续处理
          workingMemory.push({
            id: Date.now(),
            role: 'user',
            content: `工具执行结果：\n${toolResultContent}`,
            timestamp: Date.now()
          })

          continue // 继续 Coder 阶段，处理工具结果
        }

        // ========== Reviewer 阶段（流式）==========
        currentRole.value = 'reviewer'
        status.value = `🔍 Reviewer 审查中 (第 ${round.value} 轮)...`
        callbacks.scrollToBottom()

        // Reviewer 只审查 Coder 刚生成的代码
        const reviewerMessages: Message[] = [
          { id: 'sys', role: 'system', content: AGENT_SYSTEM_PROMPT, timestamp: Date.now() },
          { id: Date.now(), role: 'user', content: `请审查以下着色器代码：\n\n${coderContent}\n\n请给出审查结论（VERDICT: PASS 或 VERDICT: FAIL）并说明原因。`, timestamp: Date.now() }
        ]

        const reviewMsgId = Date.now() + Math.random()
        callbacks.addMessage('assistant', '', {
          id: reviewMsgId,
          agentMeta: { role: 'reviewer', round: round.value },
          isStreaming: true
        })

        let reviewContent = ''

        for await (const chunk of streamChatAPI(reviewerMessages, settings, { enableTools: false })) {
          if (abortController.signal.aborted) throw new Error('AbortError')

          if (chunk.type === 'content') {
            reviewContent += chunk.content || ''
            callbacks.updateLastMessage({ content: reviewContent })
            callbacks.scrollToBottom()
          }
        }

        callbacks.updateLastMessage({ isStreaming: false })

        // 确保内容不为空
        if (!reviewContent.trim()) {
          reviewContent = 'VERDICT: FAIL\n\n审查未返回有效内容，继续迭代。'
          callbacks.updateLastMessage({ content: reviewContent })
        }

        const review = parseReviewResult(reviewContent)

        // 检查审查结果
        if (review.verdict === 'PASS') {
          callbacks.addSystemMessage(`✅ 第 ${round.value} 轮审查通过！Agent 迭代完成。`)
          break
        }

        // 未通过，添加反馈到工作内存
        if (review.feedback) {
          workingMemory.push({
            id: Date.now(),
            role: 'user',
            content: `请根据以下反馈修改代码：\n${review.feedback}`,
            timestamp: Date.now()
          })
        }

        // 检查是否达到最大轮次
        if (round.value >= MAX_AGENT_ROUNDS) {
          callbacks.addSystemMessage(`⏸️ 已达最大迭代轮次 (${MAX_AGENT_ROUNDS})，Agent 暂停。`)
          isPaused.value = true
          break
        }
      }

      callbacks.onSaveMessages()

    } catch (error: any) {
      if (error.message === 'AbortError' || error.name === 'AbortError') {
        callbacks.addSystemMessage(interruptRequested ? 'Agent 已中断。' : 'Agent 已停止。')
      } else {
        callbacks.addSystemMessage(`❌ Agent 出错：${error.message || '请检查网络连接'}`)
      }
      isPaused.value = false
    } finally {
      isAgentRunning.value = false
      status.value = ''
      abortController = null
      interruptRequested = false
    }
  }

  function stopAgent() {
    interruptRequested = true
    if (abortController) abortController.abort()
  }

  function requestInterrupt() {
    interruptRequested = true
    if (abortController) abortController.abort()
  }

  function resetAgent() {
    round.value = 0
    isPaused.value = false
    currentRole.value = 'coder'
  }

  return {
    isAgentRunning,
    isPaused,
    status,
    round,
    currentRole,
    getAgentAvatar,
    runAgentLoop,
    stopAgent,
    requestInterrupt,
    resetAgent
  }
}
