<template>
  <div class="chat">
    <!-- 头部 -->
    <header class="chat-header">
      <div class="header-left">
        <span class="logo">✨</span>
        <div class="title-group">
          <h1>Smart Shader</h1>
          <span v-if="currentModel" class="model-badge" :class="{ 'builtin': settings.provider === 'builtin' }">
            {{ currentModel }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button v-if="messages.length > 1" class="action-btn" @click="clearChat" title="清空对话">
          <span>🗑️</span>
        </button>
        <button class="settings-btn" @click="showSettings = true">
          <span>⚙️</span>
          <span>设置</span>
        </button>
      </div>
    </header>

    <!-- 消息列表 -->
    <div ref="messagesEl" class="messages custom-scrollbar">
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
          :class="msg.role"
        >
          <div class="message">
            <div class="avatar" :class="msg.role">
              {{ msg.role === 'user' ? '👤' : '✨' }}
            </div>
            <div class="message-content">
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
                  <span></span><span></span><span></span>
                </div>
                <div v-else>
                  <!-- 图片 -->
                  <div v-if="msg.image" class="message-image">
                    <img :src="msg.image" alt="渲染效果" />
                  </div>
                  <!-- 文本 -->
                  <div v-if="msg.content" class="message-text" v-html="formatMessage(msg.content)"></div>
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
      
      <div ref="bottomEl"></div>
    </div>

    <!-- 输入区 -->
    <div class="input-area">
      <!-- 待发送图片预览 -->
      <div v-if="pendingImage" class="pending-image">
        <div class="image-preview">
          <img :src="pendingImage.dataUrl" alt="截图" />
          <button class="remove-image" @click="removePendingImage" title="移除图片">✕</button>
        </div>
        <span class="image-hint">📷 截图将随消息一起发送给AI</span>
      </div>
      
      <!-- 待发送代码预览 -->
      <div v-if="pendingCode" class="pending-code">
        <div class="code-preview-header">
          <span>📝 代码已附加</span>
          <button class="remove-code" @click="removePendingCode" title="移除代码">✕</button>
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
          v-model="input"
          :placeholder="pendingImage ? '描述你对这个效果的想法，比如【颜色太亮了，想要暗一点】...' : placeholderText"
          @keydown.enter.prevent="handleEnter"
          :disabled="isStreaming"
          rows="1"
          ref="inputEl"
          class="custom-scrollbar"
        />
        <button 
          class="send-btn"
          @click="send"
          :disabled="(!input.trim() && !pendingImage) || isStreaming"
        >
          <span v-if="isStreaming" class="stop-icon" @click.stop="stopStreaming">⏹</span>
          <span v-else>➤</span>
        </button>
      </div>
      
      <!-- 输入提示 -->
      <div class="input-hint">
        <span v-if="isStreaming">正在生成...</span>
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
        />
        <button class="upload-btn" @click="$refs.fileInput.click()" :disabled="isStreaming || !!pendingImage">
          <span>📷</span>
          <span>上传图片</span>
        </button>
      </div>
    </div>

    <!-- 设置弹窗 -->
    <div v-if="showSettings" class="modal" @click.self="showSettings = false">
      <div class="modal-content custom-scrollbar">
        <div class="modal-header">
          <h2>⚙️ AI 设置</h2>
          <button @click="showSettings = false">✕</button>
        </div>
        
        <div class="form-group">
          <label>AI 提供商</label>
          <select v-model="settings.provider" @change="onProviderChange">
            <option v-for="p in providers" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
          <small>{{ currentProvider?.desc }}</small>
        </div>

        <div class="form-group">
          <label>模型</label>
          <div class="model-select-wrapper">
            <select v-model="settings.model" :disabled="fetchingModels">
              <option v-if="fetchingModels" value="">加载中...</option>
              <option v-for="m in availableModels" :key="m.id" :value="m.id">
                {{ m.name }}{{ m.description ? ` - ${m.description}` : '' }}
              </option>
            </select>
            <button 
              v-if="settings.provider !== 'builtin'" 
              class="refresh-btn"
              @click="fetchModels"
              :disabled="fetchingModels || !settings.token"
              title="刷新模型列表"
            >
              🔄
            </button>
          </div>
          <small v-if="settings.provider === 'moonshot' && isFixedTempModel" class="hint">
            ⚠️ 该模型只支持 temperature=1
          </small>
        </div>

        <div v-if="settings.provider !== 'builtin'" class="form-group">
          <label>API Token</label>
          <div class="token-input">
            <input 
              v-model="settings.token"
              :type="showToken ? 'text' : 'password'"
              :placeholder="tokenPlaceholder"
              @blur="onTokenBlur"
            />
            <button @click="showToken = !showToken">
              {{ showToken ? '🙈' : '👁️' }}
            </button>
          </div>
          <small>Token 仅存储在本地浏览器中</small>
        </div>

        <details class="advanced">
          <summary>高级设置</summary>
          
          <div class="form-group">
            <label>Temperature: {{ settings.temperature }}</label>
            <input 
              v-model.number="settings.temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              :disabled="isFixedTempModel"
            />
            <small>较低值更专注，较高值更有创意</small>
          </div>

          <div class="form-group">
            <label>Max Tokens: {{ settings.maxTokens }}</label>
            <input 
              v-model.number="settings.maxTokens"
              type="range"
              min="256"
              max="4096"
              step="256"
            />
          </div>

          <div class="form-group">
            <label>自定义 API URL（可选）</label>
            <input 
              v-model="settings.customUrl"
              placeholder="https://api.example.com/v1"
            />
          </div>
        </details>

        <div class="modal-actions">
          <button class="btn-secondary" @click="resetSettings">重置</button>
          <button 
            class="btn-primary"
            @click="testConnection"
            :disabled="testing || settings.provider === 'builtin'"
          >
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn-primary" @click="saveSettings">保存</button>
        </div>

        <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']">
          {{ testResult.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['shader-generated', 'request-screenshot', 'request-code'])

// ============ 状态管理 ============
const messages = ref([])
const input = ref('')
const isStreaming = ref(false)
const streamingReasoning = ref('')
const abortController = ref(null)
const messagesEl = ref(null)
const bottomEl = ref(null)
const inputEl = ref(null)

// 待发送的图片和代码
const pendingImage = ref(null)
const pendingCode = ref('')

// 设置相关
const showSettings = ref(false)
const showToken = ref(false)
const testing = ref(false)
const testResult = ref(null)
const fetchingModels = ref(false)
const availableModels = ref([])

// 快速操作
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

const currentModel = computed(() => {
  if (settings.provider === 'builtin') return '内置助手'
  return settings.model
})

// ============ 提供商配置 ============
const providers = [
  { id: 'builtin', name: '内置助手 (无需API)', desc: '使用预设模板，无需配置', fetchModels: false },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4, GPT-3.5', fetchModels: true },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude 3 系列', fetchModels: false },
  { id: 'moonshot', name: '月之暗面 (Moonshot)', desc: 'Kimi 大模型', fetchModels: true },
  { id: 'openrouter', name: 'OpenRouter', desc: '多模型聚合平台', fetchModels: true },
  { id: 'local', name: '本地/Ollama', desc: '自建模型服务', fetchModels: true }
]

const defaultModels = {
  builtin: [{ id: 'template', name: '模板匹配', description: '' }],
  anthropic: [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '最强大的模型' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: '均衡性能' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '快速响应' }
  ],
  moonshot: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', description: '最新模型' },
    { id: 'kimi-k2', name: 'Kimi K2', description: '' },
    { id: 'moonshot-v1-8k', name: 'Moonshot v1 (8K)', description: '只支持 temperature=1' }
  ]
}

const defaultSettings = {
  provider: 'builtin',
  model: 'template',
  token: '',
  temperature: 0.7,
  maxTokens: 2048,
  customUrl: ''
}

const settings = reactive({ ...defaultSettings })

// ============ 计算属性 ============
const currentProvider = computed(() => providers.find(p => p.id === settings.provider))
const tokenPlaceholder = computed(() => {
  if (settings.provider === 'moonshot') return 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
  return '输入你的 API Key'
})
const isFixedTempModel = computed(() => {
  const fixedTempModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  return fixedTempModels.some(m => settings.model.includes(m))
})

// 自动滚动状态
const autoScroll = ref(true)
let userScrollTimeout = null

// 监听用户滚动
function onMessagesScroll(e) {
  const el = e.target
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  
  // 清除之前的定时器
  if (userScrollTimeout) clearTimeout(userScrollTimeout)
  
  if (!isAtBottom) {
    // 用户向上滚动，停止自动滚动
    autoScroll.value = false
    
    // 3秒后恢复自动滚动
    userScrollTimeout = setTimeout(() => {
      autoScroll.value = true
    }, 3000)
  } else {
    // 用户滚动到底部，恢复自动滚动
    autoScroll.value = true
  }
}

// ============ 生命周期 ============
onMounted(() => {
  loadSettings()
  loadMessages()
  adjustTextareaHeight()
  
  // 添加滚动监听
  if (messagesEl.value) {
    messagesEl.value.addEventListener('scroll', onMessagesScroll)
  }
  
  // 添加粘贴事件监听
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  if (messagesEl.value) {
    messagesEl.value.removeEventListener('scroll', onMessagesScroll)
  }
  if (userScrollTimeout) clearTimeout(userScrollTimeout)
  
  // 移除粘贴事件监听
  document.removeEventListener('paste', handlePaste)
})

// ============ 设置管理 ============
function loadSettings() {
  const saved = localStorage.getItem('shader-settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(settings, parsed)
      if (settings.provider !== 'builtin' && settings.token) {
        fetchModels()
      } else {
        availableModels.value = defaultModels[settings.provider] || defaultModels.builtin
      }
    } catch (e) {
      availableModels.value = defaultModels.builtin
    }
  } else {
    availableModels.value = defaultModels.builtin
  }
}

function saveSettings() {
  localStorage.setItem('shader-settings', JSON.stringify(settings))
  showSettings.value = false
  testResult.value = null
  
  addMessage('assistant', `✅ 设置已保存！当前使用: ${currentProvider.value?.name} (${settings.model})`)
}

function resetSettings() {
  Object.assign(settings, defaultSettings)
  localStorage.removeItem('shader-settings')
  availableModels.value = defaultModels.builtin
  testResult.value = null
}

// ============ 对话持久化 ============
function loadMessages() {
  const saved = localStorage.getItem('shader-chat-history')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        messages.value = parsed.map(m => ({ ...m, isStreaming: false }))
        scrollToBottom()
      }
    } catch (e) {}
  }
}

function saveMessages() {
  const toSave = messages.value.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    image: m.image,
    code: m.code,
    reasoning: m.reasoning,
    shaderCode: m.shaderCode,
    timestamp: m.timestamp
  }))
  localStorage.setItem('shader-chat-history', JSON.stringify(toSave))
}

function clearChat() {
  if (confirm('确定要清空所有对话记录吗？')) {
    messages.value = []
    pendingImage.value = null
    pendingCode.value = ''
    localStorage.removeItem('shader-chat-history')
  }
}

// ============ 图片相关 ============
function addScreenshot(imageData) {
  pendingImage.value = imageData
  // 聚焦输入框
  nextTick(() => {
    inputEl.value?.focus()
  })
}

function removePendingImage() {
  pendingImage.value = null
}

// 处理文件上传
function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/')) {
    alert('请上传图片文件')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    pendingImage.value = {
      dataUrl: e.target.result,
      timestamp: Date.now()
    }
    nextTick(() => {
      inputEl.value?.focus()
    })
  }
  reader.readAsDataURL(file)
  
  // 清空input，允许重复上传同一文件
  event.target.value = ''
}

// 处理粘贴事件
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

// 添加代码到待发送
function addCodeBlock(code) {
  // 在输入框中插入代码块标记
  const codePreview = code.length > 100 ? code.slice(0, 100) + '...' : code
  const codeBlock = `[code]\n${codePreview}\n[/code]`
  
  if (input.value) {
    input.value += '\n\n' + codeBlock
  } else {
    input.value = '这是当前的代码，请帮我优化：\n\n' + codeBlock
  }
  
  // 保存完整代码到 pendingCode 供发送时使用
  pendingCode.value = code
  
  nextTick(() => {
    inputEl.value?.focus()
    adjustTextareaHeight()
  })
}

// 暴露方法给父组件
defineExpose({
  addScreenshot,
  addCodeBlock
})

// ============ 消息管理 ============
function addMessage(role, content, extra = {}) {
  const msg = {
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

function updateLastMessage(updater) {
  const last = messages.value[messages.value.length - 1]
  if (last) {
    Object.assign(last, typeof updater === 'function' ? updater(last) : updater)
  }
  return last
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
  if ((!text && !pendingImage.value && !pendingCode.value) || isStreaming.value) return
  
  if (settings.provider !== 'builtin' && !settings.token.trim()) {
    addMessage('assistant', '⚠️ 请先点击右上角 ⚙️ 设置，配置你的 API Token')
    showSettings.value = true
    return
  }
  
  // 构建消息内容
  let messageContent = text
  
  // 如果有待发送的代码，添加到消息中
  if (pendingCode.value) {
    if (messageContent) {
      messageContent += '\n\n```glsl\n' + pendingCode.value + '\n```'
    } else {
      messageContent = '请帮我优化以下代码：\n\n```glsl\n' + pendingCode.value + '\n```'
    }
  }
  
  // 添加用户消息（包含图片和代码）
  addMessage('user', messageContent, {
    image: pendingImage.value?.dataUrl,
    code: pendingCode.value || undefined
  })
  
  // 清空输入
  input.value = ''
  pendingImage.value = null
  pendingCode.value = ''
  adjustTextareaHeight()
  saveMessages()
  
  // 开始流式输出
  await startStreaming()
}

// 解析工具调用（支持 Kimi/OpenAI 标准格式）
function parseToolCalls(message) {
  // 如果是标准格式的 tool_calls
  if (message.toolCalls && Array.isArray(message.toolCalls)) {
    return message.toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name || tc.function?.name,
      arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.function?.arguments
    }))
  }
  return []
}

// 从消息中提取工具调用
function extractToolCallsFromStream(data) {
  if (data.tool_calls) {
    return data.tool_calls.map(tc => ({
      id: tc.id,
      name: tc.name || tc.function?.name,
      arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.function?.arguments)
    }))
  }
  return null
}

// 执行工具调用
async function executeToolCalls(toolCalls) {
  const results = []
  
  for (const toolCall of toolCalls) {
    const result = { name: toolCall.name, arguments: toolCall.arguments }
    
    try {
      switch (toolCall.name) {
        case 'capture_screenshot': {
          // 触发截图
          const screenshotResult = await requestScreenshot()
          result.result = screenshotResult.text
          result.image = screenshotResult.image
          break
        }
        case 'get_current_code':
          // 获取代码
          result.result = await requestCode()
          break
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

// 请求截图（通过父组件）
async function requestScreenshot() {
  return new Promise((resolve) => {
    emit('request-screenshot', {
      callback: (imageData) => {
        resolve(imageData ? { text: '[截图已捕获]', image: imageData } : { text: '[截图失败]' })
      }
    })
  })
}

// 请求代码（通过父组件）
async function requestCode() {
  return new Promise((resolve) => {
    emit('request-code', {
      callback: (code) => {
        resolve(code || '[未能获取代码]')
      }
    })
  })
}

// 格式化工具执行结果
function formatToolResults(results) {
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

async function startStreaming() {
  isStreaming.value = true
  streamingReasoning.value = ''
  abortController.value = new AbortController()
  
  const assistantMsg = addMessage('assistant', '', { isStreaming: true })
  scrollToBottom()
  
  try {
    // 准备消息历史
    const history = messages.value
      .filter(m => !m.isStreaming)
      .map(m => {
        const msg = { role: m.role, content: m.content || '' }
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
      }),
      signal: abortController.value.signal
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let fullReasoning = ''
    let shaderCode = null
    
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
            scrollToBottom()
          } else if (parsed.type === 'reasoning_end') {
            streamingReasoning.value = ''
            updateLastMessage({ reasoning: fullReasoning })
          } else if (parsed.type === 'content') {
            fullContent += parsed.content
            updateLastMessage({ content: fullContent })
            scrollToBottom()
          } else if (parsed.type === 'shader') {
            shaderCode = parsed.code
            updateLastMessage({ shaderCode })
          } else if (parsed.type === 'tool_calls') {
            // 收到工具调用信息
            updateLastMessage({ 
              content: fullContent + '\n\n[正在执行工具...]',
              isStreaming: false,
              toolCalls: parsed.calls
            })
            
            // 执行工具调用
            const toolResults = await executeToolCalls(parsed.calls)
            const screenshotResult = toolResults.find(r => r.name === 'capture_screenshot' && r.image)
            
            updateLastMessage({ 
              content: fullContent + '\n\n[工具已执行]',
              reasoning: fullReasoning,
              shaderCode,
              toolResults: toolResults,
              image: screenshotResult?.image || undefined
            })
            
            // 添加系统消息将工具结果发送给AI
            addMessage('system', formatToolResults(toolResults))
            
            // 继续流式输出获取AI对工具结果的回复
            await continueStreamingWithToolResults()
            return
          }
        } catch (e) {}
      }
    }
    
    // 检查是否有工具调用（备选方式）
    const lastMsg = messages.value[messages.value.length - 1]
    const toolCalls = parseToolCalls(lastMsg)
    
    if (toolCalls.length > 0 && !lastMsg.toolResultsProcessed) {
      lastMsg.toolResultsProcessed = true
      
      updateLastMessage({ 
        content: fullContent + '\n\n[正在执行工具...]',
        isStreaming: false
      })
      
      const toolResults = await executeToolCalls(toolCalls)
      const screenshotResult = toolResults.find(r => r.name === 'capture_screenshot' && r.image)
      
      updateLastMessage({ 
        content: fullContent + '\n\n[工具已执行]',
        reasoning: fullReasoning,
        shaderCode,
        image: screenshotResult?.image || undefined
      })
      
      addMessage('system', formatToolResults(toolResults))
      await continueStreamingWithToolResults()
      return
    }
    
    // 正常完成（没有工具调用）
    updateLastMessage({ 
      isStreaming: false,
      content: fullContent,
      reasoning: fullReasoning || undefined,
      shaderCode
    })
    
    // 自动应用代码到编辑器
    if (shaderCode) {
      emit('shader-generated', shaderCode)
    }
    
    saveMessages()
    
  } catch (error) {
    if (error.name === 'AbortError') {
      updateLastMessage({ content: '(已停止生成)', isStreaming: false })
    } else {
      updateLastMessage({ 
        content: `❌ 出错了: ${error.message || '请检查网络连接和API设置'}`,
        isStreaming: false 
      })
    }
    saveMessages()
  } finally {
    isStreaming.value = false
    streamingReasoning.value = ''
    abortController.value = null
  }
}

// 在工具执行完成后继续流式输出
async function continueStreamingWithToolResults() {
  isStreaming.value = true
  streamingReasoning.value = ''
  
  try {
    // 准备消息历史（包含工具结果）
    const history = messages.value
      .filter(m => !m.isStreaming)
      .map(m => {
        const msg = { role: m.role, content: m.content || '' }
        if (m.image) msg.image = m.image
        return msg
      })
    
    // 添加助手占位消息
    const assistantMsg = addMessage('assistant', '', { isStreaming: true })
    scrollToBottom()
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        settings: settings.provider === 'builtin' ? null : { ...settings },
        stream: true
      })
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let fullReasoning = ''
    let shaderCode = null
    
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
            scrollToBottom()
          } else if (parsed.type === 'reasoning_end') {
            streamingReasoning.value = ''
            updateLastMessage({ reasoning: fullReasoning })
          } else if (parsed.type === 'content') {
            fullContent += parsed.content
            updateLastMessage({ content: fullContent })
            scrollToBottom()
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
    
    // 自动应用代码到编辑器
    if (shaderCode) {
      emit('shader-generated', shaderCode)
    }
    
    saveMessages()
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      updateLastMessage({ 
        content: `[工具执行后续讨失败: ${error.message}]`,
        isStreaming: false 
      })
      saveMessages()
    }
  } finally {
    isStreaming.value = false
    streamingReasoning.value = ''
  }
}

function stopStreaming() {
  if (abortController.value) {
    abortController.value.abort()
  }
}

// ============ 消息操作 ============
async function regenerate(msg) {
  const msgIndex = messages.value.findIndex(m => m.id === msg.id)
  if (msgIndex <= 0) return
  
  messages.value = messages.value.slice(0, msgIndex)
  saveMessages()
  
  await startStreaming()
}

async function copyMessage(msg) {
  try {
    await navigator.clipboard.writeText(msg.content)
  } catch (e) {}
}

function applyShader(code) {
  emit('shader-generated', code)
}

// ============ 工具函数 ============
function formatMessage(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

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

// ============ 设置相关方法 ============
async function fetchModels() {
  if (settings.provider === 'builtin') return
  if (!settings.token) {
    availableModels.value = defaultModels[settings.provider] || []
    return
  }
  
  fetchingModels.value = true
  try {
    const res = await $fetch('/api/models', {
      query: {
        provider: settings.provider,
        token: settings.token.trim(),
        customUrl: settings.customUrl
      }
    })
    
    if (res.error) {
      availableModels.value = defaultModels[settings.provider] || []
    } else if (res.models?.length > 0) {
      availableModels.value = res.models
      if (!availableModels.value.find(m => m.id === settings.model)) {
        settings.model = availableModels.value[0].id
      }
    } else {
      availableModels.value = defaultModels[settings.provider] || []
    }
  } catch (err) {
    availableModels.value = defaultModels[settings.provider] || []
  } finally {
    fetchingModels.value = false
  }
}

function onProviderChange() {
  if (settings.provider === 'builtin') {
    availableModels.value = defaultModels.builtin
    settings.model = 'template'
  } else {
    availableModels.value = defaultModels[settings.provider] || []
    if (availableModels.value.length > 0) {
      settings.model = availableModels.value[0].id
    }
    if (settings.token) fetchModels()
  }
}

function onTokenBlur() {
  if (settings.token && settings.provider !== 'builtin') {
    fetchModels()
  }
}

async function testConnection() {
  if (settings.provider === 'builtin') return
  
  const token = settings.token?.trim()
  if (!token) {
    testResult.value = { success: false, message: '请先输入 API Token' }
    return
  }
  
  testing.value = true
  testResult.value = null
  
  try {
    const res = await $fetch('/api/test-ai-connection', {
      method: 'POST',
      body: {
        provider: settings.provider,
        token: token,
        customUrl: settings.customUrl
      }
    })
    testResult.value = res
    if (res.success) await fetchModels()
  } catch (err) {
    testResult.value = { success: false, message: err.message }
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0f;
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #13131f;
  border-bottom: 1px solid #252538;
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
  background: linear-gradient(90deg, #8b5cf6, #ec4899);
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
  background: #252538;
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
  background: #8b5cf6;
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
  border: 1px solid #252538;
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
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
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
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 20px;
  color: #e0e0f0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-actions button:hover {
  background: #252538;
  border-color: #8b5cf6;
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
  background: #252538;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.avatar.assistant {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100% - 44px);
}

.bubble {
  background: #1a1a2a;
  padding: 14px 18px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  line-height: 1.7;
  font-size: 14px;
  color: #e0e0f0;
  word-break: break-word;
}

.message-wrapper.user .bubble {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
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
  background: #0a0a0f;
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

.message-text :deep(p) {
  margin: 0 0 10px;
}

.message-text :deep(p:last-child) {
  margin-bottom: 0;
}

/* 思考过程 */
.reasoning-block {
  background: #0f0f17;
  border: 1px solid #252538;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}

.reasoning-block.active {
  border-color: #8b5cf6;
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
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
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
  background: #13131f;
  border-top: 1px solid #252538;
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
  border: 1px dashed #8b5cf6;
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
  color: #8b5cf6;
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
  background: #0a0a0f;
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
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 16px;
  color: #a0a0b0;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.suggestions button:hover {
  background: #252538;
  color: #fff;
  border-color: #8b5cf6;
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.input-row textarea {
  flex: 1;
  padding: 12px 16px;
  background: #1a1a2a;
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
  border-color: #8b5cf6;
}

.input-row textarea::placeholder {
  color: #505060;
}

.send-btn {
  width: 44px;
  height: 44px;
  background: #8b5cf6;
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
  border-top: 1px solid #252538;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover:not(:disabled) {
  background: #252538;
  border-color: #8b5cf6;
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

/* 弹窗 */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: #13131f;
  border-radius: 16px;
  border: 1px solid #353550;
  overflow: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid #252538;
  position: sticky;
  top: 0;
  background: #13131f;
  z-index: 10;
}

.modal-header h2 {
  font-size: 18px;
  margin: 0;
}

.modal-header button {
  background: none;
  border: none;
  color: #808090;
  font-size: 20px;
  cursor: pointer;
}

.form-group {
  padding: 16px 20px;
  border-bottom: 1px solid #252538;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #e0e0f0;
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.form-group small {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #606070;
}

.form-group small.hint {
  color: #f59e0b;
}

.model-select-wrapper {
  display: flex;
  gap: 8px;
}

.model-select-wrapper select {
  flex: 1;
}

.refresh-btn {
  width: 40px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
}

.token-input {
  display: flex;
  gap: 8px;
}

.token-input input {
  flex: 1;
}

.token-input button {
  width: 40px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
}

.advanced summary {
  padding: 16px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #a0a0b0;
}

.modal-actions {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  justify-content: flex-end;
  border-top: 1px solid #252538;
}

.btn-secondary {
  padding: 10px 16px;
  background: #252538;
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary {
  padding: 10px 16px;
  background: #8b5cf6;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
}

.test-result {
  margin: 0 20px 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
</style>
