import { defineEventHandler, getQuery } from 'h3'
import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const { page = '1', limit = '20', level } = getQuery(event)
  const pageNum = Math.max(1, parseInt(page as string))
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)))
  const offset = (pageNum - 1) * limitNum
  const db = getDb()

  let where = ''
  const params: any[] = []
  if (level) {
    where = 'WHERE level = ?'
    params.push(level)
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM logs ${where}`)
  const { total } = countStmt.get(...params) as { total: number }

  const stmt = db.prepare(
    `SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
  const logs = stmt.all(...params, limitNum, offset)

  return {
    total,
    page: pageNum,
    limit: limitNum,
    data: logs.map((l: any) => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : null
    }))
  }
})
