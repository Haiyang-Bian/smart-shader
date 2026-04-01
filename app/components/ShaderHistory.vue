<template>
  <div class="shader-history">
    <div class="history-header">
      <span class="history-title">📜 历史版本</span>
      <div class="history-actions">
        <button
          class="history-btn"
          :disabled="!canUndo"
          @click="$emit('undo')"
          title="撤销 (Ctrl+Z)"
        >
          ↩️
        </button>
        <button
          class="history-btn"
          :disabled="!canRedo"
          @click="$emit('redo')"
          title="重做 (Ctrl+Y)"
        >
          ↪️
        </button>
        <button class="history-btn" @click="showList = !showList" title="查看历史">
          📋
        </button>
      </div>
    </div>

    <!-- 历史列表弹窗 -->
    <div v-if="showList" class="history-modal" @click.self="showList = false">
      <div class="history-content">
        <div class="history-modal-header">
          <h3>历史版本</h3>
          <button @click="showList = false">✕</button>
        </div>

        <div v-if="formattedHistory.length === 0" class="history-empty">
          暂无历史记录
        </div>

        <div v-else class="history-list">
          <div
            v-for="item in formattedHistory"
            :key="item.id"
            class="history-item"
            :class="{ current: item.isCurrent }"
            @click="$emit('restore', item.code)"
          >
            <div class="history-item-info">
              <span class="history-item-title">{{ item.description }}</span>
              <span class="history-item-time">{{ item.formattedTime }}</span>
            </div>
            <button
              class="history-item-restore"
              @click.stop="$emit('restore', item.code)"
            >
              恢复
            </button>
          </div>
        </div>

        <div class="history-modal-footer">
          <button class="btn-secondary" @click="$emit('clear')">
            清空历史
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  formattedHistory: {
    type: Array,
    default: () => []
  },
  canUndo: Boolean,
  canRedo: Boolean
})

defineEmits(['undo', 'redo', 'restore', 'clear'])

const showList = ref(false)
</script>

<style scoped>
.shader-history {
  padding: 8px 12px;
  background: #13131f;
  border-bottom: 1px solid #252538;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-title {
  font-size: 12px;
  color: #808090;
  font-weight: 500;
}

.history-actions {
  display: flex;
  gap: 4px;
}

.history-btn {
  width: 28px;
  height: 28px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #a0a0b0;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.history-btn:hover:not(:disabled) {
  background: #353550;
  color: #fff;
}

.history-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 历史弹窗 */
.history-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.history-content {
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  background: #13131f;
  border-radius: 16px;
  border: 1px solid #353550;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.history-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #252538;
}

.history-modal-header h3 {
  font-size: 16px;
  margin: 0;
  color: #fff;
}

.history-modal-header button {
  background: none;
  border: none;
  color: #808090;
  font-size: 18px;
  cursor: pointer;
}

.history-empty {
  padding: 40px 20px;
  text-align: center;
  color: #606070;
  font-size: 14px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 4px 0;
  background: #1a1a2a;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.history-item:hover {
  background: #252538;
  border-color: #353550;
}

.history-item.current {
  background: rgba(139, 92, 246, 0.1);
  border-color: #8b5cf6;
}

.history-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.history-item-title {
  font-size: 13px;
  color: #e0e0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-time {
  font-size: 11px;
  color: #606070;
}

.history-item-restore {
  padding: 6px 12px;
  background: #8b5cf6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.history-item:hover .history-item-restore {
  opacity: 1;
}

.history-modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #252538;
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 8px 16px;
  background: #252538;
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #353550;
  color: #fff;
}
</style>
