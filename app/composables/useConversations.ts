import type { Conversation, Message, AISettings } from '~/types'

const STORAGE_KEY = 'shader-conversations'
const CURRENT_ID_KEY = 'shader-current-conversation'

export function useConversations() {
  const conversations = ref<Conversation[]>([])
  const currentId = ref<string | null>(null)

  // 当前对话
  const currentConversation = computed(() => {
    return conversations.value.find(c => c.id === currentId.value) || null
  })

  // 当前对话的消息
  const currentMessages = computed(() => {
    return currentConversation.value?.messages || []
  })

  // 对话列表（按更新时间排序）
  const sortedConversations = computed(() => {
    return [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  })

  // 加载对话数据
  function loadConversations() {
    // 首先尝试迁移旧数据
    migrateOldData()

    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          conversations.value = parsed
        }
      } catch (e) {
        console.error('加载对话失败:', e)
      }
    }

    const savedCurrentId = localStorage.getItem(CURRENT_ID_KEY)
    if (savedCurrentId) {
      currentId.value = savedCurrentId
    }

    // 如果没有对话，创建一个默认对话
    if (conversations.value.length === 0) {
      createConversation('新对话')
    }
  }

  // 迁移旧对话数据
  function migrateOldData() {
    const oldKey = 'shader-chat-history'
    const oldData = localStorage.getItem(oldKey)
    if (!oldData) return

    try {
      const messages = JSON.parse(oldData)
      if (Array.isArray(messages) && messages.length > 0) {
        // 创建一个新对话并迁移旧消息
        const id = Date.now().toString(36)
        const firstUserMsg = messages.find((m: any) => m.role === 'user')
        const title = firstUserMsg
          ? generateTitleFromContent(firstUserMsg.content)
          : '历史对话'

        const conversation: Conversation = {
          id,
          title,
          messages: messages.map((m: any) => ({
            ...m,
            id: m.id || Date.now() + Math.random(),
            timestamp: m.timestamp || Date.now()
          })),
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        conversations.value = [conversation]
        currentId.value = id
        saveConversations()

        // 删除旧数据，避免重复迁移
        localStorage.removeItem(oldKey)
        console.log('旧对话数据已迁移')
      }
    } catch (e) {
      console.error('迁移旧数据失败:', e)
    }
  }

  // 保存对话数据
  function saveConversations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.value))
    if (currentId.value) {
      localStorage.setItem(CURRENT_ID_KEY, currentId.value)
    }
  }

  // 创建新对话
  function createConversation(title?: string): Conversation {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2)
    const conversation: Conversation = {
      id,
      title: title || generateTitle(),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    conversations.value.push(conversation)
    currentId.value = id
    saveConversations()
    return conversation
  }

  // 切换当前对话
  function switchConversation(id: string) {
    if (conversations.value.find(c => c.id === id)) {
      currentId.value = id
      localStorage.setItem(CURRENT_ID_KEY, id)
    }
  }

  // 删除对话
  function deleteConversation(id: string): boolean {
    const index = conversations.value.findIndex(c => c.id === id)
    if (index === -1) return false

    conversations.value.splice(index, 1)

    // 如果删除的是当前对话，切换到其他对话
    if (currentId.value === id) {
      if (conversations.value.length > 0) {
        currentId.value = sortedConversations.value[0].id
      } else {
        currentId.value = null
        // 创建一个默认对话
        createConversation('新对话')
      }
    }

    saveConversations()
    return true
  }

  // 更新对话标题
  function updateTitle(id: string, title: string) {
    const conversation = conversations.value.find(c => c.id === id)
    if (conversation) {
      conversation.title = title
      conversation.updatedAt = Date.now()
      saveConversations()
    }
  }

  // 自动更新标题（基于第一条用户消息）
  function autoUpdateTitle(id: string) {
    const conversation = conversations.value.find(c => c.id === id)
    if (!conversation) return

    // 如果标题是默认的，尝试从第一条用户消息生成
    if (conversation.title === '新对话' || conversation.title.startsWith('对话 ')) {
      const firstUserMsg = conversation.messages.find(m => m.role === 'user')
      if (firstUserMsg) {
        const newTitle = generateTitleFromContent(firstUserMsg.content)
        conversation.title = newTitle
        conversation.updatedAt = Date.now()
        saveConversations()
      }
    }
  }

  // 更新对话消息
  function updateMessages(id: string, messages: Message[]) {
    const conversation = conversations.value.find(c => c.id === id)
    if (conversation) {
      conversation.messages = messages
      conversation.updatedAt = Date.now()
      saveConversations()

      // 如果是当前对话，尝试自动更新标题
      if (id === currentId.value && messages.length > 0) {
        autoUpdateTitle(id)
      }
    }
  }

  // 清空所有对话
  function clearAllConversations() {
    if (confirm('确定要删除所有对话吗？此操作不可恢复。')) {
      conversations.value = []
      currentId.value = null
      createConversation('新对话')
      return true
    }
    return false
  }

  // 生成默认标题
  function generateTitle(): string {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    return `对话 ${timeStr}`
  }

  // 从内容生成标题
  function generateTitleFromContent(content: string): string {
    // 清理内容
    const cleanContent = content
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .replace(/\[code\][\s\S]*?\[\/code\]/g, '') // 移除 [code] 标签
      .replace(/[\n\r]/g, ' ') // 替换换行
      .trim()

    // 取前 20 个字符
    if (cleanContent.length <= 20) {
      return cleanContent || '新对话'
    }
    return cleanContent.substring(0, 20) + '...'
  }

  return {
    conversations,
    currentId,
    currentConversation,
    currentMessages,
    sortedConversations,
    loadConversations,
    saveConversations,
    createConversation,
    switchConversation,
    deleteConversation,
    updateTitle,
    autoUpdateTitle,
    updateMessages,
    clearAllConversations
  }
}
