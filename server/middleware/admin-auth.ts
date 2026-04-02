import { defineEventHandler, getHeader, getRequestURL } from 'h3'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/admin/')) return
  if (url.pathname === '/api/admin/login') return

  const password = getHeader(event, 'x-admin-password')
  const config = useRuntimeConfig(event)
  const expected = config.adminPassword as string | undefined

  if (!expected || password !== expected) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
})
