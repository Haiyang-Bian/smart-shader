// Vitest setup: expose Vue reactivity globals that composables rely on.
// In Nuxt these are auto-imported; in tests we register them on globalThis
// so modules written under the Nuxt convention work without modification.

import { ref, computed, reactive } from 'vue'

const g = globalThis as unknown as Record<string, unknown>
g.ref = ref
g.computed = computed
g.reactive = reactive