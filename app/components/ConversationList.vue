<template>
  <div class="conversation-list">
    <div class="conversation-header">
      <h3>对话列表</h3>
      <button class="new-chat-btn" title="新建对话" @click="createNewConversation">
        <span>+</span>
        <span>新对话</span>
      </button>
    </div>

    <div class="conversation-items">
      <div
        v-for="conv in sortedConversations"
        :key="conv.id"
        class="conversation-item"
        :class="{ active: currentId === conv.id, editing: editingId === conv.id }"
        @click="switchConversation(conv.id)"
      >
        <div class="conv-icon">💬</div>

        <div class="conv-content">
          <div v-if="editingId === conv.id" class="conv-edit">
            <input
              ref="titleInput"
              v-model="editingTitle"
              @keyup.enter="saveTitle"
              @keyup.esc="cancelEdit"
              @click.stop
            >
            <button @click.stop="saveTitle">✓</button>
            <button @click.stop="cancelEdit">✕</button>
          </div>
          <template v-else>
            <div class="conv-title">{{ conv.title }}</div>
            <div class="conv-meta">
              {{ formatTime(conv.updatedAt) }} · {{ conv.messages.length }} 条消息
            </div>
          </template>
        </div>

        <div class="conv-actions" @click.stop>
          <button
            class="action-btn"
            title="重命名"
            @click="startEdit(conv)"
          >
            ✏️
          </button>
          <button
            class="action-btn delete"
            title="删除"
            :disabled="sortedConversations.length === 1"
            @click="confirmDelete(conv.id)"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <div class="conversation-footer">
      <button class="clear-all-btn" @click="clearAll">
        清空所有对话
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  conversations: {
    type: Array,
    required: true
  },
  currentId: {
    type: String,
    default: null
  },
  sortedConversations: {
    type: Array,
    required: true
  }
})

const emit = defineEmits([
  'create',
  'switch',
  'delete',
  'update-title',
  'clear-all'
])

const editingId = ref(null)
const editingTitle = ref('')
const titleInput = ref(null)

function createNewConversation() {
  emit('create')
}

function switchConversation(id) {
  if (editingId.value) return
  emit('switch', id)
}

function confirmDelete(id) {
  if (confirm('确定要删除这个对话吗？')) {
    emit('delete', id)
  }
}

function startEdit(conv) {
  editingId.value = conv.id
  editingTitle.value = conv.title
  nextTick(() => {
    titleInput.value?.focus()
  })
}

function saveTitle() {
  if (editingId.value && editingTitle.value.trim()) {
    emit('update-title', editingId.value, editingTitle.value.trim())
  }
  editingId.value = null
  editingTitle.value = ''
}

function cancelEdit() {
  editingId.value = null
  editingTitle.value = ''
}

function clearAll() {
  emit('clear-all')
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  // 小于1小时显示相对时间
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    if (minutes < 1) return '刚刚'
    return `${minutes} 分钟前`
  }

  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }

  // 其他日期
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.conversation-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-bg-elevated-2);
}

.conversation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
}

.conversation-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0f0;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, var(--color-accent), #ec4899);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.new-chat-btn:hover {
  opacity: 0.9;
}

.conversation-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.conversation-item:hover {
  background: var(--color-bg-extra);
}

.conversation-item.active {
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.conv-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.conv-content {
  flex: 1;
  min-width: 0;
}

.conv-title {
  font-size: 14px;
  font-weight: 500;
  color: #e0e0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-meta {
  font-size: 12px;
  color: #606070;
  margin-top: 2px;
}

.conv-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.conv-edit input {
  flex: 1;
  padding: 4px 8px;
  background: var(--color-bg-elevated-2);
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.conv-edit button {
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
}

.conv-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.conversation-item:hover .conv-actions,
.conversation-item.active .conv-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--color-bg-elevated-2);
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.2);
}

.action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.conversation-footer {
  padding: 12px;
  border-top: 1px solid var(--color-bg-elevated-2);
}

.clear-all-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #606070;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-all-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
