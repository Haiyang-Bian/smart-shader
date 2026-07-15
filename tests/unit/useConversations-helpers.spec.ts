import { describe, it, expect } from 'vitest'
import { generateTitle, generateTitleFromContent } from '~/composables/useConversations'

describe('generateTitle', () => {
  it('starts with the Chinese label "对话"', () => {
    expect(generateTitle().startsWith('对话 ')).toBe(true)
  })
})

describe('generateTitleFromContent', () => {
  it('returns the content verbatim when shorter than 20 chars', () => {
    expect(generateTitleFromContent('Hello world')).toBe('Hello world')
  })

  it('truncates with an ellipsis when longer than 20 chars', () => {
    const long = 'a'.repeat(25)
    expect(generateTitleFromContent(long)).toBe('a'.repeat(20) + '...')
  })

  it('strips fenced code blocks before measuring', () => {
    const result = generateTitleFromContent('quick ```js\nconsole.log("hi")\n``` summary')
    // After stripping, both flanking spaces remain → "quick  summary".
    expect(result).toBe('quick  summary')
  })

  it('replaces line breaks with spaces', () => {
    expect(generateTitleFromContent('line one\nline two')).toBe('line one line two')
  })

  it('strips [code]...[/code] tags', () => {
    expect(generateTitleFromContent('pre [code]secret[/code] post')).toBe('pre  post')
  })

  it('falls back to "新对话" when content is empty after cleanup', () => {
    expect(generateTitleFromContent('')).toBe('新对话')
    expect(generateTitleFromContent('```only code```')).toBe('新对话')
  })
})
