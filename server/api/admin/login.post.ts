import { defineEventHandler, readBody, getHeader } from 'h3'

export default defineEventHandler(async (event) => {
  let password = getHeader(event, 'x-admin-password')
  if (!password) {
    const body = await readBody(event).catch(() => ({}))
    password = body?.password
  }
  const expected = useRuntimeConfig(event).adminPassword

  // Refuse to operate when admin is disabled (no password configured) or when the caller sends an empty/mismatching value.
  if (typeof expected !== 'string' || expected.length === 0 || password !== expected) {
    throw createError({ statusCode: 401, message: '密码错误或 Admin 未启用' })
  }
  return { success: true }
})
