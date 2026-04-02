<script setup lang="ts">
const password = ref('')
const storedPassword = ref('')
if (process.client) {
  storedPassword.value = sessionStorage.getItem('admin-password') || ''
}
watch(storedPassword, (val) => {
  if (process.client) {
    if (val) sessionStorage.setItem('admin-password', val)
    else sessionStorage.removeItem('admin-password')
  }
})
const isLoggedIn = computed(() => !!storedPassword.value)

async function login() {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password.value })
  })
  if (res.ok) {
    storedPassword.value = password.value
  } else {
    alert('密码错误')
  }
}

function logout() {
  storedPassword.value = ''
}

const activeTab = ref<'logs' | 'conversations'>('logs')

// Logs
const logs = ref<any[]>([])
const logPage = ref(1)
const logLimit = 20
const logTotal = ref(0)
const logLevel = ref('')
const logLoading = ref(false)

async function fetchLogs() {
  logLoading.value = true
  const res = await fetch(`/api/admin/logs?page=${logPage.value}&limit=${logLimit}&level=${logLevel.value}`, {
    headers: { 'x-admin-password': storedPassword.value }
  })
  const data = await res.json()
  logs.value = data.data || []
  logTotal.value = data.total || 0
  logLoading.value = false
}

// Conversations
const conversations = ref<any[]>([])
const selectedConversationId = ref<string | null>(null)
const conversationDetail = ref<any>(null)
const convLoading = ref(false)

async function fetchConversations() {
  convLoading.value = true
  const res = await fetch('/api/admin/conversations', {
    headers: { 'x-admin-password': storedPassword.value }
  })
  const data = await res.json()
  conversations.value = data.data || []
  convLoading.value = false
}

async function selectConversation(id: string) {
  selectedConversationId.value = id
  const res = await fetch(`/api/admin/conversations/${id}`, {
    headers: { 'x-admin-password': storedPassword.value }
  })
  conversationDetail.value = await res.json()
}

async function deleteConversation(id: string) {
  if (!confirm('确定删除该对话？')) return
  await fetch(`/api/admin/conversations/${id}/delete`, {
    method: 'POST',
    headers: { 'x-admin-password': storedPassword.value }
  })
  await fetchConversations()
  if (selectedConversationId.value === id) {
    selectedConversationId.value = null
    conversationDetail.value = null
  }
}

// 自动刷新
let autoRefreshInterval: number | null = null

function startAutoRefresh() {
  stopAutoRefresh()
  autoRefreshInterval = window.setInterval(() => {
    if (!isLoggedIn.value) return
    if (activeTab.value === 'logs') fetchLogs()
    else fetchConversations()
  }, 5000)
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval)
    autoRefreshInterval = null
  }
}

watchEffect(() => {
  if (isLoggedIn.value) {
    if (activeTab.value === 'logs') fetchLogs()
    else fetchConversations()
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="admin-page">
    <div v-if="!isLoggedIn" class="login-panel">
      <h1>后台管理登录</h1>
      <input v-model="password" type="password" placeholder="输入管理员密码" @keyup.enter="login" />
      <button @click="login">登录</button>
    </div>
    <div v-else class="admin-layout">
      <header class="admin-header">
        <h1>Smart Shader Admin</h1>
        <button @click="logout">退出登录</button>
      </header>
      <div class="admin-body">
        <aside class="admin-sidebar">
          <button :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'; logPage = 1">日志</button>
          <button :class="{ active: activeTab === 'conversations' }" @click="activeTab = 'conversations'">对话记录</button>
        </aside>
        <main class="admin-main">
          <!-- Logs Tab -->
          <div v-if="activeTab === 'logs'" class="tab-content custom-scrollbar">
            <div class="toolbar">
              <select v-model="logLevel" @change="logPage = 1; fetchLogs()">
                <option value="">全部级别</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
              <button class="refresh-btn" @click="fetchLogs" :disabled="logLoading">
                {{ logLoading ? '刷新中...' : '刷新' }}
              </button>
            </div>
            <div class="table-wrapper custom-scrollbar">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>级别</th>
                    <th>来源</th>
                    <th>消息</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="log in logs" :key="log.id">
                    <td>{{ new Date(log.created_at).toLocaleString() }}</td>
                    <td><span class="badge" :class="log.level">{{ log.level }}</span></td>
                    <td>{{ log.source }}</td>
                    <td>
                      <div>{{ log.message }}</div>
                      <pre v-if="log.metadata" class="metadata">{{ JSON.stringify(log.metadata, null, 2) }}</pre>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="pagination">
              <button :disabled="logPage <= 1" @click="logPage--; fetchLogs()">上一页</button>
              <span>第 {{ logPage }} 页 / 共 {{ Math.max(1, Math.ceil(logTotal / logLimit)) }} 页</span>
              <button :disabled="logPage * logLimit >= logTotal" @click="logPage++; fetchLogs()">下一页</button>
            </div>
          </div>

          <!-- Conversations Tab -->
          <div v-else class="tab-content conversations-tab">
            <div class="split-view">
              <div class="conv-list custom-scrollbar">
                <div class="list-header">
                  <span>对话列表</span>
                  <button class="refresh-btn small" @click="fetchConversations" :disabled="convLoading">
                    {{ convLoading ? '刷新中...' : '刷新' }}
                  </button>
                </div>
                <div
                  v-for="c in conversations"
                  :key="c.id"
                  class="conv-item"
                  :class="{ active: selectedConversationId === c.id }"
                  @click="selectConversation(c.id)"
                >
                  <div class="conv-title">{{ c.title }}</div>
                  <div class="conv-meta">{{ new Date(c.updated_at).toLocaleString() }} · {{ c.message_count }} 条</div>
                  <button class="delete-btn" @click.stop="deleteConversation(c.id)">删除</button>
                </div>
                <div v-if="conversations.length === 0" style="padding: 20px; color: #606060; text-align: center;">暂无对话</div>
              </div>
              <div v-if="conversationDetail" class="conv-detail custom-scrollbar">
                <h3>{{ conversationDetail.conversation.title }}</h3>
                <div v-for="msg in conversationDetail.messages" :key="msg.id" class="msg-item" :class="msg.role">
                  <div class="msg-header">{{ msg.role }} · {{ new Date(msg.created_at).toLocaleString() }}</div>
                  <div v-if="msg.image" class="msg-image"><img :src="msg.image" /></div>
                  <div v-if="msg.content" class="msg-content">{{ msg.content }}</div>
                  <div v-if="msg.reasoning" class="msg-reasoning"><strong>思考：</strong>{{ msg.reasoning }}</div>
                  <div v-if="msg.shader_code" class="msg-shader"><pre>{{ msg.shader_code }}</pre></div>
                  <div v-if="msg.tool_calls" class="msg-toolcalls"><pre>{{ JSON.stringify(msg.tool_calls, null, 2) }}</pre></div>
                  <div v-if="msg.raw_response" class="msg-raw">
                    <details>
                      <summary>查看原始 AI 响应</summary>
                      <pre class="raw-content">{{ msg.raw_response }}</pre>
                    </details>
                  </div>
                </div>
              </div>
              <div v-else class="conv-empty">请选择左侧对话查看详情</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: #0a0a0f;
  color: #e0e0f0;
}
.login-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
}
.login-panel input {
  padding: 12px 16px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  width: 260px;
}
.login-panel button {
  padding: 10px 24px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
}
.admin-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #13131f;
  border-bottom: 1px solid #252538;
}
.admin-header h1 {
  margin: 0;
  font-size: 18px;
}
.admin-header button {
  padding: 6px 14px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
}
.admin-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.admin-sidebar {
  width: 180px;
  background: #13131f;
  border-right: 1px solid #252538;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 8px;
}
.admin-sidebar button {
  padding: 10px 14px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #a0a0b0;
  text-align: left;
  cursor: pointer;
}
.admin-sidebar button.active, .admin-sidebar button:hover {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
  color: #fff;
}
.admin-main {
  flex: 1;
  overflow: hidden;
}
.tab-content {
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #252538;
}
.toolbar select {
  padding: 8px 12px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #fff;
}
.refresh-btn {
  padding: 6px 14px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
}
.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.refresh-btn.small {
  padding: 4px 10px;
  font-size: 12px;
}
.table-wrapper {
  flex: 1;
  overflow: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th, .data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #252538;
  text-align: left;
  vertical-align: top;
}
.data-table th {
  color: #808090;
  font-weight: 600;
  background: #0f0f17;
  position: sticky;
  top: 0;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.badge.INFO { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.badge.WARN { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.badge.ERROR { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.metadata {
  margin-top: 6px;
  padding: 8px;
  background: #0f0f17;
  border-radius: 6px;
  font-size: 12px;
  color: #808090;
  white-space: pre-wrap;
  word-break: break-all;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid #252538;
}
.pagination button {
  padding: 6px 14px;
  background: #1a1a2a;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
}
.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.conversations-tab { display: flex; flex-direction: column; }
.split-view { display: flex; height: 100%; }
.conv-list {
  width: 320px;
  overflow-y: auto;
  border-right: 1px solid #252538;
  display: flex;
  flex-direction: column;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #252538;
  font-size: 14px;
  color: #a0a0b0;
}
.conv-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #252538;
  position: relative;
}
.conv-item:hover { background: #1a1a2a; }
.conv-item.active { background: rgba(139, 92, 246, 0.1); }
.conv-title { font-weight: 500; margin-bottom: 4px; }
.conv-meta { font-size: 12px; color: #808090; }
.delete-btn {
  position: absolute;
  right: 12px;
  top: 12px;
  padding: 4px 8px;
  background: rgba(239,68,68,0.2);
  border: none;
  border-radius: 4px;
  color: #fca5a5;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
}
.conv-item:hover .delete-btn { opacity: 1; }
.conv-detail {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.conv-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #505060;
}
.msg-item { margin-bottom: 16px; padding: 14px; border-radius: 10px; }
.msg-item.user { background: rgba(139, 92, 246, 0.12); }
.msg-item.assistant { background: #1a1a2a; }
.msg-item.system { background: #0f0f17; color: #808090; font-size: 13px; }
.msg-item.tool { background: #0f0f17; color: #a0a0b0; font-size: 13px; }
.msg-header { font-size: 12px; color: #808090; margin-bottom: 8px; text-transform: capitalize; }
.msg-content { line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.msg-reasoning { margin-top: 8px; padding: 10px; background: #0f0f17; border-radius: 6px; font-size: 12px; color: #808090; }
.msg-shader pre { margin: 8px 0 0; padding: 10px; background: #0a0a0f; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.msg-toolcalls pre { margin: 8px 0 0; padding: 10px; background: #0a0a0f; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.msg-raw { margin-top: 10px; }
.msg-raw summary { cursor: pointer; color: #8b5cf6; font-size: 12px; }
.raw-content { padding: 10px; background: #0a0a0f; border-radius: 6px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.msg-image img { max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid #252538; margin-top: 8px; }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #353550; border-radius: 3px; }
</style>
