import { defineEventHandler } from 'h3'
import { getDb } from '../../utils/db'

export default defineEventHandler(() => {
  const db = getDb()
  const convs = db.prepare(
    `SELECT c.*, COUNT(m.id) as message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC`
  ).all()

  return { data: convs }
})
