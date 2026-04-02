interface ToastOptions {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}

export function useCustomToast() {
  function show(options: ToastOptions | string) {
    const { message, type = 'info', duration = 2000 } = typeof options === 'string'
      ? { message: options, type: 'info' as const, duration: 2000 }
      : options

    const colors: Record<string, string> = {
      info: '#8b5cf6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444'
    }

    const toast = document.createElement('div')
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: ${colors[type]};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999;
      animation: fadeInOut ${duration}ms ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
    `
    toast.textContent = message
    document.body.appendChild(toast)

    // 添加动画样式（如果不存在）
    if (!document.getElementById('toast-animation')) {
      const style = document.createElement('style')
      style.id = 'toast-animation'
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
          20% { opacity: 1; transform: translateX(-50%) translateY(0); }
          80% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
      `
      document.head.appendChild(style)
    }

    setTimeout(() => {
      toast.remove()
    }, duration)
  }

  return {
    show,
    success: (message: string, duration?: number) => show({ message, type: 'success', duration }),
    error: (message: string, duration?: number) => show({ message, type: 'error', duration }),
    warning: (message: string, duration?: number) => show({ message, type: 'warning', duration }),
    info: (message: string, duration?: number) => show({ message, type: 'info', duration })
  }
}
