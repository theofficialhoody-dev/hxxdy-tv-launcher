'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Shield, X } from 'lucide-react'
import { colorWithAlpha, resolveThemeTokens, themeTokensToCssVars, type ThemeConfig } from '@/lib/theme-data'
import { cn } from '@/lib/utils'

export function SurfsharkModal({
  isOpen,
  currentTheme,
  onClose,
  onOpen,
}: {
  isOpen: boolean
  currentTheme?: ThemeConfig
  onClose: () => void
  onOpen: () => void
}) {
  const [selected, setSelected] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const tokens = resolveThemeTokens(currentTheme)

  useEffect(() => {
    if (isOpen) setSelected(0)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) buttons.current[selected]?.focus({ preventScroll: true })
  }, [isOpen, selected])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      const { key, keyCode } = event
      if (['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key) || keyCode === 4 || keyCode === 27) {
        event.preventDefault()
        onClose()
      } else if (['ArrowLeft', 'ArrowUp'].includes(key) || [19, 21, 37, 38].includes(keyCode)) {
        event.preventDefault()
        setSelected(0)
      } else if (['ArrowRight', 'ArrowDown'].includes(key) || [20, 22, 39, 40].includes(keyCode)) {
        event.preventDefault()
        setSelected(1)
      } else if (['Enter', ' ', 'Select', 'Ok'].includes(key) || [13, 23, 66].includes(keyCode)) {
        event.preventDefault()
        if (!event.repeat) (selected === 0 ? onOpen : onClose)()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose, onOpen, selected])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="surfshark-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="tv-menu-focus fixed inset-0 z-50 grid place-items-center p-6 text-white animate-in fade-in duration-200"
      style={{
        ...themeTokensToCssVars(tokens),
        background: `
          radial-gradient(circle at 50% 40%, ${tokens.glow1}, transparent 65%),
          radial-gradient(circle at 20% 80%, ${tokens.glow2}, transparent 60%),
          ${colorWithAlpha(tokens.bg, 0.9)}
        `,
      }}
    >
      <div
        className="relative w-[min(90vw,520px)] rounded-[28px] border p-8 animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: tokens.surface,
          borderColor: tokens.glassBorder,
          boxShadow: `0 28px 80px rgba(0,0,0,0.9), 0 0 48px ${tokens.glow1}`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Surfshark dialog"
          className="absolute right-5 top-5 grid size-9 place-items-center rounded-full text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]"
          style={{
            backgroundColor: tokens.glass,
            boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
          }}
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3.5">
          <span
            className="grid size-11 place-items-center rounded-2xl shadow-lg"
            style={{
              backgroundColor: tokens.accent,
              color: tokens.accentText,
              boxShadow: `0 4px 18px ${tokens.glow1}`,
            }}
          >
            <Shield className="size-5" />
          </span>
          <div>
            <h2 id="surfshark-title" className="text-xl font-bold tracking-tight">
              Surfshark VPN
            </h2>
            <p className="text-xs text-white/55">Network privacy & tunnel status</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/75">
          Connect or switch VPN locations directly inside the Surfshark app. Android restricts third-party launchers from toggling active VPN tunnels remotely.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            ref={(el) => {
              buttons.current[0] = el
            }}
            type="button"
            onMouseEnter={() => setSelected(0)}
            onClick={onOpen}
            className={cn(
              'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold outline-none transition-all duration-150',
              selected === 0 ? 'scale-[1.03]' : 'text-white hover:bg-white/15',
            )}
            style={
              selected === 0
                ? {
                    backgroundColor: tokens.accent,
                    color: tokens.accentText,
                    boxShadow: `inset 0 0 0 1px ${tokens.accent}, 0 0 20px ${tokens.glow1}`,
                  }
                : {
                    backgroundColor: tokens.glass,
                    boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                  }
            }
          >
            <ExternalLink className="size-4" />
            <span>Open Surfshark</span>
          </button>

          <button
            ref={(el) => {
              buttons.current[1] = el
            }}
            type="button"
            onMouseEnter={() => setSelected(1)}
            onClick={onClose}
            className={cn(
              'rounded-full px-5 py-2.5 text-sm font-semibold outline-none transition-all duration-150',
              selected === 1 ? 'scale-[1.03] text-white' : 'text-white/80 hover:bg-white/15',
            )}
            style={
              selected === 1
                ? {
                    backgroundColor: tokens.surfaceElevated,
                    boxShadow: `inset 0 0 0 1.5px ${tokens.accent}, 0 0 18px ${tokens.glow1}`,
                  }
                : {
                    backgroundColor: tokens.glass,
                    boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                  }
            }
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
