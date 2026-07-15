// Returns a previously-shared shader by its short id.
// Increments view counter atomically as a side effect.

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing id' })

  const db = getDb()
  const row = db.prepare('SELECT id, code, title, created_at, views FROM shared_shaders WHERE id = ?').get(id) as
    | { id: string; code: string; title: string | null; created_at: number; views: number }
    | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Shader not found' })

  db.prepare('UPDATE shared_shaders SET views = views + 1 WHERE id = ?').run(id)

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    createdAt: row.created_at,
    views: row.views + 1
  }
})