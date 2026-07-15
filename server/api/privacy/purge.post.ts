// Wipes ALL locally-stored data: conversations, messages, and logs.
// Intended to give users a real "forget everything" since the SQLite
// shadow copy persists even when the browser's localStorage is cleared.

import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '../../utils/db'
import { logInfo } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  if (!body?.confirm) {
    throw createError({ statusCode: 400, message: '请先确认清空操作' })
  }

  const db = getDb()
  const counts = {
    deletedMessages: 0,
    deletedConversations: 0,
    deletedLogs: 0
  }

  // Run in a transaction so a partial failure cannot leave the DB in an inconsistent state.
  const purge = db.transaction(() => {
    counts.deletedMessages = db.prepare('DELETE FROM messages').run().changes
    counts.deletedConversations = db.prepare('DELETE FROM conversations').run().changes
    counts.deletedLogs = db.prepare('DELETE FROM logs').run().changes
  })
  purge()

  // VACUUM reclaims disk space; cannot run inside a transaction.
  db.exec('VACUUM')

  logInfo('api/privacy/purge', 'All conversations, messages, and logs were purged', counts)

  return { success: true, ...counts }
})
