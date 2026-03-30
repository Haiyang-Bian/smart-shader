<template>
  <div class="chat">
    <!-- 头部 -->
    <header class="chat-header">
      <div class="header-left">
        <span class="logo">✨</span>
        <h1>Smart Shader</h1>
      </div>
      <button class="settings-btn" @click="showSettings = true">
        <span>⚙️</span>
        <span>设置</span>
      </button>
    </header>

    <!-- 消息列表 -->
    <div ref="messagesEl" class="messages custom-scrollbar">
      <div 
        v-for="(msg, i) in messages" 
        :key="i"
        class="message"
        :class="msg.role"
      >
        <div class="avatar">
          {{ msg.role === 'user' ? '👤' : '✨' }}
        </div>
        <div class="bubble">
          <p v-if="msg.content">{{ msg.content }}</p>
          <div v-if="msg.shaderCode" class="shader-tag">🎨 已生成着色器</div>
          <div v-if="msg.model" class="model-tag">{{ msg.model }}</div>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="loading" class="message assistant">
        <div class="avatar">✨</div>
        <div class="bubble loading">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="input-area">
      <!-- 快捷提示 -->
      <div class="suggestions custom-scrollbar-x">
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
          placeholder="描述你想要的着色器效果，比如：彩虹波浪、星空、熔岩..."
          @keydown.enter.prevent="send"
          :disabled="loading"
          rows="2"
          class="custom-scrollbar"
        />
        <button 
          class="send-btn"
          @click="send"
          :disabled="!input.trim() || loading"
        >
          {{ loading ? '⏳' : '➤' }}
        </button>
      </div>
      
      <!-- 当前模型 -->
      <div v-if="settings.provider !== 'builtin'" class="model-info">
        使用: {{ providerName }} / {{ settings.model }}
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
          <small>
            Token 仅存储在本地浏览器中
            <span v-if="settings.provider === 'moonshot'" class="hint">
              <br>从 <a href="https://platform.moonshot.cn/console/api-keys" target="_blank">Moonshot 控制台</a> 获取
            </span>
          </small>
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
            <small v-if="isFixedTempModel" class="hint">
              当前模型只支持 temperature=1
            </small>
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
            <small v-if="settings.provider === 'moonshot'">
              默认: https://api.moonshot.cn/v1/chat/completions
            </small>
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
const emit = defineEmits(['shader-generated'])

// 消息
const messages = ref([{
  role: 'assistant',
  content: '你好！我是 Smart Shader AI。描述你想要的视觉效果，我会为你生成 GLSL 着色器代码。试试：彩虹波浪、星空、熔岩灯...'
}])

const input = ref('')
const loading = ref(false)
const messagesEl = ref(null)

// 设置
const showSettings = ref(false)
const showToken = ref(false)
const testing = ref(false)
const testResult = ref(null)
const fetchingModels = ref(false)
const availableModels = ref([])

const providers = [
  { id: 'builtin', name: '内置模板 (无需API)', desc: '使用预设模板，无需配置', fetchModels: false },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4, GPT-3.5', fetchModels: true },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude 3 系列', fetchModels: false },
  { id: 'google', name: 'Google Gemini', desc: 'Gemini Pro, Flash', fetchModels: false },
  { id: 'moonshot', name: '月之暗面 (Moonshot)', desc: 'Kimi 大模型 (中国)', fetchModels: true },
  { id: 'openrouter', name: 'OpenRouter', desc: '多模型聚合平台', fetchModels: true },
  { id: 'local', name: '本地/Ollama', desc: '自建模型服务', fetchModels: true }
]

// 默认模型列表（作为后备）
const defaultModels = {
  builtin: [{ id: 'template', name: '模板匹配', description: '' }],
  anthropic: [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: '' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '' }
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '' }
  ],
  moonshot: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', description: '最新模型' },
    { id: 'kimi-k2', name: 'Kimi K2', description: '' },
    { id: 'moonshot-v1-8k', name: 'Moonshot v1 (8K)', description: '只支持 temperature=1' },
    { id: 'moonshot-v1-32k', name: 'Moonshot v1 (32K)', description: '只支持 temperature=1' },
    { id: 'moonshot-v1-128k', name: 'Moonshot v1 (128K)', description: '只支持 temperature=1' }
  ]
}

const suggestions = ['彩虹波浪', '熔岩灯', '星空', '火焰', '水波纹', '霓虹网格']

// 默认设置
const defaultSettings = {
  provider: 'builtin',
  model: 'template',
  token: '',
  temperature: 0.7,
  maxTokens: 2048,
  customUrl: ''
}

// 加载保存的设置 - 持久化
const settings = reactive({ ...defaultSettings })

// 计算属性
const currentProvider = computed(() => providers.find(p => p.id === settings.provider))
const providerName = computed(() => currentProvider.value?.name || settings.provider)
const tokenPlaceholder = computed(() => {
  if (settings.provider === 'moonshot') return 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
  return '输入你的 API Key'
})

// 检查是否为固定 temperature 的模型
const isFixedTempModel = computed(() => {
  const fixedTempModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  return fixedTempModels.some(m => settings.model.includes(m))
})

// 加载保存的设置
onMounted(() => {
  const saved = localStorage.getItem('shader-settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(settings, parsed)
      // 加载后获取模型列表
      if (settings.provider !== 'builtin' && settings.token) {
        fetchModels()
      } else {
        availableModels.value = defaultModels[settings.provider] || defaultModels.builtin
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
      availableModels.value = defaultModels.builtin
    }
  } else {
    availableModels.value = defaultModels.builtin
  }
})

// 监听 provider 变化
watch(() => settings.provider, (newProvider) => {
  if (newProvider === 'builtin') {
    availableModels.value = defaultModels.builtin
    settings.model = 'template'
  } else {
    availableModels.value = defaultModels[newProvider] || []
    if (availableModels.value.length > 0) {
      settings.model = availableModels.value[0].id
    }
    // 如果有 token，尝试获取远程模型列表
    if (settings.token) {
      fetchModels()
    }
  }
})

// 获取模型列表
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
      console.error('Failed to fetch models:', res.error)
      // 使用默认列表
      availableModels.value = defaultModels[settings.provider] || []
    } else if (res.models && res.models.length > 0) {
      availableModels.value = res.models
      // 如果当前选择的模型不在列表中，选择第一个
      if (!availableModels.value.find(m => m.id === settings.model)) {
        settings.model = availableModels.value[0].id
      }
    } else {
      availableModels.value = defaultModels[settings.provider] || []
    }
  } catch (err) {
    console.error('Failed to fetch models:', err)
    availableModels.value = defaultModels[settings.provider] || []
  } finally {
    fetchingModels.value = false
  }
}

const onProviderChange = () => {
  // provider 变化时由 watch 处理
}

// Token 输入框失去焦点时获取模型列表
const onTokenBlur = () => {
  if (settings.token && settings.provider !== 'builtin') {
    fetchModels()
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

const send = async () => {
  const text = input.value.trim()
  if (!text || loading.value) return
  
  // 检查 API Token
  if (settings.provider !== 'builtin') {
    const token = settings.token?.trim()
    if (!token) {
      messages.value.push({
        role: 'assistant',
        content: '⚠️ 请先点击右上角 ⚙️ 设置，配置你的 API Token'
      })
      showSettings.value = true
      scrollToBottom()
      return
    }
    
    // Moonshot Token 格式检查
    if (settings.provider === 'moonshot' && !token.startsWith('sk-')) {
      messages.value.push({
        role: 'assistant',
        content: '⚠️ Moonshot API Token 格式错误，应以 sk- 开头。请从 https://platform.moonshot.cn/console/api-keys 获取正确的 API Key。'
      })
      showSettings.value = true
      scrollToBottom()
      return
    }
  }
  
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  scrollToBottom()
  
  try {
    const res = await $fetch('/api/generate-shader', {
      method: 'POST',
      body: {
        prompt: text,
        settings: settings.provider === 'builtin' ? null : { ...settings }
      }
    })
    
    messages.value.push({
      role: 'assistant',
      content: res.description || '已生成着色器！',
      shaderCode: true,
      model: res.model
    })
    
    if (res.shaderCode) {
      emit('shader-generated', res.shaderCode)
    }
  } catch (err) {
    const errorMsg = err.data?.message || err.message
    
    // 提供更友好的错误提示
    let friendlyMsg = errorMsg
    if (settings.provider === 'moonshot') {
      if (errorMsg.includes('Invalid Authentication') || errorMsg.includes('401')) {
        friendlyMsg = 'Moonshot API Token 无效。请检查：\n1. Token 是否以 sk- 开头\n2. Token 是否已过期\n3. 从 https://platform.moonshot.cn/console/api-keys 重新获取'
      }
    }
    
    messages.value.push({
      role: 'assistant',
      content: '出错了: ' + friendlyMsg
    })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

// 保存设置到 localStorage - 持久化
const saveSettings = () => {
  // 保存前清理 token
  const settingsToSave = {
    ...settings,
    token: settings.token?.trim() || ''
  }
  localStorage.setItem('shader-settings', JSON.stringify(settingsToSave))
  showSettings.value = false
  testResult.value = null
  
  // 显示保存成功提示
  messages.value.push({
    role: 'assistant',
    content: `✅ 设置已保存！当前使用: ${providerName.value} (${settings.model})`
  })
  scrollToBottom()
}

const resetSettings = () => {
  Object.assign(settings, defaultSettings)
  localStorage.removeItem('shader-settings')
  availableModels.value = defaultModels.builtin
  testResult.value = null
}

const testConnection = async () => {
  if (settings.provider === 'builtin') return
  
  const token = settings.token?.trim()
  if (!token) {
    testResult.value = { success: false, message: '请先输入 API Token' }
    return
  }
  
  // Moonshot Token 格式检查
  if (settings.provider === 'moonshot' && !token.startsWith('sk-')) {
    testResult.value = { success: false, message: 'Moonshot API Token 应以 sk- 开头' }
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
    
    // 测试成功后刷新模型列表
    if (res.success) {
      await fetchModels()
    }
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
  padding: 16px 20px;
  background: #13131f;
  border-bottom: 1px solid #252538;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 24px;
}

h1 {
  font-size: 18px;
  font-weight: 600;
  background: linear-gradient(90deg, #8b5cf6, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.settings-btn {
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
}

.settings-btn:hover {
  background: #353550;
  color: #fff;
}

/* 消息列表 */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  gap: 12px;
  max-width: 85%;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #252538;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message.assistant .avatar {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
}

.bubble {
  background: #1a1a2a;
  padding: 12px 16px;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  line-height: 1.6;
  font-size: 14px;
  word-break: break-word;
}

.message.user .bubble {
  background: #8b5cf6;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 4px;
}

.bubble.loading {
  display: flex;
  gap: 4px;
  padding: 16px 20px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #808090;
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.shader-tag {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #353550;
  font-size: 12px;
  color: #22d3ee;
}

.model-tag {
  margin-top: 6px;
  font-size: 11px;
  color: #808090;
}

/* 输入区 */
.input-area {
  padding: 16px 20px;
  background: #13131f;
  border-top: 1px solid #252538;
  flex-shrink: 0;
}

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
}

.input-row textarea:focus {
  border-color: #8b5cf6;
}

.input-row textarea::placeholder {
  color: #606070;
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
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #7c3aed;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.model-info {
  margin-top: 10px;
  font-size: 12px;
  color: #606070;
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
  padding: 4px;
}

.modal-header button:hover {
  color: #fff;
}

.form-group {
  padding: 16px 20px;
  border-bottom: 1px solid #252538;
}

.form-group:last-child {
  border-bottom: none;
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
  font-family: inherit;
}

.form-group select:focus,
.form-group input:focus {
  border-color: #8b5cf6;
}

.form-group select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.form-group small a {
  color: #8b5cf6;
  text-decoration: none;
}

.form-group small a:hover {
  text-decoration: underline;
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
  font-size: 14px;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #353550;
  color: #fff;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  transition: all 0.2s;
}

.token-input button:hover {
  background: #353550;
  color: #fff;
}

.advanced {
  border-bottom: 1px solid #252538;
}

.advanced summary {
  padding: 16px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #a0a0b0;
  user-select: none;
}

.advanced summary:hover {
  color: #fff;
}

.modal-actions {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  justify-content: flex-end;
  position: sticky;
  bottom: 0;
  background: #13131f;
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
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #353550;
  color: #fff;
}

.btn-primary {
  padding: 10px 16px;
  background: #8b5cf6;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  margin: 0 20px 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  white-space: pre-line;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 自定义滚动条 */
:global(.custom-scrollbar::-webkit-scrollbar) {
  width: 6px;
}

:global(.custom-scrollbar::-webkit-scrollbar-track) {
  background: transparent;
}

:global(.custom-scrollbar::-webkit-scrollbar-thumb) {
  background: #353550;
  border-radius: 3px;
}

:global(.custom-scrollbar::-webkit-scrollbar-thumb:hover) {
  background: #4a4a6a;
}

/* 水平滚动条 */
:global(.custom-scrollbar-x::-webkit-scrollbar) {
  height: 4px;
}

:global(.custom-scrollbar-x::-webkit-scrollbar-track) {
  background: transparent;
}

:global(.custom-scrollbar-x::-webkit-scrollbar-thumb) {
  background: #353550;
  border-radius: 2px;
}

:global(.custom-scrollbar-x::-webkit-scrollbar-thumb:hover) {
  background: #4a4a6a;
}

/* Firefox 滚动条 */
:global(.custom-scrollbar) {
  scrollbar-width: thin;
  scrollbar-color: #353550 transparent;
}

:global(.custom-scrollbar-x) {
  scrollbar-width: thin;
  scrollbar-color: #353550 transparent;
}
</style>
