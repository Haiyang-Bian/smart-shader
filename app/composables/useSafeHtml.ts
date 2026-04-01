// 安全的 HTML 转义，防止 XSS 攻击

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;'
}

const escapeRegex = /[&<>"'/]/g

function escapeHtml(text: string): string {
  return text.replace(escapeRegex, char => escapeMap[char])
}

// 格式化消息为安全的 HTML
export function useSafeHtml() {
  function formatMessage(text: string): string {
    if (!text) return ''

    // 先转义 HTML，防止 XSS
    let safeText = escapeHtml(text)

    // 代码块 (```...```) - 在转义后处理
    safeText = safeText.replace(/```([\s\S]*?)```/g, (match, code) => {
      // 代码内容已经转义，不需要再转义
      return `<pre><code>${code}</code></pre>`
    })

    // 行内代码 (`...`)
    safeText = safeText.replace(/`([^`]+)`/g, '<code>$1</code>')

    // 粗体 (**...**)
    safeText = safeText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

    // 斜体 (*...*)
    safeText = safeText.replace(/\*([^*]+)\*/g, '<em>$1</em>')

    // 换行
    safeText = safeText.replace(/\n/g, '<br>')

    return safeText
  }

  // 纯文本格式化（不转义 HTML，用于显示代码块内的内容）
  function formatPlainText(text: string): string {
    if (!text) return ''

    return escapeHtml(text)
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
  }

  return {
    formatMessage,
    formatPlainText,
    escapeHtml
  }
}
