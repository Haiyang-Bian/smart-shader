<template>
  <div class="shader-wrapper">
    <canvas ref="canvas" class="shader-canvas" />
    
    <!-- 工具栏 -->
    <div class="shader-toolbar">
      <button 
        class="toolbar-btn" 
        @click="takeScreenshot" 
        title="截图预览"
        :disabled="!ready"
      >
        📷 截图
      </button>
      <button 
        class="toolbar-btn primary"
        @click="sendToChat"
        title="将当前渲染效果发送到对话，让AI改进"
        :disabled="!ready"
      >
        💬 发送到对话
      </button>
      <button 
        class="toolbar-btn" 
        :class="{ 'recording': isRecording }"
        @click="toggleRecording" 
        :disabled="!ready"
      >
        <span v-if="isRecording">⏹ 停止 ({{ formatTime(recordTime) }})</span>
        <span v-else>🎥 录屏</span>
      </button>
      <button 
        v-if="recordedBlob"
        class="toolbar-btn download"
        @click="downloadVideo"
      >
        💾 下载视频
      </button>
    </div>
    
    <!-- 状态提示 -->
    <div v-if="error" class="shader-error">
      <span>⚠️</span>
      <p>{{ error }}</p>
    </div>
    <div v-else-if="!ready" class="shader-loading">
      <span class="spinner"></span>
      <p>初始化 WebGL...</p>
    </div>
    
    <!-- 截图预览弹窗 -->
    <div v-if="screenshotUrl" class="screenshot-modal" @click.self="closeScreenshot">
      <div class="screenshot-content">
        <img :src="screenshotUrl" alt="截图" />
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
  fragmentShader: String
})

const emit = defineEmits(['screenshot-captured'])

const canvas = ref(null)
const error = ref('')
const ready = ref(false)

// 截图相关
const screenshotUrl = ref('')
const screenshotBlob = ref(null)

// 录制相关
const isRecording = ref(false)
const recordedBlob = ref(null)
const recordTime = ref(0)
let mediaRecorder = null
let recordInterval = null
let recordedChunks = []

let gl, program, animId, startTime

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
    gl.deleteShader(s)
    throw new Error('Shader compile: ' + info)
  }
  return s
}

function init() {
  if (!canvas.value) return
  
  error.value = ''
  ready.value = false
  
  if (animId) cancelAnimationFrame(animId)
  
  gl = canvas.value.getContext('webgl', { antialias: true, preserveDrawingBuffer: true })
  if (!gl) {
    error.value = 'WebGL 不支持'
    return
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
      throw new Error('Program link failed')
    }
    
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    
    const pos = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    
    startTime = Date.now()
    ready.value = true
    
    const loop = () => {
      if (!gl || !program || !canvas.value) return
      
      const t = (Date.now() - startTime) / 1000
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
    error.value = e.message
  }
}

function resizeCanvas() {
  if (!canvas.value || !gl) return
  const rect = canvas.value.parentElement.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.value.width = rect.width * dpr
  canvas.value.height = rect.height * dpr
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
}

// ============ 截图功能 ============
async function takeScreenshot(silent = false) {
  if (!canvas.value || !ready.value) return null
  
  const dataUrl = canvas.value.toDataURL('image/png', 1.0)
  
  // 同时创建 blob 用于上传
  const blob = await new Promise(resolve => {
    canvas.value.toBlob(resolve, 'image/png', 1.0)
  })
  
  if (!silent) {
    screenshotUrl.value = dataUrl
    screenshotBlob.value = blob
  }
  
  return { dataUrl, blob }
}

function closeScreenshot() {
  screenshotUrl.value = ''
  screenshotBlob.value = null
}

function downloadScreenshot() {
  if (!screenshotUrl.value) return
  
  const link = document.createElement('a')
  link.download = `shader-${Date.now()}.png`
  link.href = screenshotUrl.value
  link.click()
}

// ============ 发送到对话功能 ============
function sendToChat() {
  takeScreenshot()
  // 截图后弹窗显示，用户确认后再发送
}

async function confirmSendToChat() {
  if (!screenshotUrl.value) return
  
  // 发送事件给父组件 - 用户手动发送不压缩
  emit('screenshot-captured', {
    dataUrl: screenshotUrl.value,
    blob: screenshotBlob.value,
    timestamp: Date.now()
  })
  
  closeScreenshot()
  
  // 显示提示
  showToast('截图已添加到输入框，添加描述后发送即可')
}

function showToast(message) {
  // 简单的 toast 提示
  const toast = document.createElement('div')
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #8b5cf6;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    animation: fadeInOut 2s ease;
  `
  toast.textContent = message
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.remove()
  }, 2000)
}

// ============ 视频录制功能 ============
function toggleRecording() {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}

function startRecording() {
  if (!canvas.value || !ready.value) return
  
  recordedChunks = []
  recordedBlob.value = null
  recordTime.value = 0
  
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
    alert('您的浏览器不支持视频录制')
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
    recordedBlob.value = new Blob(recordedChunks, { type: selectedMimeType })
  }
  
  mediaRecorder.start(100)
  isRecording.value = true
  
  recordInterval = setInterval(() => {
    recordTime.value++
    if (recordTime.value >= 30) {
      stopRecording()
    }
  }, 1000)
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  
  mediaRecorder.stop()
  isRecording.value = false
  
  if (recordInterval) {
    clearInterval(recordInterval)
    recordInterval = null
  }
}

function downloadVideo() {
  if (!recordedBlob.value) return
  
  const url = URL.createObjectURL(recordedBlob.value)
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

// 暴露方法给父组件
defineExpose({
  takeScreenshot,
  closeScreenshot,
  screenshotUrl
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  if (recordInterval) clearInterval(recordInterval)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  window.removeEventListener('resize', resizeCanvas)
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

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
  20% { opacity: 1; transform: translateX(-50%) translateY(0); }
  80% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
}
</style>
