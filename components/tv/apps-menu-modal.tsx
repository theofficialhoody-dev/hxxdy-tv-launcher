'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Grid2X2,
  Home,
  Lock,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { services, type LauncherApp, type ServiceId } from '@/lib/launcher-data'
import { resolveThemeTokens, themeTokensToCssVars, type ThemeConfig } from '@/lib/theme-data'
import { cn } from '@/lib/utils'
import { ServiceLogo } from './service-logo'
import { TvKeyboard } from './tv-keyboard'

export type AppsMenuModalProps = {
  isOpen: boolean
  onClose: () => void
  installedApps: ServiceId[]
  nativeApps: ReadonlyMap<string, LauncherApp>
  homeRowApps: ServiceId[]
  onLaunchApp: (id: ServiceId) => void
  onToggleHomeRow: (id: ServiceId) => void
  onInstallApp: (id: ServiceId) => void
  onUninstallApp: (id: ServiceId) => void
  onSearchPlayStore?: (query: string) => void
  onOpenPlayListing?: (pkg: string) => void
  initialTab?: 'installed' | 'store'
  initialRowEdit?: boolean
  currentTheme: ThemeConfig
  simulateInstall?: boolean
}

type PlayApp = { pkg: string; name: string; icon: string; artwork?: string | null }

export function AppsMenuModal({
  isOpen,
  onClose,
  installedApps,
  nativeApps,
  homeRowApps,
  onLaunchApp,
  onToggleHomeRow,
  onInstallApp,
  onUninstallApp,
  onSearchPlayStore,
  onOpenPlayListing,
  initialTab = 'installed',
  initialRowEdit = false,
  currentTheme,
  simulateInstall = true,
}: AppsMenuModalProps) {
  const [tab, setTab] = useState<'installed' | 'store'>(initialTab)
  const [query, setQuery] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [rowEditMode, setRowEditMode] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [activeTileId, setActiveTileId] = useState<string | null>(null)
  const [playApps, setPlayApps] = useState<PlayApp[]>([])
  const [playStatus, setPlayStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)

  const playCache = useRef(new Map<string, PlayApp[]>())
  const pointerReadyRef = useRef(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)
  const storeTabRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const rowEditRef = useRef<HTMLButtonElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)

  const nativeAppsByPackage = useMemo(
    () => new Map(Array.from(nativeApps.values(), (app) => [app.pkg, app])),
    [nativeApps],
  )

  const apps = useMemo(() => {
    const source =
      tab === 'installed'
        ? installedApps.map((id) => services[id]).filter(Boolean)
        : Object.values(services).filter((app) => !app.native)
    const term = query.trim().toLowerCase()
    return source.filter(
      (app) =>
        !term ||
        `${nativeApps.get(app.id)?.label ?? app.name} ${app.description} ${app.developer} ${app.category}`
          .toLowerCase()
          .includes(term),
    )
  }, [tab, installedApps, nativeApps, query])

  // Track pointer movement vs D-Pad so stationary hover never fights remote focus
  useEffect(() => {
    if (!isOpen) return
    const onPointerMove = (event: MouseEvent) => {
      if (event.movementX || event.movementY) pointerReadyRef.current = true
    }
    window.addEventListener('mousemove', onPointerMove)
    return () => window.removeEventListener('mousemove', onPointerMove)
  }, [isOpen])

  // Reset state cleanly on open
  useEffect(() => {
    if (!isOpen) return
    setTab(initialTab)
    setQuery('')
    setKeyboardOpen(false)
    setDeleteMode(false)
    setRowEditMode(initialRowEdit)
    setFocusedId(null)
    setActiveTileId(null)
    requestAnimationFrame(() => {
      const target = initialRowEdit
        ? rootRef.current?.querySelector<HTMLButtonElement>('[data-app]:not(:disabled)')
        : initialTab === 'store'
          ? storeTabRef.current
          : tabRef.current
      target?.focus({ preventScroll: true })
    })
  }, [isOpen, initialTab, initialRowEdit])

  // Native Google Play live catalog search
  useEffect(() => {
    if (!isOpen || tab !== 'store' || simulateInstall) return
    const term = query.trim()
    const cached = playCache.current.get(term)
    if (cached) {
      setPlayApps(cached)
      setPlayStatus('ready')
      return
    }
    const controller = new AbortController()
    setPlayApps([])
    setPlayStatus('loading')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/__play_search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Google Play returned ${response.status}`)
        const data: { apps: PlayApp[] } = await response.json()
        if (!Array.isArray(data.apps) || data.apps.length === 0) {
          throw new Error('No Play listings returned')
        }
        playCache.current.set(term, data.apps)
        setPlayApps(data.apps)
        setPlayStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        console.warn('Unable to load Google Play listings', error)
        setPlayStatus('error')
      }
    }, term ? 450 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [isOpen, tab, query, simulateInstall, retry])

  const closeKeyboard = (focusFirstResult = false) => {
    setKeyboardOpen(false)
    requestAnimationFrame(() => {
      if (focusFirstResult) {
        const firstTile = rootRef.current?.querySelector<HTMLButtonElement>('[data-app]:not(:disabled)')
        if (firstTile) {
          firstTile.focus({ preventScroll: true })
          return
        }
      }
      searchTriggerRef.current?.focus({ preventScroll: true })
    })
  }

  // D-Pad & keyboard spatial navigation across the whole My Apps stage
  useEffect(() => {
    if (!isOpen || keyboardOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, keyCode: code, ctrlKey, metaKey, altKey } = event

      if (
        ['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key) ||
        code === 4 ||
        code === 27 ||
        code === 8
      ) {
        event.preventDefault()
        if (deleteMode) {
          setDeleteMode(false)
          requestAnimationFrame(() => deleteRef.current?.focus({ preventScroll: true }))
        } else if (rowEditMode) {
          setRowEditMode(false)
          requestAnimationFrame(() => rowEditRef.current?.focus({ preventScroll: true }))
        } else {
          onClose()
        }
        return
      }

      if (
        ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) ||
        code === 13 ||
        code === 23 ||
        code === 66
      ) {
        event.preventDefault()
        if (!event.repeat && document.activeElement instanceof HTMLButtonElement) {
          document.activeElement.click()
        }
        return
      }

      // If user starts typing while focused on Search trigger, open custom keyboard with that character
      if (
        document.activeElement === searchTriggerRef.current &&
        key.length === 1 &&
        !ctrlKey &&
        !metaKey &&
        !altKey
      ) {
        event.preventDefault()
        setQuery((prev) => prev + key)
        setKeyboardOpen(true)
        return
      }

      if (
        (key === 'ContextMenu' || key === 'm' || key === 'M' || code === 82) &&
        tab === 'installed' &&
        !deleteMode
      ) {
        const targetId = focusedId ?? apps[0]?.id
        if (targetId) {
          event.preventDefault()
          onToggleHomeRow(targetId)
          return
        }
      }

      const direction =
        key === 'ArrowRight' || code === 39 || code === 22
          ? 'right'
          : key === 'ArrowLeft' || code === 37 || code === 21
            ? 'left'
            : key === 'ArrowDown' || code === 40 || code === 20
              ? 'down'
              : key === 'ArrowUp' || code === 38 || code === 19
                ? 'up'
                : null
      if (!direction) return

      pointerReadyRef.current = false
      event.preventDefault()
      const root = rootRef.current
      const current = document.activeElement
      if (!root || !(current instanceof HTMLElement)) return

      const bounds = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      }
      const from = bounds(current)
      const fromX = from.x + from.width / 2
      const fromY = from.y + from.height / 2

      let best: HTMLElement | undefined
      let bestScore = Infinity
      for (const candidate of root.querySelectorAll<HTMLElement>('button:not(:disabled)')) {
        if (candidate === current || candidate.offsetParent === null) continue
        const to = bounds(candidate)
        const dx = to.x + to.width / 2 - fromX
        const dy = to.y + to.height / 2 - fromY
        const horizontal = direction === 'right' || direction === 'left'
        if (
          current.dataset.app &&
          horizontal &&
          (!candidate.dataset.app || Math.abs(dy) > from.height * 0.65)
        ) {
          continue
        }
        const primary =
          direction === 'right'
            ? dx
            : direction === 'left'
              ? -dx
              : direction === 'down'
                ? dy
                : -dy
        if (primary <= 1) continue
        const cross = horizontal ? Math.abs(dy) : Math.abs(dx)
        const aligned = horizontal
          ? to.y < from.y + from.height && to.y + to.height > from.y
          : to.x < from.x + from.width && to.x + to.width > from.x
        const score = primary + cross * 2 + (aligned ? 0 : 10000)
        if (score < bestScore) {
          best = candidate
          bestScore = score
        }
      }
      best?.focus({ preventScroll: true })
      best?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    keyboardOpen,
    deleteMode,
    rowEditMode,
    onClose,
    tab,
    focusedId,
    apps,
    onToggleHomeRow,
  ])

  if (!isOpen) return null

  const selectTab = (next: 'installed' | 'store') => {
    setTab(next)
    setQuery('')
    setKeyboardOpen(false)
    setDeleteMode(false)
    setRowEditMode(false)
    setFocusedId(null)
    setActiveTileId(null)
  }

  const focusFirstAppTile = () => {
    requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector<HTMLButtonElement>('[data-app]:not(:disabled)')
        ?.focus({ preventScroll: true }),
    )
  }

  const toggleRowEdit = () => {
    const next = !rowEditMode
    setRowEditMode(next)
    setDeleteMode(false)
    setKeyboardOpen(false)
    if (next) focusFirstAppTile()
  }

  const toggleDeleteMode = () => {
    const next = !deleteMode
    setDeleteMode(next)
    setRowEditMode(false)
    setKeyboardOpen(false)
    if (next) focusFirstAppTile()
  }

  const tokens = resolveThemeTokens(currentTheme)
  const accent = tokens.accent
  const accentText = tokens.accentText
  const glow1 = tokens.glow1
  const glow2 = tokens.glow2

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apps-menu-title"
      onFocusCapture={(event) => {
        const id = (event.target as HTMLElement).dataset.app
        if (id) {
          setFocusedId(id)
          setActiveTileId(id)
        } else {
          setActiveTileId(null)
        }
      }}
      className="tv-menu-focus fixed inset-0 z-50 flex flex-col overflow-hidden text-white select-none animate-in fade-in duration-200"
      style={{
        ...themeTokensToCssVars(tokens),
        backgroundColor: tokens.bg,
      }}
    >
      {/* Atmospheric Theme Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 85% 55% at 75% 8%, ${glow1}, transparent 68%),
            radial-gradient(ellipse 70% 50% at 15% 88%, ${glow2}, transparent 70%),
            radial-gradient(circle at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.72) 100%)
          `,
        }}
      />

      {/* Single-Row Top Bar: Fixed Heading -> Tabs -> Fixed-Position Search -> Right Actions */}
      <header
        className="relative z-20 flex shrink-0 flex-nowrap items-center gap-[1.1vw] border-b px-[4.5vw] pt-[3vh] pb-[2vh]"
        style={{ borderBottomColor: tokens.glassBorder }}
      >
        {/* Fixed-width Heading */}
        <div className="w-[clamp(112px,9.5vw,152px)] shrink-0">
          <h2
            id="apps-menu-title"
            className="text-[clamp(21px,1.85vw,32px)] font-bold leading-none tracking-tight text-white"
          >
            My Apps
          </h2>
          <p className="mt-1 whitespace-nowrap text-[clamp(10px,0.72vw,13px)] font-medium tabular-nums text-white/55">
            {tab === 'installed' ? (
              <>
                {installedApps.length} installed · {homeRowApps.length} Home
              </>
            ) : (
              'Google Play'
            )}
          </p>
        </div>

        {/* Segmented Tabs */}
        <nav
          aria-label="App Library Views"
          className="flex shrink-0 items-center gap-0.5 rounded-full p-1"
          style={{
            backgroundColor: tokens.surface,
            boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
          }}
        >
          <button
            ref={tabRef}
            type="button"
            onClick={() => selectTab('installed')}
            className={cn(
              'whitespace-nowrap shrink-0 rounded-full px-[1.05em] py-[0.42em] text-[clamp(11px,0.8vw,14px)] font-medium outline-none transition-colors duration-150',
              tab === 'installed'
                ? 'font-semibold'
                : 'text-white/70 hover:bg-white/10 hover:text-white focus:bg-white/15 focus:text-white focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]',
            )}
            style={
              tab === 'installed'
                ? {
                    backgroundColor: accent,
                    color: accentText,
                    boxShadow: `0 0 16px ${glow1}`,
                  }
                : undefined
            }
          >
            Installed
          </button>
          <button
            ref={storeTabRef}
            type="button"
            onClick={() => selectTab('store')}
            className={cn(
              'whitespace-nowrap shrink-0 rounded-full px-[1.05em] py-[0.42em] text-[clamp(11px,0.8vw,14px)] font-medium outline-none transition-colors duration-150',
              tab === 'store'
                ? 'font-semibold'
                : 'text-white/70 hover:bg-white/10 hover:text-white focus:bg-white/15 focus:text-white focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]',
            )}
            style={
              tab === 'store'
                ? {
                    backgroundColor: accent,
                    color: accentText,
                    boxShadow: `0 0 16px ${glow1}`,
                  }
                : undefined
            }
          >
            Google Play
          </button>
        </nav>

        {/* Fixed-Position Search Trigger (Anchored right after tabs so it NEVER moves across tabs) */}
        <div className="relative flex w-[clamp(148px,15.5vw,235px)] shrink-0 items-center">
          <button
            ref={searchTriggerRef}
            type="button"
            onClick={() => setKeyboardOpen(true)}
            aria-label={
              query
                ? `Search: ${query}. Select to edit with on-screen keyboard`
                : tab === 'installed'
                  ? 'Search installed apps'
                  : 'Search Google Play'
            }
            className={cn(
              'flex h-[clamp(34px,2.35vw,40px)] w-full items-center gap-2 rounded-full pl-3.5 text-left text-[clamp(11px,0.78vw,13px)] outline-none transition-colors duration-150',
              query ? 'pr-8' : 'pr-3.5',
              keyboardOpen
                ? 'text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white focus:bg-white/12 focus:text-white focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]',
            )}
            style={{
              backgroundColor: keyboardOpen ? tokens.surfaceElevated : tokens.surface,
              boxShadow: keyboardOpen
                ? `inset 0 0 0 1.5px ${accent}, 0 0 16px ${glow1}`
                : `inset 0 0 0 1px ${tokens.glassBorder}`,
            }}
          >
            <Search className="size-3.5 shrink-0 text-white/55" aria-hidden="true" />
            <span className={cn('truncate', query ? 'text-white' : 'text-white/45')}>
              {query || (tab === 'installed' ? 'Search apps' : 'Search Play')}
            </span>
          </button>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 grid size-5 place-items-center rounded-full text-white/60 outline-none hover:bg-white/15 hover:text-white focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Right-Aligned Contextual Mode Controls */}
        <div className="ml-auto flex shrink-0 items-center gap-[0.5vw]">
          {tab === 'store' && onSearchPlayStore && (
            <button
              type="button"
              onClick={() => onSearchPlayStore(query.trim())}
              className="flex h-[clamp(34px,2.35vw,40px)] whitespace-nowrap shrink-0 items-center justify-center rounded-full px-3.5 text-[clamp(11px,0.78vw,13px)] font-medium text-white/90 outline-none transition-colors hover:bg-white/15 focus:bg-white/15 focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]"
              style={{
                backgroundColor: tokens.surface,
                boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
              }}
            >
              Open Play
            </button>
          )}

          {tab === 'installed' && (
            <>
              <button
                ref={rowEditRef}
                type="button"
                onClick={toggleRowEdit}
                className={cn(
                  'flex h-[clamp(34px,2.35vw,40px)] min-w-[clamp(96px,7.5vw,120px)] whitespace-nowrap shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[clamp(11px,0.78vw,13px)] font-medium outline-none transition-colors duration-150',
                  rowEditMode
                    ? 'font-semibold'
                    : 'text-white/85 hover:bg-white/15 hover:text-white focus:bg-white/15 focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]',
                )}
                style={
                  rowEditMode
                    ? {
                        backgroundColor: accent,
                        color: accentText,
                        boxShadow: `0 0 18px ${glow1}`,
                      }
                    : {
                        backgroundColor: tokens.surface,
                        boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                      }
                }
              >
                {rowEditMode ? (
                  <Check className="size-3.5 stroke-[2.2]" />
                ) : (
                  <SlidersHorizontal className="size-3.5" />
                )}
                <span>{rowEditMode ? 'Done' : 'Edit Row'}</span>
              </button>

              <button
                ref={deleteRef}
                type="button"
                onClick={toggleDeleteMode}
                className={cn(
                  'flex h-[clamp(34px,2.35vw,40px)] min-w-[clamp(86px,6.8vw,108px)] whitespace-nowrap shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[clamp(11px,0.78vw,13px)] font-medium outline-none transition-colors duration-150',
                  deleteMode
                    ? 'bg-rose-500 text-white ring-1 ring-inset ring-rose-300/60'
                    : 'text-white/85 hover:bg-white/15 hover:text-white focus:bg-white/15 focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]',
                )}
                style={
                  deleteMode
                    ? undefined
                    : {
                        backgroundColor: tokens.surface,
                        boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                      }
                }
              >
                {deleteMode ? (
                  <Check className="size-3.5 stroke-[2.2]" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>{deleteMode ? 'Done' : 'Remove'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close My Apps"
            className="grid size-[clamp(34px,2.35vw,40px)] shrink-0 place-items-center rounded-full text-white/85 outline-none transition-colors hover:bg-white/15 hover:text-white focus:bg-white/15 focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]"
            style={{
              backgroundColor: tokens.surface,
              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Compact App Shelf Grid */}
      <div
        className={cn(
          'no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto px-[4.5vw] pt-[2.2vh]',
          keyboardOpen ? 'pb-[310px]' : 'pb-[3.5vh]',
        )}
      >
        {tab === 'store' && !simulateInstall ? (
          <div>
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h3 className="text-[clamp(14px,1vw,18px)] font-semibold tracking-tight text-white/90">
                {query.trim() ? 'Search results' : 'Discover apps'}
              </h3>
              <span className="text-[clamp(11px,0.75vw,13px)] text-white/50">
                Google Play listings
              </span>
            </div>

            {playStatus === 'loading' && (
              <div
                className="grid grid-cols-3 gap-x-[1.3vw] gap-y-[2vh] sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
                role="status"
                aria-label="Loading Google Play apps"
              >
                {Array.from({ length: 14 }).map((_, index) => (
                  <div key={index} className="animate-pulse">
                    <div
                      className="aspect-[16/10] w-full rounded-[clamp(10px,0.8vw,16px)]"
                      style={{
                        backgroundColor: tokens.glass,
                        boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                      }}
                    />
                    <div className="mx-auto mt-2 h-3 w-2/3 rounded bg-white/10" />
                  </div>
                ))}
              </div>
            )}

            {playStatus === 'error' && (
              <div
                className="flex flex-col items-start gap-4 rounded-2xl p-7"
                style={{
                  backgroundColor: tokens.surface,
                  boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                }}
              >
                <p className="text-sm text-white/75" role="alert">
                  Could not load Google Play listings. You can retry or open Google Play directly.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                    className="rounded-full px-5 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-white"
                    style={{ backgroundColor: accent, color: accentText }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => onSearchPlayStore?.(query.trim())}
                    className="rounded-full px-5 py-2 text-sm font-medium text-white outline-none hover:bg-white/15 focus:ring-1 focus:ring-inset focus:ring-[var(--tv-accent)]"
                    style={{
                      backgroundColor: tokens.glass,
                      boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                    }}
                  >
                    Open Google Play
                  </button>
                </div>
              </div>
            )}

            {playStatus === 'ready' && (
              <div className="grid grid-cols-3 gap-x-[1.3vw] gap-y-[2vh] sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
                {playApps.map((app) => {
                  const installed = nativeAppsByPackage.get(app.pkg)
                  const isFocused = activeTileId === app.pkg
                  return (
                    <button
                      key={app.pkg}
                      data-app={app.pkg}
                      type="button"
                      aria-label={`View ${app.name} on Google Play`}
                      onMouseEnter={() => {
                        if (!pointerReadyRef.current) return
                        setFocusedId(app.pkg)
                        setActiveTileId(app.pkg)
                      }}
                      onClick={() => onOpenPlayListing?.(app.pkg)}
                      className="group block w-full min-w-0 text-center outline-none"
                    >
                      <div
                        className={cn(
                          'relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[clamp(10px,0.8vw,16px)] transition-all duration-150',
                          isFocused && 'scale-[1.03]',
                        )}
                        style={{
                          backgroundColor: isFocused ? tokens.surface : tokens.glass,
                          boxShadow: isFocused
                            ? `inset 0 0 0 1.5px ${accent}, 0 14px 30px -8px rgba(0,0,0,0.88), 0 0 20px ${glow1}`
                            : `inset 0 0 0 1px ${tokens.glassBorder}`,
                        }}
                      >
                        <PlayAppIcon key={app.pkg} app={app} installed={installed} />
                        {installed && (
                          <span
                            aria-label="Installed"
                            className="absolute right-2 top-2 grid size-4.5 place-items-center rounded-full"
                            style={{
                              backgroundColor: tokens.surface,
                              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                            }}
                          >
                            <Check className="size-2.5" style={{ color: accent }} />
                          </span>
                        )}
                      </div>
                      <div className="mt-[0.9vh] px-0.5 text-center">
                        <span
                          className={cn(
                            'block truncate text-[clamp(11px,0.8vw,14px)] font-medium transition-colors',
                            isFocused ? 'text-white' : 'text-white/75 group-hover:text-white',
                          )}
                          style={isFocused ? { color: accent } : undefined}
                        >
                          {app.name}
                        </span>
                        <span className="block truncate text-[clamp(10px,0.68vw,12px)] text-white/45">
                          {installed ? 'Installed' : 'Google Play'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-[1.8vh] flex items-baseline justify-between gap-4">
              <h3 className="text-[clamp(14px,0.98vw,18px)] font-semibold tracking-tight text-white/85">
                {deleteMode
                  ? 'Select an app to remove or manage'
                  : rowEditMode
                    ? 'Choose which apps appear on your Home row'
                    : tab === 'installed'
                      ? 'All installed apps'
                      : 'Suggested for your TV'}
              </h3>
              <span className="text-[clamp(11px,0.75vw,13px)] tabular-nums text-white/50">
                {deleteMode
                  ? 'Opens Android app info'
                  : rowEditMode
                    ? 'Apps remain installed when hidden'
                    : `${apps.length} ${apps.length === 1 ? 'app' : 'apps'}`}
              </span>
            </div>

            {apps.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-2xl py-14 text-center"
                style={{
                  backgroundColor: tokens.surface,
                  boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                }}
              >
                <Grid2X2 className="mb-3 size-8 text-white/35" />
                <p className="text-sm font-medium text-white/75">No matching apps found</p>
                <p className="mt-1 text-xs text-white/45">
                  {tab === 'store' && onSearchPlayStore
                    ? 'Try pressing Open Play to browse Google Play directly.'
                    : 'Try a different search query.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-[1.3vw] gap-y-[2vh] sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
                {apps.map((app) => {
                  const isInstalled = installedApps.includes(app.id)
                  const onHome = homeRowApps.includes(app.id)
                  const disabled = deleteMode && simulateInstall && app.isDefaultInstalled
                  const nativeApp = nativeApps.get(app.id)
                  const name = nativeApp?.label ?? app.name
                  const isFocused = activeTileId === app.id

                  return (
                    <button
                      key={app.id}
                      data-app={app.id}
                      type="button"
                      disabled={disabled}
                      aria-label={
                        deleteMode
                          ? `Manage ${name}`
                          : rowEditMode
                            ? `${onHome ? 'Remove' : 'Add'} ${name} ${onHome ? 'from' : 'to'} Home row`
                            : `${tab === 'store' && !isInstalled ? 'Find' : 'Open'} ${name}`
                      }
                      onMouseEnter={() => {
                        if (!pointerReadyRef.current || disabled) return
                        setFocusedId(app.id)
                        setActiveTileId(app.id)
                      }}
                      onClick={() =>
                        deleteMode
                          ? onUninstallApp(app.id)
                          : rowEditMode
                            ? onToggleHomeRow(app.id)
                            : tab === 'installed' || isInstalled
                              ? onLaunchApp(app.id)
                              : onInstallApp(app.id)
                      }
                      className={cn(
                        'group block w-full min-w-0 text-center outline-none disabled:cursor-not-allowed disabled:opacity-35',
                        rowEditMode && !onHome && !isFocused && 'opacity-60 hover:opacity-95',
                      )}
                    >
                      {/* Compact Smoked-Glass Tile with Crisp Theme-Synced Selection */}
                      <div
                        className={cn(
                          'relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[clamp(10px,0.8vw,16px)] transition-all duration-150',
                          isFocused && 'scale-[1.03]',
                        )}
                        style={{
                          backgroundColor: isFocused ? tokens.surface : tokens.glass,
                          boxShadow: isFocused
                            ? `inset 0 0 0 1.5px ${deleteMode ? '#fb7185' : accent}, 0 14px 30px -8px rgba(0,0,0,0.88), 0 0 20px ${deleteMode ? 'rgba(251, 113, 133, 0.28)' : glow1}`
                            : `inset 0 0 0 1px ${rowEditMode && onHome ? accent : tokens.glassBorder}`,
                        }}
                      >
                        {/* Centered App Mark / Native Banner */}
                        {nativeApp ? (
                          <NativeAppIcon key={nativeApp.icon} app={nativeApp} />
                        ) : !simulateInstall ? (
                          <Grid2X2 aria-hidden="true" className="size-8 text-white/40" />
                        ) : (
                          <ServiceLogo
                            id={app.id}
                            className={cn(
                              'relative z-10 object-center transition-opacity duration-150',
                              app.native
                                ? 'size-full rounded-[inherit] object-cover'
                                : 'h-[32%] w-[52%]',
                              isFocused ? 'opacity-100' : 'opacity-85',
                            )}
                          />
                        )}

                        {/* Subtle Contextual Corner Indicator */}
                        {rowEditMode && (
                          <span
                            aria-hidden="true"
                            className="absolute right-2 top-2 z-10 grid size-5 place-items-center rounded-full shadow-sm"
                            style={
                              onHome
                                ? { backgroundColor: accent, color: accentText }
                                : {
                                    backgroundColor: tokens.surface,
                                    boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                                  }
                            }
                          >
                            {onHome ? (
                              <Check className="size-3 stroke-[2.8]" />
                            ) : (
                              <Plus className="size-3 text-white/75" />
                            )}
                          </span>
                        )}

                        {!rowEditMode && !deleteMode && tab === 'installed' && onHome && (
                          <span
                            aria-hidden="true"
                            className="absolute right-2 top-2 z-10 grid size-4.5 place-items-center rounded-full"
                            style={{
                              backgroundColor: tokens.surface,
                              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                            }}
                          >
                            <Home
                              className="size-2.5"
                              style={{ color: isFocused ? accent : 'rgba(255,255,255,0.65)' }}
                            />
                          </span>
                        )}

                        {deleteMode && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute right-2 top-2 z-10 grid size-5 place-items-center rounded-full',
                              disabled
                                ? 'text-white/40'
                                : isFocused
                                  ? 'bg-rose-500 text-white'
                                  : 'text-rose-300/80 ring-1 ring-rose-400/30',
                            )}
                            style={
                              disabled || !isFocused
                                ? {
                                    backgroundColor: tokens.surface,
                                    boxShadow: disabled ? `inset 0 0 0 1px ${tokens.glassBorder}` : undefined,
                                  }
                                : undefined
                            }
                          >
                            {disabled ? <Lock className="size-2.5" /> : <Trash2 className="size-2.5" />}
                          </span>
                        )}

                        {tab === 'store' && isInstalled && (
                          <span
                            aria-hidden="true"
                            className="absolute right-2 top-2 z-10 grid size-4.5 place-items-center rounded-full"
                            style={{
                              backgroundColor: tokens.surface,
                              boxShadow: `inset 0 0 0 1px ${tokens.glassBorder}`,
                            }}
                          >
                            <Check className="size-2.5" style={{ color: accent }} />
                          </span>
                        )}
                      </div>

                      {/* Fixed-Alignment Title & Subtitle */}
                      <div className="mt-[0.9vh] px-0.5 text-center">
                        <span
                          className={cn(
                            'block truncate text-[clamp(11px,0.8vw,14px)] font-medium transition-colors',
                            isFocused ? 'text-white' : 'text-white/75 group-hover:text-white',
                          )}
                          style={isFocused && !deleteMode ? { color: accent } : undefined}
                        >
                          {name}
                        </span>
                        <span className="block truncate text-[clamp(10px,0.68vw,12px)] text-white/45">
                          {deleteMode
                            ? disabled
                              ? 'System app'
                              : 'Select to remove'
                            : rowEditMode
                              ? onHome
                                ? 'Pinned to Home'
                                : 'Not on Home'
                              : tab === 'store'
                                ? isInstalled
                                  ? `${app.category} · Installed`
                                  : `${app.category} · ${app.size || 'Get'}`
                                : `${app.category}${onHome ? ' · On Home' : ''}`}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Custom Remote-Friendly Smoked-Glass Keyboard */}
      <TvKeyboard
        isOpen={keyboardOpen}
        value={query}
        placeholder={tab === 'installed' ? 'Search installed apps' : 'Search Google Play'}
        submitLabel="Done"
        currentTheme={currentTheme}
        onChange={setQuery}
        onSubmit={() => closeKeyboard(true)}
        onClose={() => closeKeyboard(false)}
      />
    </div>
  )
}

function PlayAppIcon({ app, installed }: { app: PlayApp; installed?: LauncherApp }) {
  const [artFailed, setArtFailed] = useState(false)
  const [failed, setFailed] = useState(false)
  if (app.artwork && !artFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- artwork comes directly from Google Play.
      <img
        src={app.artwork}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setArtFailed(true)}
        className="size-full rounded-[inherit] object-cover"
      />
    )
  }
  if (installed) return <NativeAppIcon app={installed} />
  return (
    <>
      {failed ? (
        <Grid2X2 aria-hidden="true" className="size-8 text-white/40" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- artwork comes directly from Google Play.
        <img
          src={app.icon.replace(/=s64$/, '=s256')}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-[42%] w-[42%] rounded-xl object-contain object-center"
        />
      )}
    </>
  )
}

function NativeAppIcon({ app }: { app: LauncherApp }) {
  const [failed, setFailed] = useState(false)
  if (!app.icon || failed) return <Grid2X2 aria-hidden="true" className="size-8 text-white/40" />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Android supplies each installed app's banner.
    <img
      src={app.icon}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-full rounded-[inherit] object-cover"
    />
  )
}
