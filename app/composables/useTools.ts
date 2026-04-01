// Tool definitions for AI
export const availableTools = [
  {
    name: 'capture_screenshot',
    description: '捕获当前着色器渲染效果的截图，用于查看当前视觉效果',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '为什么需要这个截图'
        }
      },
      required: ['reason']
    }
  },
  {
    name: 'get_current_code',
    description: '获取当前编辑器中的 GLSL 代码，用于分析或修改现有代码',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '为什么需要查看代码'
        }
      },
      required: ['reason']
    }
  }
]

// Tool call result types
export interface ToolCallResult {
  name: string
  arguments: Record<string, any>
  result?: any
  error?: string
}

// Tool handler interface
export interface ToolHandlers {
  captureScreenshot: (reason: string) => Promise<string | null>
  getCurrentCode: (reason: string) => Promise<string | null>
}

// Parse tool calls from AI response
export function parseToolCalls(content: string): ToolCallResult[] {
  const toolCalls: ToolCallResult[] = []
  
  // Match tool call format: <tool>name{"arg": "value"}</tool>
  const toolCallRegex = /<tool>(\w+)\s*({[\s\S]*?})<\/tool>/g
  let match
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const name = match[1] || ''
      const args = JSON.parse(match[2] || '{}')
      toolCalls.push({ name, arguments: args })
    } catch (e) {
      console.error('Failed to parse tool call:', match[0], e)
    }
  }
  
  return toolCalls
}

// Remove tool calls from content
export function removeToolCalls(content: string): string {
  return content.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim()
}

// Format tool call for prompt
export function formatToolCall(name: string, args: Record<string, any>): string {
  return `<tool>${name} ${JSON.stringify(args)}</tool>`
}

// System prompt extension for tools
export function getToolsPrompt(): string {
  return `

你可以使用以下工具来帮助用户：

1. capture_screenshot - 捕获当前渲染效果的截图
   用途：当你需要查看当前视觉效果时调用
   参数：{ "reason": "为什么需要截图" }
   
2. get_current_code - 获取当前编辑器中的代码
   用途：当你需要查看或分析现有代码时调用
   参数：{ "reason": "为什么需要代码" }

使用方法：在回复中插入工具调用标记，格式如下：
<tool>tool_name {"param": "value"}</tool>

例如：
<tool>capture_screenshot {"reason": "查看当前效果是否满足需求"}</tool>

系统会自动执行工具并将结果返回给你。你可以在一条消息中调用多个工具。`
}

// Format tool results for AI
export function formatToolResults(results: ToolCallResult[]): string {
  if (results.length === 0) return ''
  
  let formatted = '\n\n[工具执行结果]\n'
  
  for (const result of results) {
    formatted += `\n工具: ${result.name}\n`
    if (result.error) {
      formatted += `错误: ${result.error}\n`
    } else if (result.result) {
      formatted += `结果: ${result.result}\n`
    }
  }
  
  return formatted
}
