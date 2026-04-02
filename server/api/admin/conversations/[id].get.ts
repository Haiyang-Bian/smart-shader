import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any
  if (!conversation) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(id) as any[]

  return {
    conversation,
    messages: messages.map((m: any) => ({
      ...m,
      tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null
    }))
  }
})
