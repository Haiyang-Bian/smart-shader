<template>
  <div class="app">
    <!-- 侧边栏 - 代码和预览 -->
    <aside class="sidebar custom-scrollbar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <button class="toggle-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <span v-if="sidebarCollapsed">→</span>
          <span v-else>←</span>
        </button>
        <span v-if="!sidebarCollapsed" class="sidebar-title">预览 & 代码</span>
      </div>
      
      <div v-if="!sidebarCollapsed" class="sidebar-content">
        <!-- 预览区 -->
        <div class="preview-section">
          <div class="section-title">🎨 实时预览</div>
          <ShaderRenderer :fragment-shader="currentShader" />
        </div>
        
        <!-- 代码区 -->
        <div class="code-section">
          <div class="section-header">
            <span class="section-title">📝 代码</span>
            <button class="icon-btn" @click="resetShader" title="重置">↺</button>
          </div>
          <CodeEditor v-model="currentShader" />
        </div>
      </div>
    </aside>
    
    <!-- 主体 - 对话框 -->
    <main class="main custom-scrollbar">
      <ChatInterface 
        @shader-generated="onShaderGenerated" 
      />
    </main>
  </div>
</template>

<script setup>
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

const onShaderGenerated = (code) => {
  currentShader.value = code
}

const resetShader = () => {
  currentShader.value = defaultShader
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #0a0a0f;
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
  max-width: 560px;
  background: #13131f;
  border-right: 1px solid #252538;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, min-width 0.3s ease;
  overflow: auto;
}

.sidebar.collapsed {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #252538;
  flex-shrink: 0;
}

.toggle-btn {
  width: 28px;
  height: 28px;
  background: #252538;
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
}

.preview-section {
  height: 45%;
  min-height: 200px;
  border-bottom: 1px solid #252538;
  display: flex;
  flex-direction: column;
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

.icon-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: #808090;
  cursor: pointer;
  font-size: 16px;
  margin-right: 12px;
  border-radius: 6px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #252538;
  color: #fff;
}

.code-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  overflow: hidden;
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
    border-bottom: 1px solid #252538;
  }
  
  .sidebar.collapsed {
    width: 100% !important;
    height: 44px;
    min-width: auto !important;
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
