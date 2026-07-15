// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/content', ['@nuxt/ui', {
    fonts: false
  }], '@nuxt/eslint'],
  
  devtools: { enabled: false },
  
  compatibilityDate: '2024-04-03',
  
  // Optimize Monaco Editor
  build: {
    transpile: ['monaco-editor']
  },
  
  vite: {
    optimizeDeps: {
      include: ['monaco-editor']
    }
  },
  
  // App configuration
  app: {
    head: {
      title: 'Smart Shader - AI GLSL Generator',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'AI-powered GLSL shader generator with live preview' }
      ],
    }
  },

  runtimeConfig: {
    adminPassword: process.env.NUXT_ADMIN_PASSWORD || 'admin123',
    rateLimitPerMinute: Number(process.env.NUXT_RATE_LIMIT_PER_MINUTE) || 20
  },

  // Global stylesheet with design tokens (loaded on both server and client).
  css: ['~/assets/css/tokens.css']
})