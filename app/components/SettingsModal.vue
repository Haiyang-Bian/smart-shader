<template>
  <div class="modal" @click.self="$emit('update:modelValue', false)">
    <div class="modal-content custom-scrollbar">
      <div class="modal-header">
        <h2>⚙️ AI 设置</h2>
        <button @click="$emit('update:modelValue', false)">✕</button>
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
            <option v-else-if="availableModels.length === 0" value="">请输入 API Token 后自动获取模型</option>
            <option v-for="m in availableModels" :key="m.id" :value="m.id">
              {{ m.name }}{{ m.description ? ` - ${m.description}` : '' }}
            </option>
          </select>
          <button
            v-if="settings.provider !== 'builtin'"
            class="refresh-btn"
            :disabled="fetchingModels || !settings.token"
            title="刷新模型列表"
            @click="fetchModels"
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
          >
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
          >
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
          >
        </div>

        <div class="form-group">
          <label>Agent 最大迭代轮数: {{ settings.maxAgentRounds }}</label>
          <input
            v-model.number="settings.maxAgentRounds"
            type="range"
            min="1"
            max="20"
            step="1"
          >
          <span class="hint">Agent 模式下，Coder + Reviewer 之间的最大循环次数。</span>
        </div>

        <div class="form-group">
          <label>自定义 API URL（可选）</label>
          <input
            v-model="settings.customUrl"
            placeholder="https://api.example.com/v1"
          >
        </div>
      </details>

      <div class="modal-actions">
        <button class="btn-secondary" @click="resetSettings">重置</button>
        <button
          class="btn-primary"
          :disabled="testing || settings.provider === 'builtin'"
          @click="testConnection"
        >
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn-primary" @click="save">保存</button>
      </div>

      <details class="form-group danger-zone">
        <summary>危险操作</summary>
        <p class="hint">清空所有数据会同时删除服务端数据库与浏览器本地存储中的所有对话和设置。</p>
        <button class="btn-danger" @click="purgeEverything">🗑 清空所有数据</button>
      </details>

      <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']">
        {{ testResult.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps(['modelValue'])
defineEmits(['update:modelValue'])

const {
  settings,
  availableModels,
  fetchingModels,
  showToken,
  testing,
  testResult,
  providers,
  currentProvider,
  tokenPlaceholder,
  isFixedTempModel,
  saveSettings,
  resetSettings,
  purgeAllSettings,
  fetchModels,
  onProviderChange,
  onTokenBlur,
  testConnection
} = useSettings()

const toast = useCustomToast()
const { confirm } = useConfirmDialog()

async function purgeEverything() {
  const ok = await confirm({
    title: '清空所有数据',
    message: '这会同时删除服务端保存的所有对话、消息和日志，以及浏览器本地的设置与历史。此操作不可恢复，是否继续？',
    confirmText: '确认清空',
    cancelText: '取消',
    type: 'danger'
  })
  if (!ok) return
  purgeAllSettings()
  try {
    await $fetch('/api/privacy/purge', { method: 'POST', body: { confirm: true } })
  } catch (e) {
    // 即使服务端清除失败，至少本地已经清空
  }
  toast.success('本地数据已清除')
  location.reload()
}

function save() {
  const msg = saveSettings()
  toast.success(msg)
}
</script>

<style scoped>
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
  background: var(--color-bg-elevated);
  border-radius: 16px;
  border: 1px solid #353550;
  overflow: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
  position: sticky;
  top: 0;
  background: var(--color-bg-elevated);
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
  border-bottom: 1px solid var(--color-bg-elevated-2);
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
  background: var(--color-bg-extra);
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
  background: var(--color-bg-elevated-2);
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
  background: var(--color-bg-elevated-2);
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
  border-top: 1px solid var(--color-bg-elevated-2);
}

.btn-secondary {
  padding: 10px 16px;
  background: var(--color-bg-elevated-2);
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary {
  padding: 10px 16px;
  background: var(--color-accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
}

.danger-zone {
  border-top: 1px solid var(--color-bg-elevated-2);
  margin: 0;
  padding: 16px 20px;
}

.danger-zone summary {
  cursor: pointer;
  font-size: 13px;
  color: #ef4444;
  margin-bottom: 12px;
  user-select: none;
}

.danger-zone .hint {
  font-size: 12px;
  color: #a0a0b0;
  margin: 0 0 12px;
  line-height: 1.5;
}

.btn-danger {
  padding: 10px 16px;
  background: #ef4444;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  font-weight: 600;
}

.btn-danger:hover {
  background: #dc2626;
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
