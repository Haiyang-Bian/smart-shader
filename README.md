# Smart Shader

一个基于 AI 的 GLSL 着色器生成与实时预览工具。通过自然语言描述，让 AI 为你生成炫酷的 WebGL 着色器效果，并在右侧实时预览、编辑和迭代优化。

![版本](https://img.shields.io/badge/version-0.1.1-blue)
![Nuxt](https://img.shields.io/badge/Nuxt-4.4.2-00DC82)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D)

## 在线演示

本地运行后访问 `http://localhost:3000`

## 核心特性

### 1. AI 对话生成着色器
- 支持自然语言描述生成 GLSL 片段着色器代码
- AI 生成的代码会自动提取并应用到编辑器
- 支持代码解释、调试、优化等后续对话

### 2. 实时 WebGL 预览
- 基于原生 WebGL 1.0 的片段着色器渲染
- 自动注入 `u_time`（时间）和 `u_resolution`（分辨率）uniform
- 支持截图、发送到对话、视频录制（最长30秒）
- FPS 性能监控，低性能时自动警告

### 3. 专业代码编辑器
- 集成 Monaco Editor，提供完整的 GLSL 语法高亮
- 支持代码格式化、自动缩进
- 一键将代码发送到 AI 对话进行优化

### 4. 多 AI 提供商支持
| 提供商 | 特点 | 视觉支持 | 工具调用 |
|--------|------|----------|----------|
| 内置助手 | 无需 API，预设模板匹配 | ❌ | ❌ |
| Moonshot (Kimi) | 国产大模型，推荐主力使用 | ✅ | ✅ |
| OpenAI | GPT-4 / GPT-4o 系列 | ✅ | ❌ |
| Anthropic (Claude) | Claude 3 系列 | ✅ | ❌ |
| OpenRouter | 多模型聚合平台 | 视模型而定 | ❌ |
| 本地 / Ollama | 自建模型服务 | 视模型而定 | ❌ |

### 5. Agent 智能体模式
独特的 **Coder + Reviewer** 双角色自动迭代模式：
- **Coder**：根据需求生成/修改着色器代码，可调用工具获取当前截图和代码
- **Reviewer**：审查生成结果，输出 `PASS` / `FAIL`  verdict
- 当审查不通过时，Agent 自动根据反馈继续修改，最多迭代 10 轮
- 工具调用：`capture_screenshot`（捕获渲染截图）、`get_current_code`（获取当前代码）

### 6. 多对话管理
- 支持创建、切换、删除多个对话
- 对话历史和消息自动保存在浏览器 LocalStorage
- 支持自动根据第一条用户消息生成对话标题
- 兼容旧版单对话数据自动迁移

### 7. 视觉反馈与多模态
- 支持上传图片或粘贴截图到对话
- AI 可基于渲染截图给出视觉层面的优化建议（需使用支持视觉的模型）
- 截图发送前自动压缩为 512x512，节省 Token

### 8. 历史版本管理
- 自动每 5 秒保存一次代码快照
- 支持 Undo / Redo 快捷键式版本回溯
- 可查看完整历史列表并恢复到任意版本
- 支持手动保存关键版本

## 技术栈

- **框架**：[Nuxt 4](https://nuxt.com/) + [Vue 3](https://vuejs.org/) (Composition API)
- **语言**：TypeScript
- **UI 组件**：[Nuxt UI 4](https://ui.nuxt.com/)
- **代码编辑器**：[Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **渲染**：原生 WebGL 1.0 API
- **状态持久化**：浏览器 LocalStorage
- **服务端**：Nitro (Nuxt 内置)

## 快速开始

### 环境要求
- Node.js >= 18
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm run preview
```

## 项目结构

```
smart-shader/
├── app/                          # Nuxt 应用目录
│   ├── app.vue                   # 根组件
│   ├── components/               # Vue 组件
│   │   ├── ChatInterface.vue     # 聊天界面（核心）
│   │   ├── ShaderRenderer.vue    # WebGL 渲染器
│   │   ├── CodeEditor.vue        # Monaco 代码编辑器
│   │   ├── ShaderHistory.vue     # 历史版本管理
│   │   ├── SettingsModal.vue     # AI 设置弹窗
│   │   ├── ConversationList.vue  # 对话列表面板
│   │   └── ...
│   ├── composables/              # 组合式函数
│   │   ├── useChat.ts            # 聊天状态与流式请求
│   │   ├── useAgent.ts           # Agent 智能体核心逻辑
│   │   ├── useSettings.ts        # AI 设置管理
│   │   ├── useConversations.ts   # 多对话管理
│   │   ├── useShaderHistory.ts   # Shader 历史版本
│   │   ├── useTools.ts           # AI 工具调用
│   │   └── ...
│   └── pages/
│       └── index.vue             # 主页面（三栏布局）
├── server/                       # Nitro 服务端 API
│   └── api/
│       ├── chat.post.ts          # 聊天主接口（流式/非流式）
│       ├── models.get.ts         # 获取模型列表
│       ├── test-ai-connection.post.ts  # 测试 AI 连接
│       └── templates.ts          # 内置模板
├── types/
│   └── index.ts                  # TypeScript 类型定义
├── nuxt.config.ts                # Nuxt 配置
└── package.json
```

## 使用指南

### 首次使用
1. 打开页面后，如果不配置 API，默认使用**内置模板模式**
2. 点击右上角 **⚙️ 设置**，选择 AI 提供商并输入 API Token
3. 返回主界面，在输入框描述你想要的视觉效果，按 Enter 发送
4. AI 生成代码后，右侧预览区会实时更新

### 上传截图优化
1. 点击渲染区下方的 **📷 截图** 或 **💬 发送到对话**
2. 在输入框中描述修改意见（如"颜色太亮了，想要暗一点"）
3. 发送后 AI 会基于截图给出针对性优化

### 使用 Agent 模式
1. 点击顶部 **Agent** 按钮开启智能体模式
2. 描述需求后，Agent 会自动：
   - Coder 生成初始代码
   - Reviewer 审查代码并给出 verdict
   - 不通过则自动迭代修改
3. 可随时发送消息介入迭代过程

### 代码编辑器操作
- `格式化`：自动修复 GLSL 代码缩进
- `发送到对话`：将当前代码作为上下文发送给 AI
- 支持语法高亮、括号匹配、代码折叠

## 着色器规范

AI 生成的着色器需遵循以下 WebGL 1.0 规范：

```glsl
precision mediump float;

uniform float u_time;       // 动画时间（秒）
uniform vec2 u_resolution;  // 画布分辨率（像素）

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  // ... 你的着色器逻辑 ...
  gl_FragColor = vec4(color, 1.0);
}
```

## 快捷键

| 操作 | 快捷键 |
|------|--------|
| 发送消息 | Enter（Shift+Enter 换行） |
| 粘贴图片 | Ctrl+V |

##  Roadmap / 已知问题

- [ ] Agent 模式异步对话稳定性优化
- [ ] 更多内置效果模板
- [ ] 着色器参数实时调节面板
- [ ] 导出为 Shadertoy / GLSL Sandbox 格式

## 许可证

MIT License
