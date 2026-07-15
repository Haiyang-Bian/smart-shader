import type { AISettings, ProviderConfig, ModelInfo } from '~/types'

const defaultSettings: AISettings = {
  provider: 'builtin',
  model: 'template',
  token: '',
  temperature: 0.7,
  maxTokens: 2048,
  customUrl: ''
}

const defaultModels: Record<string, ModelInfo[]> = {
  builtin: [{ id: 'template', name: '模板匹配', description: '' }]
}

const providers: ProviderConfig[] = [
  { id: 'builtin', name: '内置助手 (无需API)', desc: '使用预设模板，无需配置', fetchModels: false },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4, GPT-3.5', fetchModels: true },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude 3 系列', fetchModels: true },
  { id: 'google', name: 'Google (Gemini)', desc: 'Gemini 系列', fetchModels: true },
  { id: 'moonshot', name: '月之暗面 (Moonshot)', desc: 'Kimi 大模型', fetchModels: true },
  { id: 'openrouter', name: 'OpenRouter', desc: '多模型聚合平台', fetchModels: true },
  { id: 'local', name: '本地/Ollama', desc: '自建模型服务', fetchModels: true }
]

export function useSettings() {
  const settings = reactive<AISettings>({ ...defaultSettings })
  const availableModels = ref<ModelInfo[]>(defaultModels.builtin)
  const fetchingModels = ref(false)
  const showSettings = ref(false)
  const showToken = ref(false)
  const testing = ref(false)
  const testResult = ref<{ success: boolean; message: string } | null>(null)

  const currentProvider = computed(() => providers.find(p => p.id === settings.provider))
  const tokenPlaceholder = computed(() => {
    if (settings.provider === 'moonshot') return 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
    return '输入你的 API Key'
  })
  const isFixedTempModel = computed(() => {
    const fixedTempModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
    return fixedTempModels.some(m => settings.model.includes(m))
  })

  // 加载设置
  function loadSettings() {
    const saved = localStorage.getItem('shader-settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        Object.assign(settings, parsed)
        if (settings.provider !== 'builtin') {
          availableModels.value = settings.model && settings.model !== 'template'
            ? [{ id: settings.model, name: settings.model, description: '' }]
            : []
          if (settings.token) fetchModels()
        } else {
          availableModels.value = defaultModels.builtin
        }
      } catch (e) {
        availableModels.value = defaultModels.builtin
      }
    } else {
      availableModels.value = defaultModels.builtin
    }
  }

  // 保存设置
  function saveSettings() {
    localStorage.setItem('shader-settings', JSON.stringify(settings))
    showSettings.value = false
    testResult.value = null
    return `✅ 设置已保存！当前使用: ${currentProvider.value?.name} (${settings.model})`
  }

  // 重置设置
  function resetSettings() {
    Object.assign(settings, defaultSettings)
    localStorage.removeItem('shader-settings')
    availableModels.value = defaultModels.builtin
    testResult.value = null
  }

  // 仅清掉设置键（与"清空所有对话"分开；用于"忘记我"场景）
  function purgeAllSettings() {
    resetSettings()
    showSettings.value = false
    return true
  }

  // 获取模型列表
  async function fetchModels() {
    if (settings.provider === 'builtin') return
    if (!settings.token) {
      availableModels.value = []
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
      }) as { error?: string; models?: ModelInfo[] }

      if (res.error) {
        availableModels.value = settings.model && settings.model !== 'template'
          ? [{ id: settings.model, name: settings.model, description: '' }]
          : []
      } else if (res.models?.length) {
        availableModels.value = res.models
        if (!availableModels.value.find(m => m.id === settings.model)) {
          settings.model = availableModels.value[0].id
        }
      } else {
        availableModels.value = settings.model && settings.model !== 'template'
          ? [{ id: settings.model, name: settings.model, description: '' }]
          : []
      }
    } catch (err) {
      availableModels.value = settings.model && settings.model !== 'template'
        ? [{ id: settings.model, name: settings.model, description: '' }]
        : []
    } finally {
      fetchingModels.value = false
    }
  }

  // 提供商变更
  function onProviderChange() {
    if (settings.provider === 'builtin') {
      availableModels.value = defaultModels.builtin
      settings.model = 'template'
    } else {
      availableModels.value = settings.model && settings.model !== 'template'
        ? [{ id: settings.model, name: settings.model, description: '' }]
        : []
      if (settings.token) fetchModels()
    }
  }

  // Token 失焦时获取模型
  function onTokenBlur() {
    if (settings.token && settings.provider !== 'builtin') {
      fetchModels()
    }
  }

  // 测试连接
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
      }) as { success: boolean; message: string }
      testResult.value = res
      if (res.success) await fetchModels()
    } catch (err: any) {
      testResult.value = { success: false, message: err.message }
    } finally {
      testing.value = false
    }
  }

  return {
    settings,
    availableModels,
    fetchingModels,
    showSettings,
    showToken,
    testing,
    testResult,
    providers,
    currentProvider,
    tokenPlaceholder,
    isFixedTempModel,
    loadSettings,
    saveSettings,
    resetSettings,
    purgeAllSettings,
    fetchModels,
    onProviderChange,
    onTokenBlur,
    testConnection
  }
}
