import { getDb } from './db'

export function logInfo(source: string, message: string, metadata?: Record<string, any>) {
  insertLog('INFO', source, message, metadata)
  console.log(`[${source}] ${message}`, metadata || '')
}

export function logWarn(source: string, message: string, metadata?: Record<string, any>) {
  insertLog('WARN', source, message, metadata)
  console.warn(`[${source}] ${message}`, metadata || '')
}

export function logError(source: string, message: string, metadata?: Record<string, any>) {
  insertLog('ERROR', source, message, metadata)
  console.error(`[${source}] ${message}`, metadata || '')
}

function insertLog(level: string, source: string, message: string, metadata?: Record<string, any>) {
  try {
    const db = getDb()
    const stmt = db.prepare(
      'INSERT INTO logs (level, source, message, metadata, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(level, source, message, metadata ? JSON.stringify(metadata) : null, Date.now())
  } catch (e) {
    console.error('Failed to write log to DB:', e)
  }
}
