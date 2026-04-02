import { defineEventHandler, readBody, getHeader } from 'h3'

export default defineEventHandler(async (event) => {
  let password = getHeader(event, 'x-admin-password')
  if (!password) {
    const body = await readBody(event).catch(() => ({}))
    password = body?.password
  }
  const config = useRuntimeConfig(event)

  if (!config.adminPassword || password === config.adminPassword) {
    return { success: true }
  }
  throw createError({ statusCode: 401, message: '密码错误' })
})
