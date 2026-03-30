<template>
  <div class="editor-wrapper">
    <div v-if="!isClient" class="editor-placeholder">
      <p>加载编辑器...</p>
    </div>
    <div v-else ref="editorEl" class="editor" />
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue'])

const isClient = ref(false)
const editorEl = ref(null)
let editor = null

onMounted(async () => {
  isClient.value = true
  await nextTick()
  
  if (!editorEl.value) return
  
  const monaco = await import('monaco-editor')
  
  // GLSL language
  monaco.languages.register({ id: 'glsl' })
  monaco.languages.setMonarchTokensProvider('glsl', {
    tokenizer: {
      root: [
        [/\b(precision|attribute|uniform|varying|const|in|out)\b/, 'keyword'],
        [/\b(void|bool|int|float|vec2|vec3|vec4|mat2|mat3|mat4|sampler2D)\b/, 'type'],
        [/\b(if|else|for|while|return|break|continue)\b/, 'keyword'],
        [/\b(gl_Position|gl_FragColor|gl_FragCoord)\b/, 'variable'],
        [/(sin|cos|tan|abs|floor|ceil|fract|mod|min|max|clamp|mix|smoothstep|length|distance|dot|normalize)\b/, 'function'],
        [/\d+\.?\d*/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/[{}()\[\]]/, 'delimiter'],
      ]
    }
  })
  
  editor = monaco.editor.create(editorEl.value, {
    value: props.modelValue,
    language: 'glsl',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    padding: { top: 12 },
    folding: true,
    renderLineHighlight: 'line',
    matchBrackets: 'always',
  })
  
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue())
  })
})

watch(() => props.modelValue, (v) => {
  if (editor && editor.getValue() !== v) {
    editor.setValue(v)
  }
})

onUnmounted(() => {
  editor?.dispose()
})
</script>

<style scoped>
.editor-wrapper {
  flex: 1;
  min-height: 200px;
}

.editor {
  width: 100%;
  height: 100%;
}

.editor-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #606070;
  background: #1a1a2a;
}
</style>
