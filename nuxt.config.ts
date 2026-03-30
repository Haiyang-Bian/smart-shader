// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    ['@nuxt/ui', {
      fonts: false
    }]
  ],
  
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

  // 或者如果模块有配置，设为 false
  ui: {
    fonts: false
  }
})
