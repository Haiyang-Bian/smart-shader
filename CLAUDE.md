# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smart Shader** is a Nuxt 4 + Vue 3 application that generates GLSL fragment shaders via AI chat. Users describe visual effects in natural language, and the AI returns shader code that is automatically applied to a live WebGL preview. It supports multiple AI providers, streaming responses, multi-turn conversations, an Agent mode with Coder/Reviewer dual roles, and a password-protected admin dashboard for viewing conversation logs and raw AI responses.

## Common Commands

```bash
# Install dependencies
npm install

# Development server (runs on http://localhost:3000)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Static generation (not typically used)
npm run generate

# Unit tests (vitest)
npm test          # one-shot
npm run test:watch

# Lint
npm run lint
```

## High-Level Architecture

### Frontend

The main page (`app/pages/index.vue`) renders a split layout: a left sidebar for the WebGL preview + Monaco code editor + shader history, and a right main area for chat.

**Key frontend layers:**

- **ChatInterface.vue** (`app/components/ChatInterface.vue`) is the top-level chat UI. It composes `useConversations()`, `useChat()`, `useAgent()`, and `useSettings()`.
- **useChat.ts** (`app/composables/useChat.ts`) manages message state, streaming, and tool call handling. It calls `/api/chat` with `stream: true` and parses the SSE response to incrementally update the UI.
- **useAgent.ts** (`app/composables/useAgent.ts`) implements the Coder+Reviewer loop. It calls `/api/chat` internally (frontend-to-backend), not a separate admin API. It supports up to 10 rounds of automatic iteration.
- **useConversations.ts** (`app/composables/useConversations.ts`) persists conversations and messages to `localStorage` under the keys `shader-conversations` and `shader-current-conversation`.
- **useSettings.ts** (`app/composables/useSettings.ts`) manages AI provider/model/token/temperature settings in `localStorage` (`shader-settings`).
- **ShaderRenderer.vue** (`app/components/ShaderRenderer.vue`) handles the WebGL 1.0 canvas, injects `u_time` and `u_resolution`, and provides screenshot/compile-status utilities used by the chat Agent.
- **CodeEditor.vue** (`app/components/CodeEditor.vue`) wraps Monaco Editor with GLSL language support.

### Backend (Nitro)

Server routes live under `server/api/`.

- **chat.post.ts** — Main chat endpoint. Supports both streaming (SSE) and non-streaming modes. Proxies to OpenAI, Anthropic, Moonshot, OpenRouter, or local Ollama. Implements tool-call detection and markdown shader extraction. For the admin dashboard, it persists the full raw AI response (JSON or SSE lines) into SQLite (`messages.raw_response`).
- **generate-shader.post.ts** — Direct shader generation endpoint (used less frequently now that chat handles shader generation).
- **models.get.ts** — Fetches available models from providers that support it (OpenAI, Moonshot, OpenRouter, local).
- **test-ai-connection.post.ts** — Validates API tokens by hitting the provider's model/health endpoint.
- **admin/** — Protected admin API routes. Password is set via `runtimeConfig.adminPassword` (default `admin123`, override with `NUXT_ADMIN_PASSWORD`).

### Persistence Model (Important)

There are **two persistence layers**:

1. **Client-side (`localStorage`)** — Conversations, messages, and settings are stored in the browser. This is the primary runtime store for the chat UI.
2. **Server-side (SQLite)** — Located at `.data/admin.db`, used only for the admin dashboard. Every chat request sends `conversationId` to the server, which upserts the conversation and messages into SQLite. This allows the admin UI to view complete conversation histories and raw AI responses without relying solely on browser storage.

When adding or modifying message fields, update:
- `types/index.ts` (`Message` interface)
- `server/utils/db.ts` and `server/plugins/db-init.ts` (if a new DB column is needed)
- `server/api/chat.post.ts` (persistence logic in `persistMessages` and `updateAssistantMessage`)

### Tool Calls & Vision

- Tool calls are currently **only supported for Moonshot (Kimi)** models (`kimi-k2`, `kimi-k2.5`, `moonshot-v1-*`). The backend and frontend both gate `enableTools` behind `provider === 'moonshot'` and `supportsTools(model)`.
- Vision (image input) is supported by a broader list of models, defined in `chat.post.ts` (`VISION_MODELS`).
- Available tools: `capture_screenshot`, `get_current_code`.

### Admin Dashboard

- Route: `/admin` (Vue page at `app/pages/admin.vue`)
- Password-protected via `x-admin-password` header.
- Tabs: Logs (paginated, filterable) and Conversation Records (with expandable raw AI responses).

## Notable Patterns

- **No test suite** is currently set up. There are no unit tests or E2E tests.
- **No linting command** is configured in `package.json`.
- **Composition API style**: Components use `<script setup>` and rely on custom composables under `app/composables/`.
- **Dark UI theme**: Colors are hardcoded in components (`#0a0a0f`, `#13131f`, `#252538`, `#8b5cf6` gradient accents).
- **Monaco Editor bundling**: `monaco-editor` is explicitly transpiled and pre-bundled in `nuxt.config.ts` for dev performance.

## Environment Variables

- `NUXT_ADMIN_PASSWORD` — Sets the admin dashboard password. **Must be explicitly set in production** — when `NODE_ENV=production` and this is still the default `admin123`, the server logs a warning at startup. When unset, the admin dashboard is fully disabled (the middleware rejects every request).
- `NUXT_RATE_LIMIT_PER_MINUTE` — Per-IP request budget for `/api/chat`, `/api/generate-shader`, and `/api/admin/login`. Default `20`. The limiter is in-memory and single-process.

## Persistence Model

- `localStorage` keys: `shader-conversations`, `shader-current-conversation`, `shader-settings`, legacy `shader-chat-history` (auto-migrated).
- SQLite (`.data/admin.db`) holds a server-side shadow copy of conversations, messages, and logs so the admin dashboard can review raw AI responses without relying on the browser.
- To delete **everything** (both copies): call `POST /api/privacy/purge { confirm: true }`. The same flow is wired into ⚙️ Settings → "危险操作" → "🗑 清空所有数据".
