// Shared types for the LLM provider layer.
// Per-provider `chat()` / `listModels()` / `testConnection()` functions were planned
// but not extracted in this pass (would require splitting the 890-line streaming handler in chat.post.ts).
// The registry in ./registry.ts is the agreed single source of truth for provider URLs, auth, and model-list endpoints.

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  image?: string
}

export type ChatRequest = {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  customSystemPrompt?: string
  stream?: boolean
  enableTools?: boolean
}

export type ChatResponse = {
  content: string
  shaderCode?: string | null
  toolCalls?: unknown
  model?: string
  rawData?: unknown
}

export type ModelListing = {
  id: string
  name: string
  description?: string
}

export type ConnectionTestResult = {
  success: boolean
  message: string
}

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'openrouter' | 'local'
