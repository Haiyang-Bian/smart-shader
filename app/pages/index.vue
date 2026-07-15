<template>
  <div class="app">
    <!-- 侧边栏 - 代码和预览 -->
    <aside
      ref="sidebarEl"
      class="sidebar custom-scrollbar"
      :class="{ collapsed: sidebarCollapsed, resizing: isResizingSidebar }"
    >
      <div class="sidebar-header">
        <button class="toggle-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <span v-if="sidebarCollapsed">→</span>
          <span v-else>←</span>
        </button>
        <span v-if="!sidebarCollapsed" class="sidebar-title">预览 & 代码</span>
      </div>

      <div v-if="!sidebarCollapsed" class="sidebar-content">
        <!-- 预览区 -->
        <div ref="previewSectionEl" class="preview-section">
          <div class="section-title">🎨 实时预览</div>
          <ShaderRenderer
            ref="shaderRenderer"
            :fragment-shader="currentShader"
            @screenshot-captured="onScreenshotCaptured"
            @compile-error="onCompileError"
            @compile-success="onCompileSuccess"
          />
        </div>

        <!-- 拖拽条 -->
        <div
          class="resize-handle-horizontal"
          @mousedown="startResizePreview"
        />

        <!-- 历史版本 -->
        <ShaderHistory
          :formatted-history="shaderHistory.formattedHistory.value"
          :can-undo="shaderHistory.canUndo.value"
          :can-redo="shaderHistory.canRedo.value"
          @undo="handleUndo"
          @redo="handleRedo"
          @restore="handleRestore"
          @clear="handleClearHistory"
        />

        <!-- 代码区 -->
        <div ref="codeSectionEl" class="code-section">
          <div class="section-header">
            <span class="section-title">📝 代码</span>
            <div class="code-actions">
              <button
                class="icon-btn"
                title="保存当前版本"
                @click="saveToHistory"
              >
                💾
              </button>
              <button class="icon-btn" title="重置" @click="resetShader">
                ↺
              </button>
            </div>
          </div>
          <CodeEditor
            ref="codeEditor"
            v-model="currentShader"
            @send-to-chat="onCodeSendToChat"
          />
        </div>
      </div>
    </aside>

    <!-- 垂直拖拽条 -->
    <div
      v-if="!sidebarCollapsed"
      class="resize-handle-vertical"
      @mousedown="startResizeSidebar"
    />

    <!-- 主体 - 对话框 -->
    <main class="main custom-scrollbar">
      <ChatInterface
        ref="chatInterface"
        @shader-generated="onShaderGenerated"
        @request-screenshot="onRequestScreenshot"
        @request-code="onRequestCode"
        @request-compile-status="onRequestCompileStatus"
        @request-code-range="onRequestCodeRange"
        @modify-code-range="onModifyCodeRange"
        @insert-code="onInsertCode"
      />
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import ShaderRenderer from '~/components/ShaderRenderer.vue'
import ShaderHistory from '~/components/ShaderHistory.vue'
import ChatInterface from '~/components/ChatInterface.vue'

const defaultShader = `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  // Create animated gradient
  vec3 color = vec3(
    0.5 + 0.5 * sin(u_time + uv.x * 3.14159),
    0.5 + 0.5 * sin(u_time + uv.y * 3.14159 + 2.0),
    0.5 + 0.5 * sin(u_time + (uv.x + uv.y) * 3.14159 + 4.0)
  );

  gl_FragColor = vec4(color, 1.0);
}`

const currentShader = ref(defaultShader)
const sidebarCollapsed = ref(false)
const chatInterface = ref(null)
const shaderRenderer = ref(null)
const codeEditor = ref(null)

// 历史版本管理
const shaderHistory = useShaderHistory()
const toast = useCustomToast()

// 监听代码变化自动保存历史
let historyDebounceTimer = null
watch(currentShader, (newCode) => {
  if (historyDebounceTimer) clearTimeout(historyDebounceTimer)
  historyDebounceTimer = setTimeout(() => {
    shaderHistory.addHistory(newCode, '自动保存')
  }, 5000) // 5秒后自动保存
}, { immediate: false })

// 拖拽相关
const sidebarEl = ref(null)
const previewSectionEl = ref(null)
const isResizingSidebar = ref(false)
const isResizingPreview = ref(false)

const onShaderGenerated = (code) => {
  currentShader.value = code
  shaderHistory.addHistory(code, 'AI生成')
}

const resetShader = () => {
  currentShader.value = defaultShader
  shaderHistory.addHistory(defaultShader, '重置为默认')
}

// 手动保存到历史
const saveToHistory = () => {
  shaderHistory.addHistory(currentShader.value, '手动保存')
  toast.success('已保存到历史版本')
}

// 历史版本操作
const handleUndo = () => {
  const item = shaderHistory.undo()
  if (item) {
    currentShader.value = item.code
    toast.info(`已恢复到: ${item.description}`)
  }
}

const handleRedo = () => {
  const item = shaderHistory.redo()
  if (item) {
    currentShader.value = item.code
    toast.info(`已前进到: ${item.description}`)
  }
}

const handleRestore = (code) => {
  currentShader.value = code
  toast.success('已恢复选中版本')
}

const handleClearHistory = async () => {
  if (await shaderHistory.clearHistory()) {
    toast.success('历史记录已清空')
  }
}

// 编译状态回调
const onCompileError = (status) => {
  console.error('Shader compile error:', status.error)
}

const onCompileSuccess = (status) => {
  // 编译成功，可选操作
}

// 接收截图并发送到对话
const onScreenshotCaptured = (imageData) => {
  if (chatInterface.value) {
    chatInterface.value.addScreenshot(imageData)
  }
}

// 接收代码并发送到对话
const onCodeSendToChat = (codeData) => {
  if (chatInterface.value) {
    chatInterface.value.addCodeBlock(codeData.content)
  }
}

// 处理 AI 工具调用 - 截图（压缩为512x512以节省token）
const onRequestScreenshot = async ({ callback }) => {
  if (shaderRenderer.value) {
    const result = await shaderRenderer.value.takeScreenshot(true)
    if (result && result.dataUrl) {
      // 压缩图片为512x512，保持纵横比
      const compressedImage = await compressImage(result.dataUrl, 512)
      callback(compressedImage)
      shaderRenderer.value.closeScreenshot()
    } else {
      callback(null)
    }
  } else {
    callback(null)
  }
}

// 压缩图片，保持纵横比，限制最大尺寸
async function compressImage(dataUrl, maxSize) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // 计算缩放后的尺寸，保持纵横比
      let width = img.width
      let height = img.height
      const maxDim = Math.max(width, height)

      if (maxDim > maxSize) {
        const scale = maxSize / maxDim
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      // 创建canvas进行压缩
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      // 使用高质量缩放
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      // 转换为JPEG格式，质量0.9，平衡质量和大小
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => resolve(dataUrl) // 失败时返回原图
    img.src = dataUrl
  })
}

// 处理 AI 工具调用 - 获取代码
const onRequestCode = ({ callback }) => {
  callback(currentShader.value)
}

// 处理 AI 工具调用 - 获取编译状态
const onRequestCompileStatus = ({ callback }) => {
  if (shaderRenderer.value) {
    callback(shaderRenderer.value.getCompileStatus())
  } else {
    callback({ success: false, error: 'Renderer not ready' })
  }
}

// 处理 AI 工具调用 - 获取代码行范围
const onRequestCodeRange = ({ startLine, endLine, callback }) => {
  if (codeEditor.value) {
    const code = codeEditor.value.getCodeRange(startLine, endLine)
    callback(code)
  } else {
    callback('')
  }
}

// 处理 AI 工具调用 - 修改代码行范围
const onModifyCodeRange = ({ startLine, endLine, newCode, callback }) => {
  if (codeEditor.value) {
    const fullCode = codeEditor.value.modifyCodeRange(startLine, endLine, newCode)
    currentShader.value = fullCode
    callback(fullCode)
  } else {
    callback('')
  }
}

// 处理 AI 工具调用 - 插入代码
const onInsertCode = ({ lineNumber, newCode, callback }) => {
  if (codeEditor.value) {
    const fullCode = codeEditor.value.insertCodeAfter(lineNumber, newCode)
    currentShader.value = fullCode
    callback(fullCode)
  } else {
    callback('')
  }
}

// ========== 侧边栏宽度拖拽 ==========
function startResizeSidebar(e) {
  if (sidebarCollapsed.value) return
  isResizingSidebar.value = true
  const startX = e.clientX
  const startWidth = sidebarEl.value.offsetWidth
  const minWidth = 360
  const maxWidth = 800

  function onMouseMove(e) {
    const delta = e.clientX - startX
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta))
    sidebarEl.value.style.width = newWidth + 'px'
  }

  function onMouseUp() {
    isResizingSidebar.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ========== 预览区高度拖拽 ==========
function startResizePreview(e) {
  isResizingPreview.value = true
  const startY = e.clientY
  const startHeight = previewSectionEl.value.offsetHeight
  const containerHeight = sidebarEl.value.querySelector('.sidebar-content').offsetHeight
  const minHeight = 150
  const maxHeight = containerHeight - 200

  function onMouseMove(e) {
    const delta = e.clientY - startY
    const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta))
    previewSectionEl.value.style.height = newHeight + 'px'
    previewSectionEl.value.style.flex = 'none'
  }

  function onMouseUp() {
    isResizingPreview.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 加载历史记录
onMounted(() => {
  shaderHistory.loadHistory()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--color-bg-base);
  color: #fff;
  height: 100vh;
  overflow: hidden;
}

/* 全局自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #353550;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #4a4a6a;
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: #353550 transparent;
}

.app {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* 侧边栏 */
.sidebar {
  width: 45%;
  min-width: 360px;
  max-width: 800px;
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-bg-elevated-2);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, min-width 0.3s ease;
  overflow: auto;
  position: relative;
}

.sidebar.resizing {
  transition: none;
}

.sidebar.collapsed {
  width: 44px !important;
  min-width: 44px !important;
  max-width: 44px !important;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
  flex-shrink: 0;
}

.toggle-btn {
  width: 28px;
  height: 28px;
  background: var(--color-bg-elevated-2);
  border: none;
  border-radius: 6px;
  color: #a0a0b0;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toggle-btn:hover {
  background: #353550;
  color: #fff;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0f0;
  white-space: nowrap;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  height: calc(100% - 45px);
}

.preview-section {
  height: 45%;
  min-height: 150px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
  display: flex;
  flex-direction: column;
  position: relative;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #808090;
  padding: 12px 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.code-actions {
  display: flex;
  gap: 4px;
  margin-right: 12px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: #808090;
  cursor: pointer;
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--color-bg-elevated-2);
  color: #fff;
}

.code-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  overflow: hidden;
  position: relative;
}

/* 垂直拖拽条 */
.resize-handle-vertical {
  width: 6px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  z-index: 10;
  transition: background 0.2s;
}

.resize-handle-vertical:hover {
  background: var(--color-accent);
}

/* 水平拖拽条 */
.resize-handle-horizontal {
  height: 6px;
  background: var(--color-bg-elevated-2);
  cursor: row-resize;
  flex-shrink: 0;
  z-index: 10;
  transition: background 0.2s;
}

.resize-handle-horizontal:hover {
  background: var(--color-accent);
}

/* 主体区域 */
.main {
  flex: 1;
  min-width: 360px;
  overflow: hidden;
}

/* 响应式 */
@media (max-width: 900px) {
  .app {
    flex-direction: column;
  }

  .sidebar {
    width: 100% !important;
    min-width: auto !important;
    max-width: none !important;
    height: 40%;
    border-right: none;
    border-bottom: 1px solid var(--color-bg-elevated-2);
  }

  .sidebar.collapsed {
    width: 100% !important;
    height: 44px;
    min-width: auto !important;
  }

  .resize-handle-vertical,
  .resize-handle-horizontal {
    display: none;
  }

  .main {
    min-width: auto;
    height: 60%;
  }
}

/* 自定义滚动条类 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #353550;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #4a4a6a;
}

.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #353550 transparent;
}
</style>
