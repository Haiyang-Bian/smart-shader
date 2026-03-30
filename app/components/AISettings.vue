<template>
  <div class="ai-settings">
    <UButton
      variant="ghost"
      color="gray"
      size="sm"
      class="settings-btn"
      @click="isOpen = true"
    >
      <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5" />
      <span>AI Settings</span>
    </UButton>

    <USlideover v-model="isOpen" :ui="{ width: 'max-w-md' }">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>AI Configuration</h2>
          <UButton
            variant="ghost"
            color="gray"
            size="sm"
            @click="isOpen = false"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
          </UButton>
        </div>

        <div class="settings-content">
          <!-- Provider Selection -->
          <div class="setting-item">
            <label class="setting-label">
              <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4" />
              AI Provider
            </label>
            <USelect
              v-model="settings.provider"
              :options="providers"
              option-attribute="name"
              value-attribute="id"
              @change="onProviderChange"
            />
            <p class="setting-hint">
              {{ currentProvider?.description }}
            </p>
          </div>

          <!-- Model Selection -->
          <div class="setting-item">
            <label class="setting-label">
              <UIcon name="i-heroicons-cube" class="w-4 h-4" />
              Model
            </label>
            <USelect
              v-model="settings.model"
              :options="availableModels"
              option-attribute="name"
              value-attribute="id"
            />
            <p class="setting-hint">
              {{ currentModel?.description }}
            </p>
          </div>

          <!-- API Token -->
          <div class="setting-item">
            <label class="setting-label">
              <UIcon name="i-heroicons-key" class="w-4 h-4" />
              API Token
            </label>
            <UInput
              v-model="settings.token"
              :type="showToken ? 'text' : 'password'"
              :placeholder="`Enter your ${currentProvider?.name} API key`"
              class="token-input"
            >
              <template #trailing>
                <UButton
                  variant="ghost"
                  color="gray"
                  size="xs"
                  @click="showToken = !showToken"
                >
                  <UIcon
                    :name="showToken ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                    class="w-4 h-4"
                  />
                </UButton>
              </template>
            </UInput>
            <p class="setting-hint">
              Your API key is stored locally in your browser and never sent to our servers.
            </p>
          </div>

          <!-- Advanced Settings Toggle -->
          <div class="advanced-toggle">
            <UButton
              variant="ghost"
              color="gray"
              size="sm"
              @click="showAdvanced = !showAdvanced"
            >
              <UIcon
                :name="showAdvanced ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4 mr-2"
              />
              Advanced Settings
            </UButton>
          </div>

          <!-- Advanced Settings -->
          <div v-if="showAdvanced" class="advanced-settings">
            <div class="setting-item">
              <label class="setting-label">
                Temperature: {{ settings.temperature }}
              </label>
              <URange
                v-model="settings.temperature"
                :min="0"
                :max="2"
                :step="0.1"
              />
              <p class="setting-hint">
                Lower = more focused, Higher = more creative
              </p>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                Max Tokens: {{ settings.maxTokens }}
              </label>
              <URange
                v-model="settings.maxTokens"
                :min="256"
                :max="4096"
                :step="256"
              />
            </div>

            <div class="setting-item">
              <label class="setting-label">
                Custom API URL (Optional)
              </label>
              <UInput
                v-model="settings.customUrl"
                placeholder="https://api.openai.com/v1"
              />
              <p class="setting-hint">
                For custom endpoints or proxy servers
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="settings-footer">
          <UButton
            variant="ghost"
            color="gray"
            @click="resetSettings"
          >
            Reset
          </UButton>
          <UButton
            color="primary"
            :loading="isTesting"
            @click="testConnection"
          >
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 mr-2" />
            Test Connection
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            @click="saveSettings"
          >
            Save
          </UButton>
        </div>

        <!-- Test Result -->
        <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
          <UIcon
            :name="testResult.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            class="w-5 h-5"
          />
          <span>{{ testResult.message }}</span>
        </div>
      </div>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'settings-changed': [settings: AISettings]
}>()

interface AISettings {
  provider: string
  model: string
  token: string
  temperature: number
  maxTokens: number
  customUrl: string
}

const isOpen = ref(false)
const showToken = ref(false)
const showAdvanced = ref(false)
const isTesting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 Turbo and other OpenAI models',
    models: [
      { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model, best for complex shader generation' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster GPT-4 with good quality' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective' },
    ],
    defaultUrl: 'https://api.openai.com/v1'
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude models with excellent code generation',
    models: [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Best for complex tasks' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced performance' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest response' },
    ],
    defaultUrl: 'https://api.anthropic.com/v1'
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    description: 'Gemini models from Google AI',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning and coding' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
      { id: 'gemini-pro', name: 'Gemini Pro', description: 'General purpose model' },
    ],
    defaultUrl: 'https://generativelanguage.googleapis.com/v1'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI models through one API',
    models: [
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'Via OpenRouter' },
      { id: 'openai/gpt-4', name: 'GPT-4', description: 'Via OpenRouter' },
      { id: 'google/gemini-pro', name: 'Gemini Pro', description: 'Via OpenRouter' },
    ],
    defaultUrl: 'https://openrouter.ai/api/v1'
  },
  {
    id: 'local',
    name: 'Local/Ollama',
    description: 'Self-hosted models via Ollama or similar',
    models: [
      { id: 'codellama', name: 'CodeLlama', description: 'Specialized for code' },
      { id: 'llama2', name: 'Llama 2', description: 'General purpose' },
      { id: 'mistral', name: 'Mistral', description: 'Efficient open model' },
    ],
    defaultUrl: 'http://localhost:11434/v1'
  },
  {
    id: 'builtin',
    name: 'Built-in (No API)',
    description: 'Use predefined shader templates without API',
    models: [
      { id: 'template', name: 'Template Matcher', description: 'Keyword-based template selection' },
    ],
    defaultUrl: ''
  }
]

const defaultSettings: AISettings = {
  provider: 'builtin',
  model: 'template',
  token: '',
  temperature: 0.7,
  maxTokens: 2048,
  customUrl: ''
}

const settings = reactive<AISettings>({ ...defaultSettings })

const currentProvider = computed(() => providers.find(p => p.id === settings.provider))

const availableModels = computed(() => {
  return currentProvider.value?.models || []
})

const currentModel = computed(() => {
  return availableModels.value.find(m => m.id === settings.model)
})

// Load settings from localStorage on mount
onMounted(() => {
  const saved = localStorage.getItem('ai-settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(settings, parsed)
      emit('settings-changed', { ...settings })
    } catch (e) {
      console.error('Failed to load AI settings:', e)
    }
  }
})

const onProviderChange = () => {
  // Auto-select first model of new provider
  const models = currentProvider.value?.models || []
  if (models.length > 0) {
    settings.model = models[0].id
  }
  // Auto-set default URL
  if (currentProvider.value?.defaultUrl) {
    settings.customUrl = currentProvider.value.defaultUrl
  }
}

const saveSettings = () => {
  localStorage.setItem('ai-settings', JSON.stringify(settings))
  emit('settings-changed', { ...settings })
  isOpen.value = false
  
  // Show toast notification
  useToast().add({
    title: 'Settings Saved',
    description: 'Your AI configuration has been saved.',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}

const resetSettings = () => {
  Object.assign(settings, defaultSettings)
  localStorage.removeItem('ai-settings')
  testResult.value = null
}

const testConnection = async () => {
  if (!settings.token && settings.provider !== 'builtin') {
    testResult.value = { success: false, message: 'Please enter an API token' }
    return
  }

  isTesting.value = true
  testResult.value = null

  try {
    const response = await $fetch('/api/test-ai-connection', {
      method: 'POST',
      body: {
        provider: settings.provider,
        model: settings.model,
        token: settings.token,
        customUrl: settings.customUrl
      }
    })

    testResult.value = {
      success: response.success,
      message: response.message || (response.success ? 'Connection successful!' : 'Connection failed')
    }
  } catch (error: any) {
    testResult.value = {
      success: false,
      message: error.data?.message || 'Failed to test connection'
    }
  } finally {
    isTesting.value = false
  }
}

// Expose settings for parent components
defineExpose({
  settings: computed(() => ({ ...settings }))
})
</script>

<style scoped>
.ai-settings {
  display: flex;
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-gray-900);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-gray-800);
}

.settings-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.setting-item {
  margin-bottom: 24px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--color-gray-200);
}

.setting-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-gray-500);
  line-height: 1.5;
}

.token-input :deep(input) {
  font-family: monospace;
}

.advanced-toggle {
  margin: 16px 0;
  padding-top: 16px;
  border-top: 1px solid var(--color-gray-800);
}

.advanced-settings {
  padding: 16px;
  background: var(--color-gray-800);
  border-radius: 8px;
  margin-top: 8px;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--color-gray-800);
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
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
