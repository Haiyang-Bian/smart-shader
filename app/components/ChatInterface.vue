<template>
  <div class="chat">
    <!-- 头部 -->
    <header class="chat-header">
      <div class="header-left">
        <span class="logo">✨</span>
        <div class="title-group">
          <h1>Smart Shader</h1>
          <span v-if="currentModel" class="model-badge" :class="{ 'builtin': settings.provider === 'builtin' }" @click="settings.provider === 'builtin' ? showSettings = true : undefined">
            {{ currentModel }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button class="conversations-btn" @click="showConversations = true">
          <span>💬</span>
          <span>{{ currentConversation?.title || '对话' }}</span>
        </button>
        <button
          class="agent-toggle"
          :class="{ active: agentModeEnabled }"
          title="智能体模式：AI自动写代码、验证、改错"
          @click="agentModeEnabled = !agentModeEnabled"
        >
          <span>{{ agentModeEnabled ? '🤖' : '👤' }}</span>
          <span>{{ agentModeEnabled ? 'Agent' : '对话' }}</span>
        </button>
        <button v-if="messages.length > 1" class="action-btn" title="清空对话" @click="clearChat">
          <span>🗑️</span>
        </button>
        <button class="settings-btn" @click="showSettings = true">
          <span>⚙️</span>
          <span>设置</span>
        </button>
      </div>
    </header>

    <!-- 消息列表 -->
    <div ref="messagesEl" class="messages custom-scrollbar" @scroll="onMessagesScroll">
      <!-- 滚动到底部按钮 -->
      <button
        v-if="!autoScroll && messages.length > 0"
        class="scroll-to-bottom-btn"
        @click="autoScroll = true; scrollToBottom()"
      >
        ↓ 滚动到底部
      </button>
      <!-- 欢迎消息 -->
      <div v-if="messages.length === 0" class="welcome-area">
        <div class="welcome-card">
          <div class="welcome-icon">🎨</div>
          <h2>你好！我是你的着色器助手</h2>
          <p>我可以帮你创建各种炫酷的 GLSL 着色器效果</p>
          <div v-if="settings.provider === 'builtin'" class="mode-notice">
            <p>💡 当前使用<strong>内置模板模式</strong>，建议切换到 Kimi API 获得更好体验</p>
            <button @click="showSettings = true">⚙️ 点此配置 API</button>
          </div>
          <div class="quick-actions">
            <button v-for="action in quickActions" :key="action.text" @click="sendQuick(action.text)">
              <span>{{ action.icon }}</span>
              {{ action.text }}
            </button>
          </div>
        </div>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="(msg, i) in messages"
          :key="msg.id || i"
          class="message-wrapper"
          :class="[msg.role, msg.agentMeta?.role]"
        >
          <div class="message">
            <div class="avatar" :class="[msg.role, msg.agentMeta?.role]">
              {{ msg.role === 'user' ? '👤' : getAgentAvatar(msg.agentMeta?.role) }}
            </div>
            <div class="message-content">
              <!-- Agent 角色徽章 -->
              <div
v-if="msg.agentMeta?.role && msg.agentMeta.role !== 'system'"
                   class="agent-role-badge"
                   :class="msg.agentMeta.role">
                {{ msg.agentMeta.role === 'coder' ? 'Coder' : 'Reviewer' }} · 第 {{ msg.agentMeta.round }} 轮
              </div>
              <!-- 思考过程（可折叠） -->
              <div v-if="msg.reasoning" class="reasoning-block">
                <button class="reasoning-toggle" @click="msg.showReasoning = !msg.showReasoning">
                  <span>{{ msg.showReasoning ? '▼' : '▶' }}</span>
                  <span>思考过程</span>
                </button>
                <div v-show="msg.showReasoning" class="reasoning-content">
                  <pre>{{ msg.reasoning }}</pre>
                </div>
              </div>

              <!-- 消息内容 -->
              <div class="bubble" :class="{ 'streaming': msg.isStreaming }">
                <div v-if="msg.isStreaming && !msg.content" class="typing-indicator">
                  <span/><span/><span/>
                </div>
                <div v-else>
                  <!-- 图片 -->
                  <div v-if="msg.image" class="message-image">
                    <img :src="msg.image" alt="渲染效果" >
                  </div>
                  <!-- 文本 -->
                  <div v-if="msg.content" class="message-text" v-html="formatMessageSafe(msg.content)"/>
                </div>

                <!-- 着色器标签 -->
                <div v-if="msg.shaderCode" class="shader-preview-tag">
                  <span>🎨</span>
                  <span>已生成着色器</span>
                </div>

                <!-- 应用代码按钮 -->
                <div v-if="msg.shaderCode && !msg.isStreaming" class="apply-code-block">
                  <button class="apply-code-btn" @click="applyShader(msg.shaderCode)">
                    <span>▶️</span>
                    <span>应用代码到编辑器</span>
                  </button>
                </div>
              </div>

              <!-- 消息操作 -->
              <div v-if="msg.role === 'assistant' && !msg.isStreaming" class="message-actions">
                <button @click="regenerate(msg)">🔄 重新生成</button>
                <button @click="copyMessage(msg)">📋 复制</button>
                <button v-if="msg.shaderCode" @click="handleShare(msg)">🔗 分享</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 流式输出中的思考过程 -->
      <div v-if="streamingReasoning" class="message-wrapper assistant streaming-reasoning">
        <div class="message">
          <div class="avatar assistant">✨</div>
          <div class="message-content">
            <div class="reasoning-block active">
              <div class="reasoning-header">
                <span>🔮</span>
                <span>正在思考...</span>
              </div>
              <div class="reasoning-content">
                <pre>{{ streamingReasoning }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref="bottomEl"/>
    </div>

    <!-- 输入区 -->
    <div class="input-area">
      <!-- Agent 状态条 -->
      <div v-if="agentStatus || isAgentRunning" class="agent-status-bar">
        <span class="agent-status-icon">🤖</span>
        <span class="agent-status-text">{{ agentStatus || (isAgentRunning ? 'Agent 运行中...' : 'Agent 等待中') }}</span>
        <span v-if="agentRound > 0" class="agent-round-badge">第 {{ agentRound }} 轮</span>
        <span v-if="currentRole" class="agent-role-badge">{{ currentRole === 'coder' ? 'Coder' : 'Reviewer' }}</span>
        <span v-if="userQueue.length > 0" class="agent-queue-badge">{{ userQueue.length }} 条待处理</span>
      </div>
      <!-- 待发送图片预览 -->
      <div v-if="pendingImage" class="pending-image">
        <div class="image-preview">
          <img :src="pendingImage.dataUrl" alt="截图" >
          <button class="remove-image" title="移除图片" @click="removePendingImage">✕</button>
        </div>
        <span class="image-hint">📷 截图将随消息一起发送给AI</span>
      </div>

      <!-- 待发送代码预览 -->
      <div v-if="pendingCode" class="pending-code">
        <div class="code-preview-header">
          <span>📝 代码已附加</span>
          <button class="remove-code" title="移除代码" @click="removePendingCode">✕</button>
        </div>
        <pre class="code-preview">{{ pendingCode.slice(0, 200) }}{{ pendingCode.length > 200 ? '...' : '' }}</pre>
      </div>

      <!-- 快捷提示 -->
      <div v-if="suggestions.length > 0 && !pendingImage && !pendingCode" class="suggestions custom-scrollbar-x">
        <button
          v-for="s in suggestions"
          :key="s"
          @click="input = s; send()"
        >
          {{ s }}
        </button>
      </div>

      <!-- 输入框 -->
      <div class="input-row">
        <textarea
          ref="inputEl"
          v-model="input"
          :placeholder="pendingImage ? '描述你对这个效果的想法，比如【颜色太亮了，想要暗一点】...' : placeholderText"
          :disabled="isStreaming && !isAgentRunning"
          rows="1"
          class="custom-scrollbar"
          @keydown.enter.prevent="handleEnter"
        />
        <button
          class="send-btn"
          :disabled="(!input.trim() && !pendingImage) || (isStreaming && !isAgentRunning)"
          @click="send"
        >
          <span v-if="isStreaming || isAgentRunning" class="stop-icon" @click.stop="handleStop">⏹</span>
          <span v-else>➤</span>
        </button>
      </div>

      <!-- 输入提示 -->
      <div class="input-hint">
        <span v-if="isStreaming && !isAgentRunning">正在生成...</span>
        <span v-else-if="isAgentRunning">Agent 运行中，发送消息可介入下一轮迭代</span>
        <span v-else-if="agentPaused">Agent 已暂停，发送消息可继续迭代</span>
        <span v-else-if="pendingImage">图片已附加，描述你的反馈后发送</span>
        <span v-else-if="pendingCode">代码已附加，描述你想要的修改后发送</span>
        <span v-else-if="messages.length > 0">按 Enter 发送，Shift+Enter 换行 | 粘贴图片直接上传</span>
        <span v-else>描述你想要的视觉效果 | 粘贴图片直接上传</span>
      </div>

      <!-- 上传和快捷操作栏 -->
      <div class="input-actions-bar">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleFileUpload"
        >
        <button class="upload-btn" :disabled="isStreaming || !!pendingImage" @click="$refs.fileInput.click()">
          <span>📷</span>
          <span>上传图片</span>
        </button>
      </div>
    </div>

    <!-- 设置弹窗 -->
    <SettingsModal
      v-if="showSettings"
      v-model="showSettings"
    />

    <!-- 对话列表侧边栏 -->
    <Teleport to="body">
      <Transition name="slide-left">
        <div v-if="showConversations" class="conversations-overlay" @click.self="showConversations = false">
          <div class="conversations-panel">
            <div class="conversations-panel-header">
              <h3>💬 对话列表</h3>
              <button class="close-btn" @click="showConversations = false">✕</button>
            </div>
            <ConversationList
              :conversations="conversations"
              :current-id="currentId"
              :sorted-conversations="sortedConversations"
              @create="createAndClose"
              @switch="switchAndClose"
              @delete="deleteConversation"
              @update-title="updateTitle"
              @clear-all="clearAllAndClose"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
const emit = defineEmits(['shader-generated', 'request-screenshot', 'request-code', 'request-compile-status', 'request-code-range', 'modify-code-range', 'insert-code'])

// ============ 使用 Composables ============
const {
  conversations,
  currentId,
  currentConversation,
  sortedConversations,
  loadConversations,
  createConversation,
  switchConversation,
  deleteConversation,
  updateTitle,
  clearAllConversations
} = useConversations()

const {
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
  shareShader,
  onMessagesScroll,
  startStreaming,
  stopStreaming,
  formatToolResults
} = useChat(currentId)

const {
  settings,
  showSettings,
  currentProvider,
  currentModel: settingsModel,
  loadSettings
} = useSettings()

const {
  isAgentRunning,
  isPaused: agentPaused,
  status: agentStatus,
  round: agentRound,
  currentRole,
  userQueue,
  getAgentAvatar,
  runAgentLoop,
  stopAgent,
  requestInterrupt,
  queueMessage,
  resetAgent
} = useAgent()

const { formatMessage: formatMessageSafe } = useSafeHtml()
const toast = useCustomToast()

// ============ 局部状态 ============
const messagesEl = ref(null)
const bottomEl = ref(null)
const inputEl = ref(null)
const fileInput = ref(null)
const agentModeEnabled = ref(false)
const showConversations = ref(false)

const currentModel = computed(() => {
  if (settings.provider === 'builtin') return '内置助手'
  return settings.model
})

// ============ 对话列表方法 ============
function createAndClose() {
  createConversation()
  loadMessages()
  showConversations.value = false
}

function switchAndClose(id) {
  switchConversation(id)
  loadMessages()
  showConversations.value = false
}

async function clearAllAndClose() {
  if (await clearAllConversations()) {
    loadMessages()
    showConversations.value = false
  }
}

async function handleShare(msg) {
  const result = await shareShader(msg)
  if (result?.url) {
    toast.success(`已复制分享链接：${result.url}`)
  } else {
    toast.error('分享失败，请稍后再试')
  }
}

// ============ 生命周期 ============
onMounted(() => {
  loadConversations()
  loadSettings()
  loadMessages()
  adjustTextareaHeight()
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
})

// ============ 图片相关 ============
function addScreenshot(imageData) {
  pendingImage.value = imageData
  nextTick(() => {
    inputEl.value?.focus()
  })
}

function removePendingImage() {
  pendingImage.value = null
}

function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast.error('请上传图片文件')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    pendingImage.value = {
      dataUrl: e.target.result,
      blob: file,
      timestamp: Date.now()
    }
    nextTick(() => {
      inputEl.value?.focus()
    })
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

function handlePaste(event) {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue

      const reader = new FileReader()
      reader.onload = (e) => {
        pendingImage.value = {
          dataUrl: e.target.result,
          blob,
          timestamp: Date.now()
        }
        nextTick(() => {
          inputEl.value?.focus()
        })
      }
      reader.readAsDataURL(blob)
      break
    }
  }
}

function removePendingCode() {
  pendingCode.value = ''
}

function addCodeBlock(code) {
  const codePreview = code.length > 100 ? code.slice(0, 100) + '...' : code
  const codeBlock = `[code]\n${codePreview}\n[/code]`

  if (input.value) {
    input.value += '\n\n' + codeBlock
  } else {
    input.value = '这是当前的代码，请帮我优化：\n\n' + codeBlock
  }

  pendingCode.value = code

  nextTick(() => {
    inputEl.value?.focus()
    adjustTextareaHeight()
  })
}

// ============ 停止生成/Agent ============
function handleStop() {
  if (isAgentRunning.value) {
    stopAgent()
  } else if (isStreaming.value) {
    stopStreaming()
  }
}

// ============ 发送消息 ============
function handleEnter(e) {
  if (e.shiftKey) return
  send()
}

function sendQuick(text) {
  input.value = text
  send()
}

async function send() {
  const text = input.value.trim()
  if (!text && !pendingImage.value && !pendingCode.value) return
  if (isStreaming.value && !isAgentRunning.value) return

  if (settings.provider !== 'builtin' && !settings.token.trim()) {
    addMessage('assistant', '⚠️ 请先点击右上角 ⚙️ 设置，配置你的 API Token')
    showSettings.value = true
    return
  }

  // 构建消息内容
  let messageContent = text

  if (pendingCode.value) {
    if (messageContent) {
      messageContent += '\n\n```glsl\n' + pendingCode.value + '\n```'
    } else {
      messageContent = '请帮我优化以下代码：\n\n```glsl\n' + pendingCode.value + '\n```'
    }
  }

  // 清空输入
  input.value = ''
  pendingCode.value = ''
  adjustTextareaHeight()

  // Agent Mode 逻辑
  if (agentModeEnabled.value) {
    const agentCallbacks = {
      addMessage,
      updateLastMessage,
      addSystemMessage: (content) => addMessage('system', content),
      requestScreenshot,
      requestCode,
      requestCodeRange,
      modifyCodeRange,
      insertCode,
      onShaderCode: (code) => emit('shader-generated', code),
      onSaveMessages: saveMessages,
      scrollToBottom
    }

    // 如果 Agent 正在运行，将消息加入队列，不阻塞用户输入
    if (isAgentRunning.value) {
      addMessage('user', messageContent)
      saveMessages()
      queueMessage(messageContent)
      return
    }

    if (agentPaused.value) {
      addMessage('user', messageContent)
      saveMessages()
      await runAgentLoop(messageContent, messages.value, settings, agentCallbacks, currentId.value, true)
      return
    }

    // 新启动 Agent
    addMessage('user', messageContent)
    saveMessages()
    await runAgentLoop(messageContent, messages.value, settings, agentCallbacks, currentId.value, false)
  } else {
    // 普通模式
    addMessage('user', messageContent, {
      image: pendingImage.value?.dataUrl,
      code: pendingCode.value || undefined
    })
    pendingImage.value = null
    saveMessages()
    await startStreaming(settings, {
      onShaderCode: (code) => emit('shader-generated', code),
      onToolCalls: executeToolCalls,
      onError: (error) => console.error('Stream error:', error),
      scrollToBottom
    })
  }
}

// ============ 工具调用 ============
async function requestScreenshot() {
  return new Promise((resolve) => {
    emit('request-screenshot', {
      callback: (imageData) => {
        resolve(imageData ? { text: '[截图已捕获]', image: imageData } : { text: '[截图失败]' })
      }
    })
  })
}

async function requestCode() {
  return new Promise((resolve) => {
    emit('request-code', {
      callback: (code) => {
        resolve(code || '[未能获取代码]')
      }
    })
  })
}

async function requestCodeRange(startLine, endLine) {
  return new Promise((resolve) => {
    emit('request-code-range', {
      startLine,
      endLine,
      callback: (code) => {
        resolve(code || `[无法获取第 ${startLine} 到 ${endLine} 行的代码]`)
      }
    })
  })
}

async function modifyCodeRange(startLine, endLine, newCode) {
  return new Promise((resolve) => {
    emit('modify-code-range', {
      startLine,
      endLine,
      newCode,
      callback: (fullCode) => {
        resolve(`[已修改第 ${startLine} 到 ${endLine} 行，当前代码共 ${fullCode.split('\n').length} 行]`)
      }
    })
  })
}

async function insertCode(lineNumber, newCode) {
  return new Promise((resolve) => {
    emit('insert-code', {
      lineNumber,
      newCode,
      callback: (fullCode) => {
        resolve(`[已在第 ${lineNumber} 行后插入代码，当前代码共 ${fullCode.split('\n').length} 行]`)
      }
    })
  })
}

// 安全解析 JSON 参数
function safeParseArgs(argsStr) {
  if (!argsStr) return {}
  try {
    const cleaned = argsStr.trim()
    return JSON.parse(cleaned)
  } catch (e) {
    try {
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

async function requestCompileStatus() {
  return new Promise((resolve) => {
    emit('request-compile-status', {
      callback: (status) => {
        resolve(status || { success: false, error: '未知错误' })
      }
    })
  })
}

async function executeToolCalls(toolCalls) {
  const results = []

  for (const toolCall of toolCalls) {
    const result = { name: toolCall.name, arguments: toolCall.arguments }

    try {
      const args = safeParseArgs(toolCall.arguments)

      switch (toolCall.name) {
        case 'capture_screenshot': {
          const screenshotResult = await requestScreenshot()
          result.result = screenshotResult.text
          result.image = screenshotResult.image
          break
        }
        case 'get_current_code':
          result.result = await requestCode()
          break
        case 'get_code_range': {
          const { start_line, end_line } = args
          if (!start_line || !end_line) {
            result.error = '缺少 start_line 或 end_line 参数'
          } else {
            result.result = await requestCodeRange(start_line, end_line)
          }
          break
        }
        case 'modify_code_range': {
          const { start_line, end_line, new_code } = args
          if (!start_line || !end_line || new_code === undefined) {
            result.error = '缺少 start_line、end_line 或 new_code 参数'
          } else {
            result.result = await modifyCodeRange(start_line, end_line, new_code)
          }
          break
        }
        case 'insert_code': {
          const { line_number, new_code } = args
          if (!line_number || new_code === undefined) {
            result.error = '缺少 line_number 或 new_code 参数'
          } else {
            result.result = await insertCode(line_number, new_code)
          }
          break
        }
        default:
          result.error = `未知工具: ${toolCall.name}`
      }
    } catch (error) {
      result.error = error.message
    }

    results.push(result)
  }

  return results
}

// ============ 工具函数 ============
function scrollToBottom() {
  nextTick(() => {
    if (autoScroll.value && bottomEl.value) {
      bottomEl.value.scrollIntoView({ behavior: 'smooth' })
    }
  })
}

function adjustTextareaHeight() {
  nextTick(() => {
    const el = inputEl.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  })
}

watch(input, adjustTextareaHeight)

watch(showSettings, (val) => {
  if (!val) {
    loadSettings()
  }
})

function applyShader(code) {
  emit('shader-generated', code)
}

// ============ 暴露方法 ============
defineExpose({
  addScreenshot,
  addCodeBlock
})
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-base);
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-bg-elevated-2);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 24px;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

h1 {
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(90deg, var(--color-accent), #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}

.model-badge {
  font-size: 11px;
  color: #606070;
}

.model-badge.builtin {
  color: #f59e0b;
  cursor: pointer;
}

.model-badge.builtin::after {
  content: ' (点击切换API)';
  opacity: 0.7;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn, .settings-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-elevated-2);
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover, .settings-btn:hover {
  background: #353550;
  color: #fff;
}

/* 消息区域 */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  position: relative;
}

/* 滚动到底部按钮 */
.scroll-to-bottom-btn {
  position: fixed;
  bottom: 100px;
  right: 30px;
  padding: 10px 16px;
  background: var(--color-accent);
  border: none;
  border-radius: 20px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  transition: all 0.2s;
}

.scroll-to-bottom-btn:hover {
  background: #7c3aed;
  transform: translateY(-2px);
}

/* 欢迎区域 */
.welcome-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.welcome-card {
  text-align: center;
  max-width: 400px;
  padding: 40px 30px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1));
  border-radius: 20px;
  border: 1px solid var(--color-bg-elevated-2);
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.welcome-card h2 {
  font-size: 22px;
  margin: 0 0 12px;
  color: #fff;
}

.welcome-card p {
  color: #808090;
  margin: 0 0 24px;
  font-size: 14px;
}

.mode-notice {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.mode-notice p {
  margin: 0 0 12px;
  color: #fbbf24;
  font-size: 13px;
}

.mode-notice button {
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--color-accent), #ec4899);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.mode-notice button:hover {
  opacity: 0.9;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.quick-actions button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--color-bg-extra);
  border: 1px solid #353550;
  border-radius: 20px;
  color: #e0e0f0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-actions button:hover {
  background: var(--color-bg-elevated-2);
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

/* 消息 */
.message-wrapper {
  margin-bottom: 20px;
}

.message {
  display: flex;
  gap: 12px;
  max-width: 90%;
}

.message-wrapper.user {
  display: flex;
  justify-content: flex-end;
}

.message-wrapper.user .message {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--color-bg-elevated-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.avatar.assistant {
  background: linear-gradient(135deg, var(--color-accent), #ec4899);
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100% - 44px);
}

.bubble {
  background: var(--color-bg-extra);
  padding: 14px 18px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  line-height: 1.7;
  font-size: 14px;
  color: #e0e0f0;
  word-break: break-word;
}

.message-wrapper.user .bubble {
  background: linear-gradient(135deg, var(--color-accent), #7c3aed);
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 4px;
  color: #fff;
}

.bubble.streaming {
  opacity: 0.9;
}

/* 消息中的图片 */
.message-image {
  margin-bottom: 12px;
}

.message-image img {
  max-width: 280px;
  max-height: 200px;
  border-radius: 8px;
  border: 1px solid #353550;
}

.message-text :deep(pre) {
  background: var(--color-bg-base);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 10px 0;
}

.message-text :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.message-text :deep(pre code) {
  color: #a5b3ce;
}

/* 思考过程 */
.reasoning-block {
  background: #0f0f17;
  border: 1px solid var(--color-bg-elevated-2);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}

.reasoning-block.active {
  border-color: var(--color-accent);
  background: rgba(139, 92, 246, 0.05);
}

.reasoning-toggle, .reasoning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #808090;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
}

.reasoning-content {
  padding: 0 14px 12px;
}

.reasoning-content pre {
  margin: 0;
  font-size: 12px;
  color: #606070;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.streaming-reasoning {
  opacity: 0.8;
}

/* 着色器标签 */
.shader-preview-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 10px;
  font-size: 13px;
  color: #22d3ee;
}

/* 应用代码按钮 */
.apply-code-block {
  margin-top: 12px;
}

.apply-code-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--color-accent), #ec4899);
  border: none;
  border-radius: 10px;
  font-size: 13px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}

.apply-code-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 消息操作 */
.message-actions {
  display: flex;
  gap: 12px;
  padding: 0 4px;
}

.message-actions button {
  font-size: 12px;
  color: #606070;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.message-actions button:hover {
  color: #a0a0b0;
}

/* 输入区域 */
.input-area {
  padding: 16px 20px;
  background: var(--color-bg-elevated);
  border-top: 1px solid var(--color-bg-elevated-2);
  flex-shrink: 0;
}

/* 待发送图片 */
.pending-image {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px dashed var(--color-accent);
  border-radius: 12px;
}

.image-preview {
  position: relative;
  display: inline-block;
}

.image-preview img {
  max-height: 100px;
  max-width: 200px;
  border-radius: 8px;
  border: 1px solid #353550;
}

.remove-image {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  background: #ef4444;
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-hint {
  font-size: 12px;
  color: var(--color-accent);
}

/* 待发送代码 */
.pending-code {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(78, 201, 176, 0.1);
  border: 1px dashed #4EC9B0;
  border-radius: 12px;
}

.code-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #4EC9B0;
}

.remove-code {
  width: 20px;
  height: 20px;
  background: #ef4444;
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.code-preview {
  margin: 0;
  padding: 10px;
  background: var(--color-bg-base);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  color: #a0a0b0;
  max-height: 100px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 快捷提示 */
.suggestions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.suggestions button {
  padding: 6px 12px;
  background: var(--color-bg-extra);
  border: 1px solid #353550;
  border-radius: 16px;
  color: #a0a0b0;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.suggestions button:hover {
  background: var(--color-bg-elevated-2);
  color: #fff;
  border-color: var(--color-accent);
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.input-row textarea {
  flex: 1;
  padding: 12px 16px;
  background: var(--color-bg-extra);
  border: 1px solid #353550;
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  min-height: 44px;
  max-height: 150px;
  line-height: 1.5;
}

.input-row textarea:focus {
  border-color: var(--color-accent);
}

.input-row textarea::placeholder {
  color: #505060;
}

.send-btn {
  width: 44px;
  height: 44px;
  background: var(--color-accent);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #7c3aed;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-icon {
  font-size: 14px;
}

.input-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #505060;
  text-align: center;
}

/* 输入操作栏 */
.input-actions-bar {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-bg-elevated-2);
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-bg-extra);
  border: 1px solid #353550;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover:not(:disabled) {
  background: var(--color-bg-elevated-2);
  border-color: var(--color-accent);
  color: #fff;
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 打字动画 */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #808090;
  border-radius: 50%;
  animation: typing 1.4s ease-in-out infinite;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* Agent Mode Toggle */
.agent-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-elevated-2);
  border: 1px solid #353550;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.agent-toggle:hover {
  background: #353550;
  color: #fff;
}

.agent-toggle.active {
  background: linear-gradient(135deg, var(--color-accent), #ec4899);
  border-color: transparent;
  color: white;
}

/* Agent Status Bar */
.agent-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px dashed var(--color-accent);
  border-radius: 10px;
  font-size: 13px;
  color: #e0e0f0;
  animation: pulse-bar 2s ease-in-out infinite;
}

.agent-status-icon {
  font-size: 16px;
}

.agent-status-text {
  flex: 1;
}

.agent-round-badge {
  padding: 4px 10px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  font-size: 11px;
  color: #c4b5fd;
  white-space: nowrap;
}

.agent-queue-badge {
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  font-size: 11px;
  color: #fca5a5;
  white-space: nowrap;
}

@keyframes pulse-bar {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Agent Avatar & Badges */
.avatar.coder {
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
}

.avatar.reviewer {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
}

.avatar.system {
  background: var(--color-bg-elevated-2);
  color: #a0a0b0;
  font-size: 12px;
}

.agent-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  width: fit-content;
}

.agent-role-badge.coder {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.agent-role-badge.reviewer {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* System messages in agent mode */
.message-wrapper.system .bubble {
  background: #0f0f17;
  border: 1px solid var(--color-bg-elevated-2);
  color: #808090;
  font-size: 13px;
}

/* 对话切换按钮 */
.conversations-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-elevated-2);
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.conversations-btn:hover {
  background: #353550;
  color: #fff;
}

.conversations-btn span:last-child {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 对话列表侧边栏 */
.conversations-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  justify-content: flex-start;
}

.conversations-panel {
  width: 320px;
  height: 100%;
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-bg-elevated-2);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.conversations-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
}

.conversations-panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #808090;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-elevated-2);
  color: #fff;
}

/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #353550;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #4a4a6a;
}
</style>
