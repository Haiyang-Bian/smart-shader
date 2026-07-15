// ==================== 基础类型 ====================

export type ProviderId = 'builtin' | 'openai' | 'anthropic' | 'moonshot' | 'openrouter' | 'local'

export type AgentRole = 'default' | 'coder' | 'reviewer' | 'system'

export type ReviewVerdict = 'PASS' | 'FAIL' | 'ERROR'

// ==================== 消息相关 ====================

export interface Message {
  id: number | string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  image?: string
  code?: string
  shaderCode?: string | null
  reasoning?: string
  showReasoning?: boolean
  isStreaming?: boolean
  agentMeta?: AgentMeta
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  toolResultsProcessed?: boolean
  variantGroup?: string
  variantIndex?: number
}

export interface AgentMeta {
  role: AgentRole
  round: number
}

// ==================== AI 设置 ====================

export interface AISettings {
  provider: ProviderId
  model: string
  token: string
  temperature: number
  maxTokens: number
  customUrl: string
  maxAgentRounds: number
}

export interface ProviderConfig {
  id: ProviderId
  name: string
  desc: string
  fetchModels: boolean
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

// ==================== 工具调用 ====================

export interface ToolCall {
  id: string
  name: string
  arguments: string | Record<string, any>
  function?: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  name: string
  arguments?: any
  result?: any
  error?: string
  image?: string
}

// ==================== Shader 相关 ====================

export interface ShaderCompileStatus {
  success: boolean
  error: string | null
}

export interface ShaderHistoryItem {
  id: string
  code: string
  timestamp: number
  description?: string
  thumbnail?: string
}

export interface ScreenshotData {
  dataUrl: string
  blob: Blob
  timestamp: number
}

// ==================== Agent 相关 ====================

export interface AgentState {
  isRunning: boolean
  isPaused: boolean
  status: string
  round: number
  pendingMessages: PendingMessage[]
  history: Message[]
}

export interface PendingMessage {
  content: string
  timestamp: number
}

export interface ReviewResult {
  verdict: ReviewVerdict
  feedback: string
}

// ==================== API 相关 ====================

export interface ChatRequestBody {
  messages: Array<{
    role: string
    content: string
    image?: string
  }>
  settings: AISettings | null
  stream: boolean
  toolResults?: ToolResult[]
  role?: AgentRole
}

export interface ChatResponse {
  content: string
  shaderCode?: string | null
  toolCalls?: ToolCall[]
  reasoning?: string
  model?: string
}

export interface StreamEvent {
  type: 'reasoning' | 'reasoning_end' | 'content' | 'shader' | 'tool_calls'
  content?: string
  code?: string
  calls?: ToolCall[]
}

// ==================== UI 相关 ====================

export interface QuickAction {
  icon: string
  text: string
}

export interface ToastOptions {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}

// ==================== 多对话管理 ====================

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  settings?: AISettings
}

export interface ConversationsState {
  conversations: Conversation[]
  currentId: string | null
}
