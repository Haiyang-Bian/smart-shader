// Shared helper: extract GLSL code from a Markdown fenced code block or a <shader> HTML tag.
// Used by both chat.post.ts (real LLM responses) and possibly the legacy generate-shader path.
// Lives outside the chat endpoint to be importable from unit tests without pulling in h3.

export function extractShaderCode(content: string): string | null {
  if (!content) return null
  const match = content.match(/```(?:glsl|shader)\n?([\s\S]*?)```/) ||
                content.match(/<shader>([\s\S]*?)<\/shader>/)
  return match?.[1] ? match[1].trim() : null
}
