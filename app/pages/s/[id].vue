<script setup lang="ts">
// Public, read-only preview of a shared shader.
// Loads the shader by its short id and renders it via the existing ShaderRenderer.
// No chat / no toolbar — the page is intentionally minimal.

import { useRoute } from 'vue-router'

const route = useRoute()
const id = String(route.params.id)

const { data, error } = await useFetch(`/api/share/${id}`, {
  key: `share-${id}`,
  server: true
})

const fragmentShader = computed(() => data.value?.code ?? '')
</script>

<template>
  <div class="shared-page">
    <header class="header">
      <h1>{{ data?.title || 'Shared Shader' }}</h1>
      <span v-if="data" class="meta">{{ data.views }} 次浏览 · {{ new Date(data.createdAt).toLocaleString() }}</span>
    </header>

    <div v-if="error" class="error">
      <h2>无法加载该 shader</h2>
      <p>{{ error.statusMessage || error.message }}</p>
    </div>

    <ShaderRenderer
      v-else-if="fragmentShader"
      :fragment-shader="fragmentShader"
      :show-fps="true"
    />

    <footer class="footer">
      <NuxtLink to="/">在 Smart Shader 中打开</NuxtLink>
    </footer>
  </div>
</template>

<style scoped>
.shared-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg-base);
  color: #e5e5f0;
}
.header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-bg-elevated-2);
}
.header h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.meta {
  font-size: 12px;
  color: #a0a0b0;
}
.error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #ef4444;
}
.footer {
  padding: 12px 24px;
  border-top: 1px solid var(--color-bg-elevated-2);
  text-align: center;
}
.footer a {
  color: var(--color-accent);
  text-decoration: none;
  font-size: 13px;
}
.footer a:hover {
  text-decoration: underline;
}
</style>