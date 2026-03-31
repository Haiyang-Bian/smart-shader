<template>
  <div class="editor-wrapper">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <span class="lang-badge">GLSL</span>
      <div class="toolbar-actions">
        <button class="tool-btn" @click="formatCode" title="格式化代码">
          ✨ 格式化
        </button>
        <button class="tool-btn primary" @click="sendToChat" title="将代码发送到对话">
          💬 发送到对话
        </button>
      </div>
    </div>
    
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

const emit = defineEmits(['update:modelValue', 'send-to-chat'])

const isClient = ref(false)
const editorEl = ref(null)
let editor = null

onMounted(async () => {
  isClient.value = true
  await nextTick()
  
  if (!editorEl.value) return
  
  const monaco = await import('monaco-editor')
  
  // GLSL language definition
  monaco.languages.register({ id: 'glsl' })
  
  // Improved syntax highlighting
  monaco.languages.setMonarchTokensProvider('glsl', {
    defaultToken: '',
    tokenPostfix: '.glsl',
    
    keywords: [
      'attribute', 'const', 'uniform', 'varying', 'buffer', 'shared',
      'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
      'atomic_uint', 'layout', 'centroid', 'flat', 'smooth', 'noperspective',
      'patch', 'sample', 'break', 'continue', 'do', 'for', 'while',
      'switch', 'case', 'default', 'if', 'else', 'subroutine', 'in', 'out',
      'inout', 'discard', 'return', 'true', 'false', 'void', 'precision',
      'lowp', 'mediump', 'highp', 'struct'
    ],
    
    types: [
      'bool', 'int', 'uint', 'float', 'double',
      'vec2', 'vec3', 'vec4', 'dvec2', 'dvec3', 'dvec4',
      'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
      'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
      'dmat2', 'dmat3', 'dmat4', 'dmat2x2', 'dmat2x3', 'dmat2x4', 'dmat3x2', 'dmat3x3', 'dmat3x4', 'dmat4x2', 'dmat4x3', 'dmat4x4',
      'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DRect',
      'sampler1DArray', 'sampler2DArray', 'samplerCubeArray', 'samplerBuffer',
      'sampler2DMS', 'sampler2DMSArray',
      'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube', 'isampler2DRect',
      'isampler1DArray', 'isampler2DArray', 'isamplerCubeArray', 'isamplerBuffer',
      'isampler2DMS', 'isampler2DMSArray',
      'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube', 'usampler2DRect',
      'usampler1DArray', 'usampler2DArray', 'usamplerCubeArray', 'usamplerBuffer',
      'usampler2DMS', 'usampler2DMSArray'
    ],
    
    builtInFunctions: [
      // Angle and Trigonometry
      'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
      // Exponential
      'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
      // Common
      'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract', 'mod', 'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'isnan', 'isinf', 'floatBitsToInt', 'floatBitsToUint', 'intBitsToFloat', 'uintBitsToFloat', 'fma', 'frexp', 'ldexp',
      // Geometric
      'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract',
      // Matrix
      'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
      // Vector Relational
      'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not',
      // Texture
      'textureSize', 'textureQueryLod', 'textureQueryLevels', 'texture', 'textureProj', 'textureLod', 'textureOffset', 'texelFetch', 'texelFetchOffset', 'textureProjOffset', 'textureLodOffset', 'textureProjLod', 'textureProjLodOffset', 'textureGrad', 'textureGradOffset', 'textureProjGrad', 'textureProjGradOffset',
      // Noise
      'noise1', 'noise2', 'noise3', 'noise4',
      // Deprecated
      'ftransform'
    ],
    
    builtInVariables: [
      // Vertex
      'gl_VertexID', 'gl_InstanceID', 'gl_Position', 'gl_PointSize',
      // Fragment
      'gl_FragCoord', 'gl_FrontFacing', 'gl_ClipDistance', 'gl_CullDistance',
      'gl_PointCoord', 'gl_PrimitiveID', 'gl_SampleID', 'gl_SamplePosition',
      'gl_SampleMaskIn', 'gl_Layer', 'gl_ViewportIndex', 'gl_FragColor',
      'gl_FragData', 'gl_FragDepth', 'gl_SampleMask'
    ],
    
    operators: [
      '=', '>', '<', '!', '~', '?', ':',
      '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>',
      '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>='
    ],
    
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    
    tokenizer: {
      root: [
        // Comments
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        
        // Preprocessor directives
        [/^\s*#\s*\w+/, 'keyword.preprocessor'],
        
        // Whitespace
        { include: '@whitespace' },
        
        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string_double'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@string_single'],
        
        // Numbers
        [/(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?([fF]|[uU][lL]?|[lL][uU]?)?/, 'number'],
        [/0[xX][0-9a-fA-F]+([uU][lL]?|[lL][uU]?)?/, 'number.hex'],
        
        // Keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@types': 'type',
            '@builtInFunctions': 'predefined.function',
            '@builtInVariables': 'variable.predefined',
            '@default': 'identifier'
          }
        }],
        
        // Delimiters and operators
        [/[{}()\[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }]
      ],
      
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/\/\*/, 'comment', '@push'],
        [/[/*]/, 'comment']
      ],
      
      string_double: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop']
      ],
      
      string_single: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, 'string', '@pop']
      ],
      
      whitespace: [
        [/[ \t\r\n]+/, 'white']
      ]
    }
  })
  
  // Configure language features
  monaco.languages.setLanguageConfiguration('glsl', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ]
  })
  
  // Define custom theme
  monaco.editor.defineTheme('glsl-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'predefined.function', foreground: 'DCDCAA' },
      { token: 'variable.predefined', foreground: '9CDCFE' },
      { token: 'comment', foreground: '6A9955' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.hex', foreground: 'B5CEA8' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1a1a2a',
      'editor.lineHighlightBackground': '#2a2a3a',
      'editor.selectionBackground': '#264f78',
    }
  })
  
  editor = monaco.editor.create(editorEl.value, {
    value: props.modelValue,
    language: 'glsl',
    theme: 'glsl-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    padding: { top: 12 },
    folding: true,
    renderLineHighlight: 'line',
    matchBrackets: 'always',
    bracketPairColorization: { enabled: true },
    renderIndentGuides: true,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
  })
  
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue())
  })
  
  // 监听容器大小变化
  const resizeObserver = new ResizeObserver(() => {
    editor?.layout()
  })
  resizeObserver.observe(editorEl.value)
})

watch(() => props.modelValue, (v) => {
  if (editor && editor.getValue() !== v) {
    editor.setValue(v)
  }
})

onUnmounted(() => {
  editor?.dispose()
})

// Format code (simple auto-indent)
function formatCode() {
  if (!editor) return
  
  const code = editor.getValue()
  // Simple formatting: fix indentation
  const lines = code.split('\n')
  let indent = 0
  const formatted = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed.endsWith('}')) indent = Math.max(0, indent - 1)
    const result = '  '.repeat(indent) + trimmed
    if (trimmed.endsWith('{')) indent++
    return result
  }).join('\n')
  
  editor.setValue(formatted)
}

// Send code to chat
function sendToChat() {
  if (!editor) return
  
  const code = editor.getValue()
  if (!code.trim()) return
  
  emit('send-to-chat', {
    type: 'code',
    content: code,
    timestamp: Date.now()
  })
}
</script>

<style scoped>
.editor-wrapper {
  flex: 1;
  min-height: 150px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 工具栏 */
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #13131f;
  border-bottom: 1px solid #252538;
  flex-shrink: 0;
}

.lang-badge {
  font-size: 11px;
  font-weight: 600;
  color: #4EC9B0;
  background: rgba(78, 201, 176, 0.1);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(78, 201, 176, 0.3);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #252538;
  border: 1px solid #353550;
  border-radius: 6px;
  color: #a0a0b0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #353550;
  color: #fff;
}

.tool-btn.primary {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  border-color: transparent;
  color: white;
}

.tool-btn.primary:hover {
  opacity: 0.9;
}

.editor {
  flex: 1;
  width: 100%;
  min-height: 150px;
  height: 300px;
}

.editor-placeholder {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #606070;
  background: #1a1a2a;
}
</style>
