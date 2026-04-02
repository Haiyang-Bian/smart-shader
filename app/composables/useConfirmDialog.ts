interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'danger' | 'info'
}

export function useConfirmDialog() {
  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const {
      title = '确认',
      message,
      confirmText = '确定',
      cancelText = '取消',
      type = 'warning'
    } = typeof options === 'string'
      ? { message: options, title: '确认', confirmText: '确定', cancelText: '取消', type: 'warning' as const }
      : options

    return new Promise((resolve) => {
      // 创建遮罩层
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: confirmFadeIn 0.2s ease;
      `

      // 颜色配置
      const colors: Record<string, { confirm: string; icon: string }> = {
        warning: { confirm: '#f59e0b', icon: '⚠️' },
        danger: { confirm: '#ef4444', icon: '🗑️' },
        info: { confirm: '#8b5cf6', icon: '💡' }
      }

      const { confirm: confirmColor, icon } = colors[type]

      // 创建对话框
      const dialog = document.createElement('div')
      dialog.style.cssText = `
        background: #1a1a2a;
        border: 1px solid #353550;
        border-radius: 16px;
        padding: 24px;
        max-width: 360px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: confirmSlideIn 0.2s ease;
      `

      dialog.innerHTML = `
        <div style="
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        ">
          <span style="
            font-size: 24px;
            flex-shrink: 0;
          ">${icon}</span>
          <div style="flex: 1;">
            <h3 style="
              margin: 0 0 8px 0;
              font-size: 16px;
              font-weight: 600;
              color: #fff;
            ">${title}</h3>
            <p style="
              margin: 0;
              font-size: 14px;
              color: #a0a0b0;
              line-height: 1.5;
            ">${message}</p>
          </div>
        </div>
        <div style="
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        ">
          <button id="confirm-cancel" style="
            padding: 10px 20px;
            background: transparent;
            border: 1px solid #353550;
            border-radius: 8px;
            color: #a0a0b0;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          ">${cancelText}</button>
          <button id="confirm-ok" style="
            padding: 10px 20px;
            background: ${confirmColor};
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          ">${confirmText}</button>
        </div>
      `

      overlay.appendChild(dialog)
      document.body.appendChild(overlay)

      // 添加动画样式
      if (!document.getElementById('confirm-animation')) {
        const style = document.createElement('style')
        style.id = 'confirm-animation'
        style.textContent = `
          @keyframes confirmFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes confirmSlideIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `
        document.head.appendChild(style)
      }

      // 添加按钮悬停效果
      const cancelBtn = dialog.querySelector('#confirm-cancel') as HTMLButtonElement
      const okBtn = dialog.querySelector('#confirm-ok') as HTMLButtonElement

      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#252538'
        cancelBtn.style.color = '#fff'
      })
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent'
        cancelBtn.style.color = '#a0a0b0'
      })

      okBtn.addEventListener('mouseenter', () => {
        okBtn.style.opacity = '0.9'
        okBtn.style.transform = 'translateY(-1px)'
      })
      okBtn.addEventListener('mouseleave', () => {
        okBtn.style.opacity = '1'
        okBtn.style.transform = 'translateY(0)'
      })

      // 处理按钮点击
      const handleCancel = () => {
        cleanup()
        resolve(false)
      }

      const handleConfirm = () => {
        cleanup()
        resolve(true)
      }

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel()
        } else if (e.key === 'Enter') {
          handleConfirm()
        }
      }

      const cleanup = () => {
        cancelBtn.removeEventListener('click', handleCancel)
        okBtn.removeEventListener('click', handleConfirm)
        document.removeEventListener('keydown', handleKeydown)
        overlay.remove()
      }

      cancelBtn.addEventListener('click', handleCancel)
      okBtn.addEventListener('click', handleConfirm)
      document.addEventListener('keydown', handleKeydown)

      // 点击遮罩层关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel()
        }
      })
    })
  }

  return { confirm }
}
