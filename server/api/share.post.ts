// Creates a public, anonymous shader share link.
// Returns { id, url } where id is a 7-char base36 short ID and url is the
// fully-qualified path to /s/[id].

import { defineEventHandler, readBody, getRequestURL, createError } from 'h3'
import { getDb } from '../utils/db'
import { logInfo } from '../utils/logger'

function generateShortId(length = 7): string {
  // Use Math.random base36 — adequate for non-adversarial IDs (~78B keyspace).
  let id = ''
  while (id.length < length) {
    id += Math.random().toString(36).slice(2)
  }
  return id.slice(0, length)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const code = (body?.code ?? '').toString()
  const title = (body?.title ?? '').toString().slice(0, 200) || null

  if (!code.trim()) {
    throw createError({ statusCode: 400, message: '请提供 shader 代码' })
  }
  if (code.length > 100_000) {
    throw createError({ statusCode: 413, message: 'shader 代码过长（>100KB）' })
  }

  const db = getDb()
  // Try a few times in case of (vanishingly unlikely) collision.
  let id = ''
  for (let i = 0; i < 5; i++) {
    const candidate = generateShortId()
    const existing = db.prepare('SELECT 1 FROM shared_shaders WHERE id = ?').get(candidate)
    if (!existing) {
      id = candidate
      break
    }
  }
  if (!id) {
    throw createError({ statusCode: 500, message: '无法生成唯一 ID，请重试' })
  }

  const now = Date.now()
  db.prepare('INSERT INTO shared_shaders (id, code, title, created_at, views) VALUES (?, ?, ?, ?, 0)')
    .run(id, code, title, now)

  logInfo('api/share', 'Shader shared', { id, title, codeLength: code.length })

  const base = getRequestURL(event).origin
  return { id, url: `${base}/s/${id}` }
})