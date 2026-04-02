import type { ShaderHistoryItem } from '~/types'

const MAX_HISTORY_ITEMS = 50

export function useShaderHistory() {
  const { confirm } = useConfirmDialog()
  const history = ref<ShaderHistoryItem[]>([])
  const currentIndex = ref(-1)

  // 加载历史记录
  function loadHistory() {
    const saved = localStorage.getItem('shader-history')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          history.value = parsed
          currentIndex.value = history.value.length - 1
        }
      } catch (e) {
        console.error('加载历史记录失败:', e)
      }
    }
  }

  // 保存历史记录
  function saveHistory() {
    localStorage.setItem('shader-history', JSON.stringify(history.value))
  }

  // 添加历史记录
  function addHistory(code: string, description?: string, thumbnail?: string) {
    // 如果代码与当前最新的一样，不添加
    if (history.value.length > 0) {
      const last = history.value[history.value.length - 1]
      if (last.code === code) return
    }

    const item: ShaderHistoryItem = {
      id: Date.now().toString(),
      code,
      timestamp: Date.now(),
      description: description || `版本 ${history.value.length + 1}`,
      thumbnail
    }

    // 如果当前不是最新的，删除当前位置之后的记录
    if (currentIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, currentIndex.value + 1)
    }

    history.value.push(item)

    // 限制数量
    if (history.value.length > MAX_HISTORY_ITEMS) {
      history.value.shift()
    }

    currentIndex.value = history.value.length - 1
    saveHistory()
  }

  // 撤销
  function undo(): ShaderHistoryItem | null {
    if (currentIndex.value > 0) {
      currentIndex.value--
      return history.value[currentIndex.value]
    }
    return null
  }

  // 重做
  function redo(): ShaderHistoryItem | null {
    if (currentIndex.value < history.value.length - 1) {
      currentIndex.value++
      return history.value[currentIndex.value]
    }
    return null
  }

  // 可以撤销吗
  const canUndo = computed(() => currentIndex.value > 0)

  // 可以重做吗
  const canRedo = computed(() => currentIndex.value < history.value.length - 1)

  // 获取当前版本
  const current = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < history.value.length) {
      return history.value[currentIndex.value]
    }
    return null
  })

  // 清空历史
  async function clearHistory() {
    const confirmed = await confirm({
      title: '清空历史版本',
      message: '确定要清空所有历史版本吗？',
      confirmText: '清空',
      cancelText: '取消',
      type: 'danger'
    })
    if (confirmed) {
      history.value = []
      currentIndex.value = -1
      localStorage.removeItem('shader-history')
      return true
    }
    return false
  }

  // 获取格式化的历史列表（时间倒序）
  const formattedHistory = computed(() => {
    return [...history.value]
      .map((item, index) => ({
        ...item,
        formattedTime: new Date(item.timestamp).toLocaleString('zh-CN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        isCurrent: index === currentIndex.value
      }))
      .reverse()
  })

  return {
    history,
    currentIndex,
    current,
    canUndo,
    canRedo,
    formattedHistory,
    loadHistory,
    addHistory,
    undo,
    redo,
    clearHistory
  }
}
