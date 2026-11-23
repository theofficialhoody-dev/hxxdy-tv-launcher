'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Palette, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { applyThemeCssVariables, colorWithAlpha, resolveThemeTokens, themeTokensToCssVars, type ThemeConfig } from '@/lib/theme-data'
import { cn } from '@/lib/utils'

type ThemeModalProps = {
  isOpen: boolean
  onClose: () => void
  currentThemeId: string
  allThemes: ThemeConfig[]
  onSelectTheme: (theme: ThemeConfig) => void
  onOpenCreateModal: () => void
  onEditCustomTheme?: (theme: ThemeConfig) => void
  onDeleteCustomTheme: (id: string) => void
}

type ModalZone = 'toolbar' | 'shelf'

export function ThemeModal({
  isOpen,
  onClose,
  currentThemeId,
  allThemes,
  onSelectTheme,
  onOpenCreateModal,
  onEditCustomTheme,
  onDeleteCustomTheme,
}: ThemeModalProps) {
  const [zone, setZone] = useState<ModalZone>('shelf')
  const [shelfIndex, setShelfIndex] = useState(0)
  const [toolbarIndex, setToolbarIndex] = useState(0)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const shelfRef = useRef<HTMLUListElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const toolbarRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pointerReady = useRef(true)

  const activeThemeObj = allThemes.find((t) => t.id === currentThemeId) || allThemes[0]
  const focusedTheme = allThemes[shelfIndex] || activeThemeObj
  const previewTheme = zone === 'shelf' ? focusedTheme : activeThemeObj
  const previewTokens = resolveThemeTokens(previewTheme)

  const handleClose = useCallback(() => {
    setConfirmDeleteId(null)
    if (activeThemeObj) applyThemeCssVariables(activeThemeObj)
    onClose()
  }, [activeThemeObj, onClose])

  useEffect(() => {
    if (!isOpen) return
    const onKey = () => {
      pointerReady.current = false
    }
    const onMove = (event: MouseEvent) => {
      if (event.movementX || event.movementY) pointerReady.current = true
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousemove', onMove)
    }
  }, [isOpen])

  // On open, focus current theme
  useEffect(() => {
    if (isOpen) {
      const idx = allThemes.findIndex((t) => t.id === currentThemeId)
      setShelfIndex(idx >= 0 ? idx : 0)
      setZone('shelf')
      setConfirmDeleteId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Scroll focused card into view cleanly
  useEffect(() => {
    if (!isOpen) return

    if (zone === 'shelf') {
      const el = cardRefs.current[shelfIndex]
      el?.focus({ preventScroll: true })
      const shelf = shelfRef.current
      if (shelf && el) {
        const item = (el.parentElement ?? el) as HTMLElement
        const padding = window.innerWidth * 0.05
        const itemStart = item.offsetLeft || 0
        shelf.scrollTo({ left: Math.max(0, itemStart - padding), behavior: 'auto' })
      }
    } else {
      toolbarRefs.current[toolbarIndex]?.focus({ preventScroll: true })
    }
  }, [isOpen, zone, shelfIndex, toolbarIndex])

  // Live preview current focused theme on the TV
  useEffect(() => {
    if (!isOpen) return
    if (previewTheme) applyThemeCssVariables(previewTheme)
  }, [isOpen, previewTheme])

  // D-Pad / Remote control listener
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key
      const code = e.keyCode

      const isBack =
        ['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key) ||
        code === 27 ||
        code === 8 ||
        code === 4
      const isSelect =
        ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) ||
        code === 13 ||
        code === 23 ||
        code === 66

      if ((key === 'e' || key === 'E') && zone === 'shelf') {
        const selected = allThemes[shelfIndex]
        if (selected?.isCustom && onEditCustomTheme) {
          e.preventDefault()
          onEditCustomTheme(selected)
        }
        return
      }

      if ((key === 'ContextMenu' || key === 'Delete' || key === 'i' || key === 'I') && zone === 'shelf') {
        const selected = allThemes[shelfIndex]
        if (selected?.isCustom) {
          e.preventDefault()
          if (confirmDeleteId === selected.id) {
            onDeleteCustomTheme(selected.id)
            setConfirmDeleteId(null)
            setShelfIndex((prev) => Math.max(0, prev - 1))
          } else {
            setConfirmDeleteId(selected.id)
          }
        }
        return
      }

      if (isBack) {
        e.preventDefault()
        if (confirmDeleteId) {
          setConfirmDeleteId(null)
        } else {
          handleClose()
        }
        return
      }

      if (key === 'ArrowUp' || code === 38 || code === 19) {
        e.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'shelf') setZone('toolbar')
        return
      }

      if (key === 'ArrowDown' || code === 40 || code === 20) {
        e.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'toolbar') setZone('shelf')
        return
      }

      if (key === 'ArrowLeft' || code === 37 || code === 21) {
        e.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'shelf') {
          setShelfIndex((prev) => Math.max(0, prev - 1))
        } else {
          setToolbarIndex((prev) => Math.max(0, prev - 1))
        }
        return
      }

      if (key === 'ArrowRight' || code === 39 || code === 22) {
        e.preventDefault()
        setConfirmDeleteId(null)
        if (zone === 'shelf') {
          setShelfIndex((prev) => Math.min(allThemes.length - 1, prev + 1))
        } else {
          setToolbarIndex((prev) => Math.min(2, prev + 1))
        }
        return
      }

      if (isSelect) {
        e.preventDefault()
        if (zone === 'shelf') {
          const selected = allThemes[shelfIndex]
          if (confirmDeleteId && selected?.id === confirmDeleteId) {
            onDeleteCustomTheme(selected.id)
            setConfirmDeleteId(null)
            setShelfIndex((prev) => Math.max(0, prev - 1))
            return
          }
          if (selected) onSelectTheme(selected)
        } else {
          if (toolbarIndex === 0) onOpenCreateModal()
          else if (toolbarIndex === 1) {
            const defaultTheme = allThemes[0]
            if (defaultTheme) {
              onSelectTheme(defaultTheme)
              setShelfIndex(0)
            }
          } else {
            handleClose()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    zone,
    shelfIndex,
    toolbarIndex,
    allThemes,
    confirmDeleteId,
    onSelectTheme,
    onOpenCreateModal,
    onEditCustomTheme,
    onDeleteCustomTheme,
    handleClose,
  ])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-browser-title"
      className="tv-menu-focus fixed inset-0 z-50 flex flex-col justify-between overflow-hidden text-white select-none animate-in fade-in duration-200 will-change-[opacity]"
      style={{
        ...themeTokensToCssVars(previewTokens),
        background: `
          radial-gradient(ellipse 85% 55% at 72% 14%, ${previewTokens.glow1}, transparent 68%),
          radial-gradient(ellipse 70% 50% at 18% 86%, ${previewTokens.glow2}, transparent 70%),
          ${colorWithAlpha(previewTokens.bg, 0.90)}
        `,
      }}
    >
      {/* Top TV Navigation Bar */}
      <div
        className="flex items-center justify-between border-b px-[5vw] pt-[4vh] pb-[2vh]"
        style={{ borderColor: previewTokens.glassBorder }}
      >
        <div className="flex items-center gap-[1.2vw]">
          <span
            className="grid size-[clamp(44px,3.2vw,60px)] place-items-center rounded-2xl shadow-xl transition-colors duration-300"
            style={{
              backgroundColor: previewTokens.accent,
              color: previewTokens.accentText,
              boxShadow: `0 8px 30px ${previewTokens.glow1}`,
            }}
          >
            <Palette className="size-[52%]" strokeWidth={1.8} />
          </span>
          <div>
            <div className="flex items-baseline gap-3">
              <h2
                id="theme-browser-title"
                className="text-[clamp(20px,1.7vw,34px)] font-bold tracking-tight text-white"
              >
                TV Themes
              </h2>
              <span className="text-[clamp(12px,0.85vw,16px)] font-medium tabular-nums text-white/55">
                {allThemes.length} palettes
              </span>
            </div>
            <p className="text-[clamp(12px,0.9vw,17px)] text-white/65">
              Atmospheric palettes with live screen preview
            </p>
          </div>
        </div>

        {/* TV Top Toolbar Actions */}
        <div className="flex items-center gap-[0.8vw]">
          <button
            ref={(el) => {
              toolbarRefs.current[0] = el
            }}
            type="button"
            onClick={onOpenCreateModal}
            onMouseEnter={() => {
              if (!pointerReady.current) return
              setZone('toolbar')
              setToolbarIndex(0)
            }}
            className={cn(
              'flex h-[clamp(38px,2.7vw,52px)] items-center gap-[0.55em] rounded-full px-[1.3em] text-[clamp(12px,0.9vw,17px)] font-semibold outline-none transition-all duration-150',
              zone === 'toolbar' && toolbarIndex === 0 ? 'scale-103' : 'hover:scale-102',
            )}
            style={{
              backgroundColor: previewTokens.accent,
              color: previewTokens.accentText,
              boxShadow:
                zone === 'toolbar' && toolbarIndex === 0
                  ? `inset 0 0 0 1.5px rgba(255,255,255,0.65), 0 6px 24px ${previewTokens.glow1}`
                  : `0 4px 18px ${previewTokens.glow1}`,
            }}
          >
            <Plus className="size-[1.1em] stroke-[2.5]" />
            <span>Create Theme</span>
          </button>

          <button
            ref={(el) => {
              toolbarRefs.current[1] = el
            }}
            type="button"
            onClick={() => {
              if (allThemes[0]) {
                onSelectTheme(allThemes[0])
                setShelfIndex(0)
              }
            }}
            onMouseEnter={() => {
              if (!pointerReady.current) return
              setZone('toolbar')
              setToolbarIndex(1)
            }}
            className={cn(
              'flex h-[clamp(38px,2.7vw,52px)] items-center gap-[0.5em] rounded-full px-[1.15em] text-[clamp(12px,0.9vw,17px)] font-medium outline-none transition-all duration-150',
              zone === 'toolbar' && toolbarIndex === 1 ? 'scale-103 text-white font-semibold' : 'text-white/80 hover:text-white',
            )}
            style={{
              backgroundColor:
                zone === 'toolbar' && toolbarIndex === 1 ? previewTokens.surfaceElevated : previewTokens.surface,
              boxShadow:
                zone === 'toolbar' && toolbarIndex === 1
                  ? `inset 0 0 0 1.5px ${previewTokens.accent}, 0 0 20px ${previewTokens.glow1}`
                  : `inset 0 0 0 1px ${previewTokens.glassBorder}`,
            }}
          >
            <RotateCcw className="size-[1.05em]" />
            <span>Reset</span>
          </button>

          <button
            ref={(el) => {
              toolbarRefs.current[2] = el
            }}
            type="button"
            onClick={handleClose}
            aria-label="Close theme browser"
            onMouseEnter={() => {
              if (!pointerReady.current) return
              setZone('toolbar')
              setToolbarIndex(2)
            }}
            className={cn(
              'grid size-[clamp(38px,2.7vw,52px)] place-items-center rounded-full outline-none transition-all duration-150',
              zone === 'toolbar' && toolbarIndex === 2 ? 'scale-103 text-white' : 'text-white/80 hover:text-white',
            )}
            style={{
              backgroundColor:
                zone === 'toolbar' && toolbarIndex === 2 ? previewTokens.surfaceElevated : previewTokens.surface,
              boxShadow:
                zone === 'toolbar' && toolbarIndex === 2
                  ? `inset 0 0 0 1.5px ${previewTokens.accent}, 0 0 20px ${previewTokens.glow1}`
                  : `inset 0 0 0 1px ${previewTokens.glassBorder}`,
            }}
          >
            <X className="size-[1.15em]" />
          </button>
        </div>
      </div>

      {/* Main TV Horizontal Shelf */}
      <div className="relative my-auto flex flex-col justify-center">
        <div className="px-[5vw] mb-[1.8vh] flex items-baseline justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[clamp(11px,0.8vw,15px)] font-semibold uppercase tracking-[0.18em] text-white/50">
              Previewing
            </span>
            <span className="truncate text-[clamp(18px,1.4vw,28px)] font-bold text-white">
              {focusedTheme.name}
            </span>
            {focusedTheme.id === currentThemeId && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[clamp(10px,0.72vw,13px)] font-bold"
                style={{
                  backgroundColor: previewTokens.accent,
                  color: previewTokens.accentText,
                }}
              >
                <Check className="size-[1.05em] stroke-[3]" />
                Active
              </span>
            )}
          </div>

          <p className="hidden md:block max-w-xl truncate text-right text-[clamp(12px,0.92vw,17px)] text-white/65">
            {focusedTheme.description}
          </p>
        </div>

        <ul
          ref={shelfRef}
          className="no-scrollbar relative flex gap-[2vw] overflow-x-auto px-[5vw] py-[3vh]"
        >
          {allThemes.map((theme, index) => {
            const isFocused = zone === 'shelf' && index === shelfIndex
            const isCurrent = theme.id === currentThemeId
            const confirmingDelete = confirmDeleteId === theme.id
            const cardTokens = resolveThemeTokens(theme)

            return (
              <li key={theme.id} className="shrink-0 flex flex-col">
                <button
                  ref={(el) => {
                    cardRefs.current[index] = el
                  }}
                  type="button"
                  onClick={() => onSelectTheme(theme)}
                  onMouseEnter={() => {
                    if (!pointerReady.current) return
                    setZone('shelf')
                    setShelfIndex(index)
                  }}
                  className={cn(
                    'group relative flex w-[clamp(260px,22vw,440px)] flex-col overflow-hidden rounded-[clamp(16px,1.3vw,26px)] text-left outline-none transition-transform duration-150 ease-out',
                    isFocused ? 'z-20 scale-[1.05]' : isCurrent ? 'opacity-95' : 'opacity-85 hover:opacity-100',
                  )}
                  style={{
                    backgroundColor: cardTokens.bg,
                    boxShadow: isFocused
                      ? `inset 0 0 0 1.5px ${cardTokens.accent}, 0 24px 60px ${cardTokens.glow1}`
                      : `inset 0 0 0 1px ${isCurrent ? cardTokens.accent : cardTokens.glassBorder}`,
                  }}
                >
                  <div className="relative flex aspect-[16/9] w-full flex-col justify-between overflow-hidden p-[1.4vw]">
                    <div
                      className="pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background: `
                          radial-gradient(ellipse 90% 70% at 75% 20%, ${cardTokens.glow1}, transparent 65%),
                          radial-gradient(ellipse 70% 50% at 20% 80%, ${cardTokens.glow2}, transparent 70%)
                        `,
                      }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-[0.45vw]">
                        <span
                          className="size-[clamp(12px,0.9vw,17px)] rounded-full border border-white/40 shadow-sm"
                          style={{ backgroundColor: cardTokens.bg }}
                        />
                        <span
                          className="size-[clamp(12px,0.9vw,17px)] rounded-full shadow-md"
                          style={{ backgroundColor: cardTokens.accent }}
                        />
                        <div
                          className="h-[clamp(8px,0.55vw,11px)] w-[clamp(30px,2.1vw,46px)] rounded-full border border-white/25"
                          style={{
                            background: `linear-gradient(90deg, ${cardTokens.accent}, ${cardTokens.accent2})`,
                          }}
                        />
                      </div>

                      {isCurrent && (
                        <span
                          className="flex items-center gap-1 rounded-full px-[0.7em] py-[0.2em] text-[clamp(10px,0.7vw,13px)] font-bold shadow-md"
                          style={{
                            backgroundColor: cardTokens.accent,
                            color: cardTokens.accentText,
                          }}
                        >
                          <Check className="size-[1.05em] stroke-[3]" />
                          Active
                        </span>
                      )}
                    </div>

                    <div className="relative z-10 flex items-end justify-between gap-2 pt-2">
                      <div className="min-w-0 space-y-0.5">
                        <span className="block truncate text-[clamp(16px,1.18vw,23px)] font-bold leading-tight tracking-tight text-white">
                          {theme.name}
                        </span>
                        <span className="block truncate text-[clamp(11px,0.78vw,15px)] text-white/70">
                          {theme.description}
                        </span>
                      </div>

                      <span
                        className="shrink-0 rounded-full px-[0.95em] py-[0.32em] text-[clamp(11px,0.78vw,14px)] font-semibold shadow-md"
                        style={{
                          backgroundColor: isFocused ? cardTokens.accent : 'rgba(255,255,255,0.16)',
                          color: isFocused ? cardTokens.accentText : '#ffffff',
                        }}
                      >
                        {isCurrent ? 'Current' : 'Apply'}
                      </span>
                    </div>
                  </div>
                </button>

                {theme.isCustom && (
                  <div className="mt-2 flex items-center justify-between px-2">
                    <span className="text-[clamp(10px,0.7vw,13px)] text-white/50">
                      {confirmingDelete ? 'Confirm delete?' : 'Custom theme'}
                    </span>
                    {confirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCustomTheme(theme.id)
                            setConfirmDeleteId(null)
                            setShelfIndex((prev) => Math.max(0, prev - 1))
                          }}
                          className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[clamp(10px,0.72vw,13px)] font-bold text-white hover:bg-rose-400"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full bg-white/15 px-2.5 py-0.5 text-[clamp(10px,0.72vw,13px)] font-medium text-white/80 hover:bg-white/25"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {onEditCustomTheme && (
                          <button
                            type="button"
                            onClick={() => onEditCustomTheme(theme)}
                            aria-label={`Edit custom theme ${theme.name}`}
                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[clamp(10px,0.72vw,13px)] font-medium text-white/80 hover:bg-white/15 hover:text-white"
                          >
                            <Pencil className="size-[0.95em]" />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(theme.id)}
                          aria-label={`Delete custom theme ${theme.name}`}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[clamp(10px,0.72vw,13px)] font-medium text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="size-[1em]" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <div className="pb-[3.5vh]" />
    </div>
  )
}
