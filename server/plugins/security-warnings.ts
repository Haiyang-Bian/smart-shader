// Warn at startup if the admin dashboard is exposed with the default password in production.
// Operators must set NUXT_ADMIN_PASSWORD before deploying.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const password = config.adminPassword
  const isProd = process.env.NODE_ENV === 'production'

  if (!password) {
    console.warn('[security] NUXT_ADMIN_PASSWORD is not configured. Admin dashboard is disabled.')
    return
  }

  if (isProd && password === 'admin123') {
    console.warn('[security] NUXT_ADMIN_PASSWORD is set to the default value "admin123". Change it before exposing this server to the public internet.')
  }
})
