import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAgent } from '~/composables/useAgent'
import { installFetchScript, coderEvents, reviewerEvents } from './_helpers/sse'
import type { Message, AISettings } from '~/types'

const baseSettings: AISettings = {
  provider: 'moonshot',
  model: 'kimi-k2',
  token: 'sk-test',
  temperature: 0.7,
  maxTokens: 2048,
  customUrl: '',
  maxAgentRounds: 3
}

function buildCallbacks() {
  const calls: { type: string; payload?: unknown }[] = []
  return {
    calls,
    callbacks: {
      addMessage: vi.fn((role: string, content: string) => {
        calls.push({ type: 'addMessage', payload: { role, content } })
        return { id: calls.length, role, content, timestamp: Date.now() }
      }),
      updateLastMessage: vi.fn((updater: unknown) => {
        calls.push({ type: 'updateLastMessage', payload: updater })
      }),
      addSystemMessage: vi.fn((content: string) => {
        calls.push({ type: 'addSystemMessage', payload: content })
      }),
      requestScreenshot: vi.fn(async () => ({ text: 'screenshot-text', image: 'data:image/png;base64,XYZ' })),
      requestCode: vi.fn(async () => 'precision mediump float;\nvoid main(){gl_FragColor=vec4(1);}'),
      onShaderCode: vi.fn(),
      onSaveMessages: vi.fn(),
      scrollToBottom: vi.fn()
    }
  }
}

const seedUserMessage: Message = {
  id: 'u1', role: 'user', content: 'make a red shader', timestamp: Date.now()
}

describe('useAgent runAgentLoop state machine', () => {
  beforeEach(() => {
    // happy-dom may not define console for agent's reportLog -> ensure it
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('PASS on the first review -> 1 round, finishes cleanly', async () => {
    const { callbacks, calls } = buildCallbacks()
    // Each round: 1 fetch for coder (stream) + 1 for reviewer (stream)
    installFetchScript([
      coderEvents({ code: 'void main(){gl_FragColor=vec4(1,0,0,1);}' }),
      reviewerEvents({ verdict: 'PASS' })
    ])
    const agent = useAgent()
    await agent.runAgentLoop('make red', [seedUserMessage], baseSettings, callbacks)
    expect(agent.round.value).toBe(1)
    expect(agent.isAgentRunning.value).toBe(false)
    expect(agent.isPaused.value).toBe(false)
    // Verify the "iteration complete" system message was emitted.
    const passed = calls.find(c =>
      c.type === 'addSystemMessage' &&
      typeof c.payload === 'string' &&
      c.payload.includes('审查通过')
    )
    expect(passed).toBeTruthy()
  }, 10000)

  it('FAIL then FAIL then PASS -> 3 rounds, finishes cleanly', async () => {
    const { callbacks } = buildCallbacks()
    installFetchScript([
      coderEvents({ code: 'c1' }),
      reviewerEvents({ verdict: 'FAIL', feedback: 'too dark' }),
      coderEvents({ code: 'c2' }),
      reviewerEvents({ verdict: 'FAIL', feedback: 'still off' }),
      coderEvents({ code: 'c3' }),
      reviewerEvents({ verdict: 'PASS' })
    ])
    const agent = useAgent()
    await agent.runAgentLoop('make red', [seedUserMessage], baseSettings, callbacks)
    expect(agent.round.value).toBe(3)
    expect(agent.isPaused.value).toBe(false)
  }, 15000)

  it('reaches maxAgentRounds -> isPaused becomes true and the loop halts', async () => {
    const { callbacks, calls } = buildCallbacks()
    const settings = { ...baseSettings, maxAgentRounds: 2 }
    installFetchScript([
      coderEvents({ code: 'a' }),
      reviewerEvents({ verdict: 'FAIL', feedback: 'x' }),
      coderEvents({ code: 'b' }),
      reviewerEvents({ verdict: 'FAIL', feedback: 'y' })
    ])
    const agent = useAgent()
    await agent.runAgentLoop('make red', [seedUserMessage], settings, callbacks)
    expect(agent.round.value).toBe(2)
    expect(agent.isPaused.value).toBe(true)
    const pauseMsg = calls.find(c =>
      c.type === 'addSystemMessage' &&
      typeof c.payload === 'string' &&
      c.payload.includes('已达最大迭代轮次')
    )
    expect(pauseMsg).toBeTruthy()
  }, 15000)

  it('user interrupt mid-round -> status message says 已中断', async () => {
    const { callbacks, calls } = buildCallbacks()
    // First coder fetch will be aborted. Stubbing fetch to throw an AbortError.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }))
    const agent = useAgent()
    const promise = agent.runAgentLoop('make red', [seedUserMessage], baseSettings, callbacks)
    // Give the loop a chance to enter the coder iteration, then stop it.
    setTimeout(() => agent.stopAgent(), 30)
    await promise
    const stopMsg = calls.find(c =>
      c.type === 'addSystemMessage' &&
      typeof c.payload === 'string' &&
      (c.payload.includes('已中断') || c.payload.includes('已停止'))
    )
    expect(stopMsg).toBeTruthy()
  }, 5000)

  it('tool call in coder round -> requestScreenshot is invoked and result is fed back', async () => {
    const { callbacks } = buildCallbacks()
    // Coder round: emits a tool_call, then after [DONE] the agent should execute the tool.
    // After tool execution, it loops and re-asks coder, which finally emits PASS-able content.
    installFetchScript([
      // Round 1 coder stream: tool_call then DONE
      [
        { type: 'content', content: 'Let me check the screenshot.' },
        { type: 'tool_calls', calls: [{ id: 'tc1', name: 'capture_screenshot', arguments: '{"reason":"see current state"}' }] }
      ],
      // After tool call feedback, coder emits shader
      coderEvents({ code: 'void main(){gl_FragColor=vec4(0,1,0,1);}' }),
      reviewerEvents({ verdict: 'PASS' })
    ])
    const agent = useAgent()
    await agent.runAgentLoop('make green', [seedUserMessage], baseSettings, callbacks)
    expect(callbacks.requestScreenshot).toHaveBeenCalled()
    expect(agent.round.value).toBeGreaterThanOrEqual(2)
    expect(agent.isAgentRunning.value).toBe(false)
  }, 15000)
})