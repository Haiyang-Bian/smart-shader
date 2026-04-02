import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../../utils/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return { success: true }
})
