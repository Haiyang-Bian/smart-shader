<template>
  <div class="shader-wrapper">
    <canvas ref="canvas" class="shader-canvas" />
    <div v-if="error" class="shader-error">
      <span>⚠️</span>
      <p>{{ error }}</p>
    </div>
    <div v-else-if="!ready" class="shader-loading">
      <span class="spinner"></span>
      <p>初始化 WebGL...</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  fragmentShader: String
})

const canvas = ref(null)
const error = ref('')
const ready = ref(false)

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
  
  gl = canvas.value.getContext('webgl', { antialias: true })
  if (!gl) {
    error.value = 'WebGL 不支持'
    return
  }
  
  // Resize
  const rect = canvas.value.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.value.width = rect.width * dpr
  canvas.value.height = rect.height * dpr
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
  
  try {
    // Compile
    const v = compile(gl, vs, gl.VERTEX_SHADER)
    const f = compile(gl, props.fragmentShader, gl.FRAGMENT_SHADER)
    
    program = gl.createProgram()
    gl.attachShader(program, v)
    gl.attachShader(program, f)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link failed')
    }
    
    // Geometry
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    
    const pos = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    
    startTime = Date.now()
    ready.value = true
    
    // Render loop
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

watch(() => props.fragmentShader, () => {
  nextTick(init)
})

onMounted(() => {
  nextTick(init)
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
})
</script>

<style scoped>
.shader-wrapper {
  flex: 1;
  position: relative;
  background: #000;
  min-height: 200px;
}

.shader-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

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
</style>
