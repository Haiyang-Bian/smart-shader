import { defineEventHandler, readBody } from 'h3'
import { logInfo, logWarn, logError } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { level = 'INFO', source, message, metadata } = body

  if (!source || !message) {
    throw createError({ statusCode: 400, message: 'source and message are required' })
  }

  switch (level) {
    case 'INFO':
      logInfo(source, message, metadata)
      break
    case 'WARN':
      logWarn(source, message, metadata)
      break
    case 'ERROR':
      logError(source, message, metadata)
      break
    default:
      logInfo(source, message, metadata)
  }

  return { success: true }
})
