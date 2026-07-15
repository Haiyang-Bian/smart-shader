import { describe, it, expect } from 'vitest'
import { extractShaderCode } from '../../../server/utils/llm/shader'

describe('extractShaderCode', () => {
  it('returns null when content is empty', () => {
    expect(extractShaderCode('')).toBeNull()
  })

  it('returns null when there is no shader block', () => {
    expect(extractShaderCode('Just plain text, nothing to extract.')).toBeNull()
  })

  it('extracts from a ```glsl fence', () => {
    const code = 'precision mediump float;\nuniform float u_time;\nvoid main() {}'
    expect(extractShaderCode(`Here is the shader:\n\`\`\`glsl\n${code}\n\`\`\``)).toBe(code)
  })

  it('extracts from a ```shader fence', () => {
    const code = 'void main() { gl_FragColor = vec4(1.0); }'
    expect(extractShaderCode('```shader\n' + code + '\n```')).toBe(code)
  })

  it('extracts from a <shader> HTML tag fallback', () => {
    expect(extractShaderCode('<shader>void main(){}</shader>')).toBe('void main(){}')
  })

  it('trims surrounding whitespace', () => {
    const result = extractShaderCode('```glsl\n\n   void main(){}\n   \n```')
    expect(result).toBe('void main(){}')
  })

  it('prefers the first matching block', () => {
    const code = 'vec3 a;'
    const content = `Intro prose.\n\`\`\`glsl\n${code}\n\`\`\` More prose. \`\`\`glsl\nignored\n\`\`\``
    expect(extractShaderCode(content)).toBe(code)
  })
})
