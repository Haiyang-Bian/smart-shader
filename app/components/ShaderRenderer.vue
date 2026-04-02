<template>
  <div class="shader-wrapper">
    <canvas ref="canvas" class="shader-canvas" />

    <!-- FPS 指示器 -->
    <div v-if="showFps" class="fps-indicator" :class="{ 'low-performance': fpsMonitor.isLowPerformance.value }">
      <span class="fps-dot" :style="{ background: fpsMonitor.fpsDisplay.value.color }" />
      <span class="fps-text">{{ fpsMonitor.fpsDisplay.value.text }}</span>
      <span v-if="fpsMonitor.isLowPerformance.value" class="fps-warning" title="性能较低，建议简化着色器">⚠️</span>
    </div>

    <!-- 工具栏 -->
    <div class="shader-toolbar">
      <button
        class="toolbar-btn"
        @click="takeScreenshot"
        title="截图预览"
        :disabled="!state.ready"
      >
        📷 截图
      </button>
      <button
        class="toolbar-btn primary"
        @click="sendToChat"
        title="将当前渲染效果发送到对话，让AI改进"
        :disabled="!state.ready"
      >
        💬 发送到对话
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'recording': state.isRecording }"
        @click="toggleRecording"
        :disabled="!state.ready"
      >
        <span v-if="state.isRecording">⏹ 停止 ({{ formatTime(state.recordTime) }})</span>
        <span v-else>🎥 录屏</span>
      </button>
      <button
        v-if="state.recordedBlob"
        class="toolbar-btn download"
        @click="downloadVideo"
      >
        💾 下载视频
      </button>
    </div>

    <!-- 状态提示 -->
    <div v-if="state.error" class="shader-error">
      <span>⚠️</span>
      <p>{{ state.error }}</p>
      <details v-if="state.compileError">
        <summary>查看详细错误</summary>
        <pre>{{ state.compileError }}</pre>
      </details>
    </div>
    <div v-else-if="!state.ready" class="shader-loading">
      <span class="spinner"></span>
      <p>初始化 WebGL...</p>
    </div>

    <!-- 截图预览弹窗 -->
    <div v-if="state.screenshotUrl" class="screenshot-modal" @click.self="closeScreenshot">
      <div class="screenshot-content">
        <img :src="state.screenshotUrl" alt="截图" />
        <div class="screenshot-actions">
          <button class="btn-primary" @click="confirmSendToChat">
            💬 发送到对话
          </button>
          <button @click="downloadScreenshot">💾 下载</button>
          <button @click="closeScreenshot">关闭</button>
        </div>
        <p class="screenshot-hint">截图将附加到你的下一条消息中发送给AI</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  fragmentShader: String,
  showFps: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['screenshot-captured', 'compile-error', 'compile-success'])

const canvas = ref(null)
const fpsMonitor = useFpsMonitor()
const toast = useCustomToast()

const state = reactive({
  ready: false,
  error: '',
  compileError: '',
  screenshotUrl: '',
  screenshotBlob: null,
  isRecording: false,
  recordedBlob: null,
  recordTime: 0
})

let gl, program, animId, startTime
let mediaRecorder = null
let recordInterval = null
let recordedChunks = []

const vs = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

function compile(gl, src, type) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s)
    state.compileError = 'Shader compile error: ' + (info || 'unknown')
    gl.deleteShader(s)
    throw new Error('Shader compile: ' + info)
  }
  return s
}

function init() {
  if (!canvas.value) return

  state.error = ''
  state.compileError = ''
  state.ready = false

  if (animId) cancelAnimationFrame(animId)

  gl = canvas.value.getContext('webgl', {
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  })

  if (!gl) {
    state.error = 'WebGL 不支持'
    state.compileError = 'WebGL not supported'
    emit('compile-error', { success: false, error: 'WebGL not supported' })
    return
  }

  // 检查 WebGL 扩展
  const loseContext = gl.getExtension('WEBGL_lose_context')
  if (loseContext) {
    canvas.value.addEventListener('webglcontextlost', handleContextLost)
    canvas.value.addEventListener('webglcontextrestored', handleContextRestored)
  }

  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  try {
    const v = compile(gl, vs, gl.VERTEX_SHADER)
    const f = compile(gl, props.fragmentShader, gl.FRAGMENT_SHADER)

    program = gl.createProgram()
    gl.attachShader(program, v)
    gl.attachShader(program, f)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      state.compileError = 'Program link error: ' + (info || 'unknown')
      throw new Error('Program link failed: ' + info)
    }

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)

    const pos = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    startTime = performance.now()
    state.ready = true
    emit('compile-success', { success: true, error: null })

    fpsMonitor.start()

    const loop = () => {
      if (!gl || !program || !canvas.value) return

      const t = (performance.now() - startTime) / 1000
      const w = canvas.value.width
      const h = canvas.value.height

      gl.useProgram(program)

      const tLoc = gl.getUniformLocation(program, 'u_time')
      const rLoc = gl.getUniformLocation(program, 'u_resolution')

      if (tLoc) gl.uniform1f(tLoc, t)
      if (rLoc) gl.uniform2f(rLoc, w, h)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animId = requestAnimationFrame(loop)
    }

    loop()
  } catch (e) {
    state.error = e.message
    if (!state.compileError) {
      state.compileError = e.message
    }
    emit('compile-error', { success: false, error: e.message })
  }
}

function handleContextLost(e) {
  e.preventDefault()
  state.error = 'WebGL 上下文丢失，尝试恢复...'
  fpsMonitor.stop()
}

function handleContextRestored() {
  state.error = ''
  nextTick(() => init())
}

function resizeCanvas() {
  if (!canvas.value || !gl) return
  const rect = canvas.value.parentElement.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2) // 限制 DPR 避免性能问题
  canvas.value.width = rect.width * dpr
  canvas.value.height = rect.height * dpr
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
}

// ============ 截图功能 ============
async function takeScreenshot(silent = false) {
  if (!canvas.value || !state.ready) return null

  const dataUrl = canvas.value.toDataURL('image/png', 1.0)

  const blob = await new Promise(resolve => {
    canvas.value.toBlob(resolve, 'image/png', 1.0)
  })

  if (!silent) {
    state.screenshotUrl = dataUrl
    state.screenshotBlob = blob
  }

  return { dataUrl, blob }
}

function closeScreenshot() {
  state.screenshotUrl = ''
  state.screenshotBlob = null
}

function downloadScreenshot() {
  if (!state.screenshotUrl) return

  const link = document.createElement('a')
  link.download = `shader-${Date.now()}.png`
  link.href = state.screenshotUrl
  link.click()
  toast.success('截图已下载')
}

// ============ 发送到对话功能 ============
function sendToChat() {
  takeScreenshot()
}

async function confirmSendToChat() {
  if (!state.screenshotUrl) return

  emit('screenshot-captured', {
    dataUrl: state.screenshotUrl,
    blob: state.screenshotBlob,
    timestamp: Date.now()
  })

  closeScreenshot()
  toast.success('截图已添加到输入框，添加描述后发送即可')
}

// ============ 视频录制功能 ============
function toggleRecording() {
  if (state.isRecording) {
    stopRecording()
  } else {
    startRecording()
  }
}

function startRecording() {
  if (!canvas.value || !state.ready) return

  recordedChunks = []
  state.recordedBlob = null
  state.recordTime = 0

  const stream = canvas.value.captureStream(60)

  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ]

  let selectedMimeType = ''
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      selectedMimeType = type
      break
    }
  }

  if (!selectedMimeType) {
    toast.error('您的浏览器不支持视频录制')
    return
  }

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: selectedMimeType,
    videoBitsPerSecond: 8000000
  })

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data)
    }
  }

  mediaRecorder.onstop = () => {
    state.recordedBlob = new Blob(recordedChunks, { type: selectedMimeType })
  }

  mediaRecorder.start(100)
  state.isRecording = true

  recordInterval = setInterval(() => {
    state.recordTime++
    if (state.recordTime >= 30) {
      stopRecording()
    }
  }, 1000)

  toast.info('开始录制，最长 30 秒')
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return

  mediaRecorder.stop()
  state.isRecording = false

  if (recordInterval) {
    clearInterval(recordInterval)
    recordInterval = null
  }

  toast.success('录制完成，可以点击下载按钮保存')
}

function downloadVideo() {
  if (!state.recordedBlob) return

  const url = URL.createObjectURL(state.recordedBlob)
  const link = document.createElement('a')
  link.download = `shader-video-${Date.now()}.webm`
  link.href = url
  link.click()

  URL.revokeObjectURL(url)
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

watch(() => props.fragmentShader, () => {
  nextTick(init)
})

onMounted(() => {
  nextTick(init)
})

function getCompileStatus() {
  if (!state.ready && !state.compileError) {
    return { success: false, error: 'Shader not initialized yet' }
  }
  if (state.compileError) {
    return { success: false, error: state.compileError }
  }
  return { success: true, error: null }
}

defineExpose({
  takeScreenshot,
  closeScreenshot,
  getCompileStatus
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  if (recordInterval) clearInterval(recordInterval)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  if (canvas.value) {
    canvas.value.removeEventListener('webglcontextlost', handleContextLost)
    canvas.value.removeEventListener('webglcontextrestored', handleContextRestored)
  }
  window.removeEventListener('resize', resizeCanvas)
  fpsMonitor.stop()
})
</script>

<style scoped>
.shader-wrapper {
  flex: 1;
  position: relative;
  background: #000;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.shader-canvas {
  flex: 1;
  width: 100%;
  min-height: 0;
}

/* FPS 指示器 */
.fps-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  font-size: 12px;
  color: #fff;
  backdrop-filter: blur(4px);
  z-index: 10;
}

.fps-indicator.low-performance {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.5);
}

.fps-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.fps-warning {
  cursor: help;
}

/* 工具栏 */
.shader-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #13131f;
  border-top: 1px solid #252538;
  flex-wrap: wrap;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #e0e0f0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: #353550;
  border-color: #8b5cf6;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn.primary {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  border-color: transparent;
  color: white;
}

.toolbar-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
  border-color: transparent;
}

.toolbar-btn.recording {
  background: #ef4444;
  border-color: #ef4444;
  animation: pulse 1s ease-in-out infinite;
}

.toolbar-btn.download {
  background: #22c55e;
  border-color: #22c55e;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 错误和加载状态 */
.shader-error, .shader-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  text-align: center;
  background: #0a0a0f;
}

.shader-error {
  color: #ef4444;
}

.shader-loading {
  color: #606070;
}

.shader-error details {
  margin-top: 12px;
  color: #808090;
  font-size: 12px;
}

.shader-error details summary {
  cursor: pointer;
  margin-bottom: 8px;
}

.shader-error details pre {
  text-align: left;
  background: #1a1a2a;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-all;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #353550;
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 截图预览弹窗 */
.screenshot-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.screenshot-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.screenshot-content img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 2px solid #353550;
}

.screenshot-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.screenshot-actions button {
  padding: 10px 20px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 8px;
  color: #e0e0f0;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.screenshot-actions button:hover {
  background: #353550;
  border-color: #8b5cf6;
}

.screenshot-actions .btn-primary {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  border-color: transparent;
  color: white;
}

.screenshot-actions .btn-primary:hover {
  opacity: 0.9;
  border-color: transparent;
}

.screenshot-hint {
  color: #808090;
  font-size: 13px;
  text-align: center;
  margin: 0;
}
</style>
