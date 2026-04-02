import type { Message, ChatRequestBody, AISettings, ToolCall, ToolResult } from '~/types'

export function useChat(conversationId?: Ref<string | null>) {
  const { updateMessages, currentMessages, currentId } = useConversations()

  const messages = ref<Message[]>([])
  const input = ref('')
  const isStreaming = ref(false)
  const streamingReasoning = ref('')
  const abortController = ref<AbortController | null>(null)
  const autoScroll = ref(true)
  let userScrollTimeout: NodeJS.Timeout | null = null

  // 待发送的内容
  const pendingImage = ref<{ dataUrl: string; blob: Blob; timestamp: number } | null>(null)
  const pendingCode = ref('')

  // 同步当前对话的消息
  watch(() => conversationId?.value || currentId.value, (newId) => {
    if (newId) {
      messages.value = currentMessages.value
    }
  }, { immediate: true })

  // 快捷操作
  const quickActions = [
    { icon: '🌈', text: '彩虹波浪效果' },
    { icon: '🔥', text: '火焰动画' },
    { icon: '⭐', text: '星空夜景' },
    { icon: '🌊', text: '水波纹' },
    { icon: '💡', text: '熔岩灯' },
    { icon: '🌃', text: '霓虹网格' }
  ]

  // 动态建议
  const suggestions = computed(() => {
    if (messages.value.length === 0) return []
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg.role !== 'assistant') return []
    return ['调整颜色', '变慢一点', '加些细节', '解释代码']
  })

  const placeholderText = computed(() => {
    if (messages.value.length === 0) {
      return '描述你想要的着色器效果，或直接问我问题...'
    }
    return '继续对话...'
  })

  // 添加消息
  function addMessage(role: Message['role'], content: string, extra: Partial<Message> = {}): Message {
    const msg: Message = {
      id: Date.now() + Math.random(),
      role,
      content,
      timestamp: Date.now(),
      showReasoning: false,
      isStreaming: false,
      ...extra
    }
    messages.value.push(msg)
    return msg
  }

  // 更新最后一条消息
  function updateLastMessage(updater: Partial<Message> | ((msg: Message) => Partial<Message>)) {
    const last = messages.value[messages.value.length - 1]
    if (last) {
      Object.assign(last, typeof updater === 'function' ? updater(last) : updater)
    }
    return last
  }

  // 加载历史消息（从当前对话）
  function loadMessages() {
    const msgs = currentMessages.value || []
    messages.value = msgs.map((m: Message) => ({ ...m, isStreaming: false }))
  }

  // 保存消息到当前对话
  function saveMessages() {
    const activeId = conversationId?.value || currentId.value
    if (activeId) {
      updateMessages(activeId, messages.value)
    }
  }

  // 清空当前对话
  function clearChat() {
    if (confirm('确定要清空当前对话吗？')) {
      messages.value = []
      pendingImage.value = null
      pendingCode.value = ''
      saveMessages()
      return true
    }
    return false
  }

  // 重新生成
  async function regenerate(msg: Message, callback: () => Promise<void>) {
    const msgIndex = messages.value.findIndex(m => m.id === msg.id)
    if (msgIndex <= 0) return

    messages.value = messages.value.slice(0, msgIndex)
    saveMessages()
    await callback()
  }

  // 复制消息
  async function copyMessage(msg: Message) {
    try {
      await navigator.clipboard.writeText(msg.content)
      return true
    } catch (e) {
      return false
    }
  }

  // 处理滚动
  function onMessagesScroll(e: Event) {
    const el = e.target as HTMLElement
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50

    if (userScrollTimeout) clearTimeout(userScrollTimeout)

    if (!isAtBottom) {
      autoScroll.value = false
      userScrollTimeout = setTimeout(() => {
        autoScroll.value = true
      }, 3000)
    } else {
      autoScroll.value = true
    }
  }

  // 解析工具调用
  function parseToolCalls(message: Message): ToolCall[] {
    if (message.toolCalls && Array.isArray(message.toolCalls)) {
      return message.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name || tc.function?.name || '',
        arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.function?.arguments || '{}'
      }))
    }
    return []
  }

  // 格式化工具执行结果
  function formatToolResults(results: ToolResult[]): string {
    if (results.length === 0) return ''

    let formatted = '\n\n[工具执行结果]\n'

    for (const result of results) {
      formatted += `\n工具: ${result.name}\n`
      if (result.error) {
        formatted += `错误: ${result.error}\n`
      } else if (result.result) {
        const resultText = typeof result.result === 'string' ? result.result : (result.result.text || JSON.stringify(result.result))
        formatted += `结果: ${resultText}\n`
      }
    }

    return formatted
  }

  // 开始流式请求
  async function startStreaming(
    settings: AISettings,
    callbacks: {
      onShaderCode: (code: string) => void
      onToolCalls: (calls: ToolCall[]) => Promise<ToolResult[]>
      onError: (error: Error) => void
      scrollToBottom: () => void
    }
  ) {
    isStreaming.value = true
    streamingReasoning.value = ''
    abortController.value = new AbortController()

    const assistantMsg = addMessage('assistant', '', { isStreaming: true })
    callbacks.scrollToBottom()

    try {
      const history = messages.value
        .filter(m => !m.isStreaming)
        .map(m => {
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
          stream: true
        } as ChatRequestBody),
        signal: abortController.value.signal
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let fullReasoning = ''
      let shaderCode: string | null = null

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

            if (parsed.type === 'reasoning') {
              fullReasoning += parsed.content
              streamingReasoning.value = fullReasoning
              callbacks.scrollToBottom()
            } else if (parsed.type === 'reasoning_end') {
              streamingReasoning.value = ''
              updateLastMessage({ reasoning: fullReasoning })
            } else if (parsed.type === 'content') {
              fullContent += parsed.content
              updateLastMessage({ content: fullContent })
              callbacks.scrollToBottom()
            } else if (parsed.type === 'shader') {
              shaderCode = parsed.code
              updateLastMessage({ shaderCode })
            } else if (parsed.type === 'tool_calls') {
              updateLastMessage({
                content: fullContent + '\n\n[正在执行工具...]',
                isStreaming: false,
                toolCalls: parsed.calls
              })

              const toolResults = await callbacks.onToolCalls(parsed.calls)
              const screenshotResult = toolResults.find(r => r.name === 'capture_screenshot' && r.image)

              updateLastMessage({
                content: fullContent + '\n\n[工具已执行]',
                reasoning: fullReasoning,
                shaderCode,
                toolResults: toolResults,
                image: screenshotResult?.image
              })

              addMessage('system', formatToolResults(toolResults))

              // 继续流式输出
              await continueStreamingWithToolResults(settings, callbacks)
              return
            }
          } catch (e) {}
        }
      }

      // 检查是否有工具调用（备选）
      const lastMsg = messages.value[messages.value.length - 1]
      const toolCalls = parseToolCalls(lastMsg)

      if (toolCalls.length > 0 && !lastMsg.toolResultsProcessed) {
        lastMsg.toolResultsProcessed = true

        updateLastMessage({
          content: fullContent + '\n\n[正在执行工具...]',
          isStreaming: false
        })

        const toolResults = await callbacks.onToolCalls(toolCalls)
        const screenshotResult = toolResults.find(r => r.name === 'capture_screenshot' && r.image)

        updateLastMessage({
          content: fullContent + '\n\n[工具已执行]',
          reasoning: fullReasoning,
          shaderCode,
          image: screenshotResult?.image
        })

        addMessage('system', formatToolResults(toolResults))
        await continueStreamingWithToolResults(settings, callbacks)
        return
      }

      // 正常完成
      updateLastMessage({
        isStreaming: false,
        content: fullContent,
        reasoning: fullReasoning || undefined,
        shaderCode
      })

      if (shaderCode) {
        callbacks.onShaderCode(shaderCode)
      }

      saveMessages()

    } catch (error: any) {
      if (error.name === 'AbortError') {
        updateLastMessage({ content: '(已停止生成)', isStreaming: false })
      } else {
        updateLastMessage({
          content: `❌ 出错了: ${error.message || '请检查网络连接和API设置'}`,
          isStreaming: false
        })
        callbacks.onError(error)
      }
      saveMessages()
    } finally {
      isStreaming.value = false
      streamingReasoning.value = ''
      abortController.value = null
    }
  }

  // 工具执行后再次流式请求
  async function continueStreamingWithToolResults(
    settings: AISettings,
    callbacks: {
      onShaderCode: (code: string) => void
      scrollToBottom: () => void
    }
  ) {
    isStreaming.value = true
    streamingReasoning.value = ''

    try {
      const history = messages.value
        .filter(m => !m.isStreaming)
        .map(m => {
          const msg: { role: string; content: string; image?: string } = { role: m.role, content: m.content || '' }
          if (m.image) msg.image = m.image
          return msg
        })

      const assistantMsg = addMessage('assistant', '', { isStreaming: true })
      callbacks.scrollToBottom()

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          settings: settings.provider === 'builtin' ? null : { ...settings },
          stream: true
        } as ChatRequestBody)
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let fullReasoning = ''
      let shaderCode: string | null = null

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

            if (parsed.type === 'reasoning') {
              fullReasoning += parsed.content
              streamingReasoning.value = fullReasoning
              callbacks.scrollToBottom()
            } else if (parsed.type === 'reasoning_end') {
              streamingReasoning.value = ''
              updateLastMessage({ reasoning: fullReasoning })
            } else if (parsed.type === 'content') {
              fullContent += parsed.content
              updateLastMessage({ content: fullContent })
              callbacks.scrollToBottom()
            } else if (parsed.type === 'shader') {
              shaderCode = parsed.code
              updateLastMessage({ shaderCode })
            }
          } catch (e) {}
        }
      }

      updateLastMessage({
        isStreaming: false,
        content: fullContent,
        reasoning: fullReasoning || undefined,
        shaderCode
      })

      if (shaderCode) {
        callbacks.onShaderCode(shaderCode)
      }

      saveMessages()

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        updateLastMessage({
          content: `[工具执行后续失败: ${error.message}]`,
          isStreaming: false
        })
        saveMessages()
      }
    } finally {
      isStreaming.value = false
      streamingReasoning.value = ''
    }
  }

  // 停止生成
  function stopStreaming() {
    if (abortController.value) {
      abortController.value.abort()
    }
  }

  return {
    messages,
    input,
    isStreaming,
    streamingReasoning,
    autoScroll,
    pendingImage,
    pendingCode,
    quickActions,
    suggestions,
    placeholderText,
    addMessage,
    updateLastMessage,
    loadMessages,
    saveMessages,
    clearChat,
    regenerate,
    copyMessage,
    onMessagesScroll,
    startStreaming,
    stopStreaming,
    formatToolResults
  }
}
