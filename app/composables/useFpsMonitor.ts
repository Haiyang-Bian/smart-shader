export function useFpsMonitor() {
  const fps = ref(60)
  const isLowPerformance = ref(false)
  const frameTime = ref(16.67) // ms

  let lastTime = performance.now()
  let frames = 0
  let lastFpsUpdate = performance.now()
  let animationId: number | null = null
  let isRunning = false

  function update() {
    if (!isRunning) return

    const now = performance.now()
    const delta = now - lastTime
    lastTime = now

    frameTime.value = delta
    frames++

    // 每秒更新一次 FPS
    if (now - lastFpsUpdate >= 1000) {
      fps.value = frames
      isLowPerformance.value = frames < 30
      frames = 0
      lastFpsUpdate = now
    }

    animationId = requestAnimationFrame(update)
  }

  function start() {
    if (isRunning) return
    isRunning = true
    lastTime = performance.now()
    lastFpsUpdate = performance.now()
    frames = 0
    animationId = requestAnimationFrame(update)
  }

  function stop() {
    isRunning = false
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  // 格式化显示
  const fpsDisplay = computed(() => {
    if (fps.value >= 55) return { text: `${fps.value} FPS`, color: '#22c55e' }
    if (fps.value >= 30) return { text: `${fps.value} FPS`, color: '#f59e0b' }
    return { text: `${fps.value} FPS`, color: '#ef4444' }
  })

  onUnmounted(() => {
    stop()
  })

  return {
    fps,
    frameTime,
    isLowPerformance,
    fpsDisplay,
    start,
    stop
  }
}
