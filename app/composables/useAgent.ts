import type { Message, ToolCall, ToolResult, AISettings } from '../../types'

const MAX_AGENT_ROUNDS = 10

async function reportLog(level: string, source: string, message: string, metadata?: any) {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, source, message, metadata })
    })
  } catch (e) {}
}

// ===== Pure helpers (module-scoped for unit tests) =====

export function parseReviewResult(content: string): { verdict: 'PASS' | 'FAIL' | null; feedback: string } {
  const verdictMatch = content.match(/VERDICT\s*:\s*(PASS|FAIL)/i)
  if (verdictMatch?.[1]) {
    return {
      verdict: verdictMatch[1].toUpperCase() as 'PASS' | 'FAIL',
      feedback: content.replace(/VERDICT\s*:\s*(PASS|FAIL)/i, '').trim()
    }
  }
  return { verdict: null, feedback: content }
}

// Agent 系统提示词
const AGENT_SYSTEM_PROMPT = `你是一个智能着色器开发助手，由两个内部角色协同工作：

## 🧑‍💻 Coder（代码生成者）
职责：根据需求生成或修改 GLSL 着色器代码，可以调用工具获取当前状态

## 🔍 Reviewer（代码审查者）
职责：检查生成的着色器是否满足需求，评估视觉效果，给出 PASS/FAIL 结论

## 可用工具
- capture_screenshot: 捕获当前渲染截图（带 reason 参数）
- get_current_code: 获取当前编辑器完整代码（带 reason 参数）
- get_code_range: 获取代码特定行范围（start_line, end_line, reason）
- modify_code_range: 修改特定行范围的代码（start_line, end_line, new_code, reason）
- insert_code: 在指定行后插入新代码（line_number, new_code, reason）

## 代码修改规则（重要！）
当需要修改现有代码时：
1. 先用 get_current_code 或 get_code_range 查看需要修改的代码
2. 对于小的修改（几行），使用 modify_code_range 工具只修改必要的行
3. 对于新增功能，使用 insert_code 在合适位置插入代码
4. 只有全新着色器或完全重写时才输出完整代码
5. 使用工具修改后，在回复中说明做了哪些修改

## GLSL 规则
- WebGL 1.0 语法，必须包含 u_time 和 u_resolution
- Coder 生成代码后用 \`\`\`glsl 包裹完整代码
- Reviewer 最后必须输出 "VERDICT: PASS" 或 "VERDICT: FAIL"，然后说明原因
- 保持代码可读性

请开始工作。当前角色：Coder`

export function useAgent() {
  const isAgentRunning = ref(false)
  const isPaused = ref(false)
  const status = ref('')
  const round = ref(0)
  const currentRole = ref<'coder' | 'reviewer'>('coder')
  const userQueue = ref<string[]>([])
  let abortController: AbortController | null = null
  let interruptRequested = false

  function getAgentAvatar(role?: string): string {
    if (role === 'coder') return '🧑‍💻'
    if (role === 'reviewer') return '🔍'
    if (role === 'system') return '⚙️'
    return '✨'
  }

  // 流式调用 chat API
  async function* streamChatAPI(
    messages: Message[],
    settings: AISettings,
    options: { enableTools?: boolean; conversationId?: string } = {}
  ) {
    const { enableTools = false, conversationId } = options

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
        enableTools,
        conversationId
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

  // 安全解析 JSON 参数
  function safeParseArgs(argsStr: string | undefined): any {
    if (!argsStr) return {}
    try {
      // 清理可能的特殊字符
      const cleaned = argsStr.trim()
      return JSON.parse(cleaned)
    } catch (e) {
      // 尝试修复常见的 JSON 问题
      try {
        // 移除可能的 Markdown 代码块标记
        const withoutCodeBlock = argsStr.replace(/```[\s\S]*?```/g, '').trim()
        if (withoutCodeBlock) {
          return JSON.parse(withoutCodeBlock)
        }
      } catch (e2) {
        // 忽略
      }
      throw new Error(`参数解析失败: ${e.message}`)
    }
  }

  // 执行工具调用
  async function executeToolCalls(
    toolCalls: ToolCall[],
    callbacks: {
      requestScreenshot: () => Promise<{ text: string; image?: string }>
      requestCode: () => Promise<string>
      requestCodeRange?: (startLine: number, endLine: number) => Promise<string>
      modifyCodeRange?: (startLine: number, endLine: number, newCode: string) => Promise<string>
      insertCode?: (lineNumber: number, newCode: string) => Promise<string>
    }
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const toolCall of toolCalls) {
      const result: ToolResult = { name: toolCall.name, arguments: toolCall.arguments }
      try {
        const args = safeParseArgs(toolCall.arguments)

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
          case 'get_code_range': {
            if (!callbacks.requestCodeRange) {
              result.error = 'get_code_range 工具不可用'
              break
            }
            const { start_line, end_line } = args
            if (!start_line || !end_line) {
              result.error = '缺少 start_line 或 end_line 参数'
              break
            }
            result.result = await callbacks.requestCodeRange(start_line, end_line)
            break
          }
          case 'modify_code_range': {
            if (!callbacks.modifyCodeRange) {
              result.error = 'modify_code_range 工具不可用'
              break
            }
            const { start_line, end_line, new_code } = args
            if (!start_line || !end_line || new_code === undefined) {
              result.error = '缺少 start_line、end_line 或 new_code 参数'
              break
            }
            result.result = await callbacks.modifyCodeRange(start_line, end_line, new_code)
            break
          }
          case 'insert_code': {
            if (!callbacks.insertCode) {
              result.error = 'insert_code 工具不可用'
              break
            }
            const { line_number, new_code } = args
            if (!line_number || new_code === undefined) {
              result.error = '缺少 line_number 或 new_code 参数'
              break
            }
            result.result = await callbacks.insertCode(line_number, new_code)
            break
          }
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
      updateLastMessage: (updater: Partial<Message> | ((msg: Message) => Partial<Message>), messageId?: number) => void
      addSystemMessage: (content: string) => void
      requestScreenshot: () => Promise<{ text: string; image?: string }>
      requestCode: () => Promise<string>
      requestCodeRange?: (startLine: number, endLine: number) => Promise<string>
      modifyCodeRange?: (startLine: number, endLine: number, newCode: string) => Promise<string>
      insertCode?: (lineNumber: number, newCode: string) => Promise<string>
      onShaderCode: (code: string) => void
      onSaveMessages: () => void
      scrollToBottom: () => void
    },
    conversationId?: string,
    isResume: boolean = false
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

    // 只有在首次启动（不是从暂停恢复）时才显示启动消息
    if (!isResume) {
      callbacks.addSystemMessage('🤖 Agent 模式已启动，Coder 开始工作...')
      reportLog('INFO', 'agent', 'Agent 模式已启动')
    } else {
      callbacks.addSystemMessage('🤖 Agent 从暂停状态恢复，继续工作...')
      reportLog('INFO', 'agent', 'Agent 从暂停状态恢复')
    }

    try {
      while (true) {
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
        for await (const chunk of streamChatAPI(coderMessages, settings, { enableTools: true, conversationId })) {
          if (abortController.signal.aborted) throw new Error('AbortError')

          if (chunk.type === 'content') {
            coderContent += chunk.content || ''
            callbacks.updateLastMessage({ content: coderContent }, coderMsgId)
            callbacks.scrollToBottom()
          } else if (chunk.type === 'shader' && chunk.code) {
            shaderCode = chunk.code
            callbacks.updateLastMessage({ shaderCode }, coderMsgId)
            callbacks.onShaderCode(chunk.code)
          } else if (chunk.type === 'tool_calls' && chunk.calls) {
            pendingToolCalls = chunk.calls
          }
        }

        // 完成流式输出
        callbacks.updateLastMessage({ isStreaming: false }, coderMsgId)

        // 检查是否为空内容
        if (!coderContent.trim() && !shaderCode) {
          coderContent = '（Coder 未返回有效内容）'
          callbacks.updateLastMessage({ content: coderContent }, coderMsgId)
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

        for await (const chunk of streamChatAPI(reviewerMessages, settings, { enableTools: false, conversationId })) {
          if (abortController.signal.aborted) throw new Error('AbortError')

          if (chunk.type === 'content') {
            reviewContent += chunk.content || ''
            callbacks.updateLastMessage({ content: reviewContent }, reviewMsgId)
            callbacks.scrollToBottom()
          }
        }

        callbacks.updateLastMessage({ isStreaming: false }, reviewMsgId)

        // 确保内容不为空
        if (!reviewContent.trim()) {
          reviewContent = 'VERDICT: FAIL\n\n审查未返回有效内容，继续迭代。'
          callbacks.updateLastMessage({ content: reviewContent }, reviewMsgId)
        }

        const review = parseReviewResult(reviewContent)

        // 检查审查结果
        if (review.verdict === 'PASS') {
          // 如果审查通过但有用户新消息，需要继续迭代而不是结束
          if (userQueue.value.length > 0) {
            const queuedContents = [...userQueue.value]
            userQueue.value = []
            const combinedContent = queuedContents.join('\n\n')
            workingMemory.push({
              id: Date.now(),
              role: 'user',
              content: `[上一轮审查已通过，但用户有新要求]\n${combinedContent}`,
              timestamp: Date.now()
            })
            callbacks.addSystemMessage(`💬 审查已通过，但收到用户新反馈，继续迭代。`)
            reportLog('INFO', 'agent', '审查通过后纳入用户新消息继续迭代', { count: queuedContents.length })
            continue
          }

          callbacks.addSystemMessage(`✅ 第 ${round.value} 轮审查通过！Agent 迭代完成。`)
          reportLog('INFO', 'agent', `Agent 迭代完成，第 ${round.value} 轮通过`)
          break
        }

        // 未通过，先添加 reviewer 反馈到工作内存
        if (review.feedback) {
          workingMemory.push({
            id: Date.now(),
            role: 'user',
            content: `请根据以下反馈修改代码：\n${review.feedback}`,
            timestamp: Date.now()
          })
        }

        // 检查是否有用户新输入（优先级最高，但需要保留 reviewer 的反馈）
        if (userQueue.value.length > 0) {
          const queuedContents = [...userQueue.value]
          userQueue.value = []
          const combinedContent = queuedContents.join('\n\n')
          workingMemory.push({
            id: Date.now(),
            role: 'user',
            content: `[同时，用户还有以下新反馈]\n${combinedContent}`,
            timestamp: Date.now()
          })
          callbacks.addSystemMessage(`💬 Reviewer 反馈 + 用户新消息，进入下一轮迭代。`)
          reportLog('INFO', 'agent', 'Agent 纳入用户队列消息和Reviewer反馈继续迭代', { count: queuedContents.length })
          continue
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
        reportLog('WARN', 'agent', interruptRequested ? 'Agent 被中断' : 'Agent 已停止')
      } else {
        callbacks.addSystemMessage(`❌ Agent 出错：${error.message || '请检查网络连接'}`)
        reportLog('ERROR', 'agent', error.message || 'Agent 未知错误')
      }
      isPaused.value = false
    } finally {
      isAgentRunning.value = false
      status.value = ''
      abortController = null
      interruptRequested = false
      reportLog('INFO', 'agent', 'Agent 运行结束', { rounds: round.value })
    }
  }

  function stopAgent() {
    reportLog('WARN', 'agent', 'Agent 被手动停止')
    interruptRequested = true
    if (abortController) abortController.abort()
  }

  function requestInterrupt() {
    reportLog('WARN', 'agent', 'Agent 被中断')
    interruptRequested = true
    if (abortController) abortController.abort()
  }

  function queueMessage(content: string) {
    userQueue.value.push(content)
    reportLog('INFO', 'agent', '用户消息已加入队列', { queueLength: userQueue.value.length })
  }

  function resetAgent() {
    round.value = 0
    isPaused.value = false
    currentRole.value = 'coder'
    userQueue.value = []
  }

  return {
    isAgentRunning,
    isPaused,
    status,
    round,
    currentRole,
    userQueue,
    getAgentAvatar,
    runAgentLoop,
    stopAgent,
    requestInterrupt,
    queueMessage,
    resetAgent
  }
}
