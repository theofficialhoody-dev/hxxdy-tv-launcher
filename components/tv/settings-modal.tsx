'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Info,
  LayoutGrid,
  Monitor,
  Palette,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Sliders,
  User,
  Volume2,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  GRAPHICS_QUALITY_OPTIONS,
  isGraphicsQuality,
  qualityLabel,
  type GraphicsQuality,
  type ResolvedQuality,
} from '@/lib/device-quality'
import { colorWithAlpha, getContrastText, resolveThemeTokens, themeTokensToCssVars, type ThemeConfig } from '@/lib/theme-data'
import { FlowFill } from './flow-fill'
import { getDisplayInfo, getNetwork, type DisplayInfo, type NetworkInfo } from '@/lib/native-bridge'
import {
  getLastNavigationSoundVolume,
  getNavigationSoundVolume,
  setNavigationSoundVolume,
} from '@/lib/navigation-sounds'

export type LauncherSettings = {
  kenBurns: boolean
  autoAdvanceHero: boolean
  clock24h: boolean
  showWeather: boolean
  liveWallpaper: boolean
  graphicsQuality: GraphicsQuality
}

export const DEFAULT_SETTINGS: LauncherSettings = {
  kenBurns: true,
  autoAdvanceHero: true,
  clock24h: false,
  showWeather: true,
  liveWallpaper: false,
  graphicsQuality: 'auto',
}

export function getStoredSettings(): LauncherSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem('tv_launcher_settings')
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        liveWallpaper: parsed.liveWallpaper === true,
        graphicsQuality: isGraphicsQuality(parsed.graphicsQuality) ? parsed.graphicsQuality : 'auto',
      }
    }
  } catch {}
  return DEFAULT_SETTINGS
}

export function saveStoredSettings(settings: LauncherSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('tv_launcher_settings', JSON.stringify(settings))
  } catch {}
}

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  settings: LauncherSettings
  onUpdateSettings: (newSettings: LauncherSettings) => void
  onResetApps: () => void
  installedAppsCount: number
  currentTheme: ThemeConfig
  /** Real Android settings screens; only provided when running inside the native shell. */
  onOpenSystemSettings?: () => void
  onOpenDisplaySettings?: () => void
  /** Amlogic vendor picture menu (Picture > AI-PQ/AI-SR); native shell only. */
  onOpenAmlogicPictureSettings?: () => void
  onOpenSoundSettings?: () => void
  onOpenWifiSettings?: () => void
  onOpenAccountSettings?: () => void
  onSelectProfile: () => void
  onOpenThemes?: () => void
  activeProfileName?: string
  activeProfileColor?: string
  native: boolean
  /** The tier actually in use after Auto is resolved against this device. */
  resolvedQuality?: ResolvedQuality
  /** What Auto would pick here, shown while a manual tier is selected. */
  detectedQuality?: ResolvedQuality
}

type TabCategory = 'display' | 'launcher' | 'audio' | 'apps' | 'network' | 'system'

// Medium is the detected tier on 2 GB boxes and applies no visual downgrade at all, so its copy must
// not promise one. Only Low removes decoration.
const QUALITY_HINTS: Record<ResolvedQuality, string> = {
  high: 'Full design — all effects on.',
  medium: 'Same as High — nothing reduced.',
  low: 'No glow, blur, shadows or motion.',
}

const TABS: { id: TabCategory; label: string; icon: LucideIcon; summary: string }[] = [
  { id: 'display', label: 'Display & Video', icon: Monitor, summary: 'Display mode, HDR & motion' },
  { id: 'launcher', label: 'Launcher Preferences', icon: Sliders, summary: 'Carousel, clock & weather' },
  { id: 'audio', label: 'Audio & Sound', icon: Volume2, summary: 'Navigation audio & output' },
  { id: 'apps', label: 'Apps & Storage', icon: LayoutGrid, summary: 'Home row order & storage' },
  { id: 'network', label: 'Network & Account', icon: Wifi, summary: 'Connectivity & profiles' },
  { id: 'system', label: 'System & About', icon: Info, summary: 'Device & launcher info' },
]

function ToggleSwitch({
  checked,
  accent,
  glow,
}: {
  checked: boolean
  accent: string
  glow: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ring-1 ring-inset',
        checked ? 'ring-transparent' : 'bg-white/12 ring-white/15',
      )}
      style={
        checked
          ? {
              backgroundColor: accent,
              boxShadow: `0 0 14px ${glow}`,
            }
          : undefined
      }
    >
      <span
        className={cn(
          'size-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0 opacity-80',
        )}
      />
    </span>
  )
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetApps,
  installedAppsCount,
  currentTheme,
  onOpenSystemSettings,
  onOpenDisplaySettings,
  onOpenAmlogicPictureSettings,
  onOpenSoundSettings,
  onOpenWifiSettings,
  onOpenAccountSettings,
  onSelectProfile,
  onOpenThemes,
  activeProfileName,
  activeProfileColor,
  native,
  resolvedQuality = 'high',
  detectedQuality = 'high',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabCategory>('display')
  const [focusSection, setFocusSection] = useState<'tabs' | 'content'>('tabs')
  const [tabIndex, setTabIndex] = useState(0)
  const [contentIndex, setContentIndex] = useState(0)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [updateChecked, setUpdateChecked] = useState(false)
  const [network, setNetwork] = useState<NetworkInfo | null>(null)
  const [display, setDisplay] = useState<DisplayInfo | null>(null)
  const [soundVolume, setSoundVolume] = useState(25)
  const [audioError, setAudioError] = useState('')
  const lastSoundVolume = useRef(25)

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const contentPanelRef = useRef<HTMLDivElement>(null)

  const contentItems = () => {
    const panel = contentPanelRef.current
    if (!panel) return []
    return Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  }

  useEffect(() => {
    if (isOpen) {
      setFocusSection('tabs')
      setTabIndex(0)
      setContentIndex(0)
      setActiveTab(TABS[0].id)
      setCacheCleared(false)
      setUpdateChecked(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || activeTab !== 'network') return
    const refresh = () => setNetwork(native ? getNetwork() : null)
    refresh()
    window.addEventListener('launcher:resume', refresh)
    return () => window.removeEventListener('launcher:resume', refresh)
  }, [isOpen, activeTab, native])

  useEffect(() => {
    if (!isOpen || activeTab !== 'audio') return
    const volume = getNavigationSoundVolume()
    setSoundVolume(volume)
    lastSoundVolume.current = volume > 0 ? volume : getLastNavigationSoundVolume()
    setAudioError('')
  }, [isOpen, activeTab])

  const updateSoundVolume = (value: number) => {
    const next = Math.min(100, Math.max(0, value))
    try {
      setNavigationSoundVolume(next)
      setSoundVolume(next)
      if (next > 0) lastSoundVolume.current = next
      setAudioError('')
    } catch (error) {
      console.warn('Unable to save navigation sound volume', error)
      setAudioError('Could not save launcher sound volume.')
    }
  }

  const handleClearTemporaryCache = () => {
    try {
      sessionStorage.clear()
      const preservedPrefixes = [
        'tv_launcher_',
        'tv_custom_themes',
        'launcher_',
        'launcher.',
      ]
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && !preservedPrefixes.some((prefix) => key.startsWith(prefix))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
    } catch {}
    setCacheCleared(true)
  }

  useEffect(() => {
    if (!isOpen || activeTab !== 'display') return
    const refresh = () => setDisplay(native ? getDisplayInfo() : null)
    refresh()
    window.addEventListener('launcher:resume', refresh)
    return () => window.removeEventListener('launcher:resume', refresh)
  }, [isOpen, activeTab, native])

  useEffect(() => {
    if (!isOpen) return
    const items = contentItems()
    const target = focusSection === 'tabs' ? tabRefs.current[tabIndex] : items[contentIndex]
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [isOpen, focusSection, tabIndex, contentIndex, activeTab])

  // Remote Navigation Listener (D-Pad support)
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

      if (isBack) {
        e.preventDefault()
        if (focusSection === 'content') setFocusSection('tabs')
        else onClose()
        return
      }

      // The quality row is one stop: Left/Right switches the tier in place, Up/Down leaves the row.
      const onQualityRow =
        document.activeElement instanceof HTMLElement && document.activeElement.dataset.qualityRow
      if (
        onQualityRow &&
        (key === 'ArrowLeft' || key === 'ArrowRight' || code === 21 || code === 22 || code === 37 || code === 39)
      ) {
        e.preventDefault()
        stepQuality(code === 22 || code === 39 || key === 'ArrowRight' ? 1 : -1)
        return
      }

      const soundControl =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.launcherSound === 'true'
      if (
        soundControl &&
        (key === 'ArrowLeft' || key === 'ArrowRight' || code === 21 || code === 22 || code === 37 || code === 39)
      ) {
        e.preventDefault()
        updateSoundVolume(soundVolume + (key === 'ArrowLeft' || code === 21 || code === 37 ? -10 : 10))
        return
      }

      if (['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) || code === 13 || code === 23 || code === 66) {
        e.preventDefault()
        if (!e.repeat && document.activeElement instanceof HTMLButtonElement) document.activeElement.click()
        return
      }

      if (key === 'ArrowUp' || code === 38 || code === 19) {
        e.preventDefault()
        if (focusSection === 'tabs') {
          const next = Math.max(0, tabIndex - 1)
          setTabIndex(next)
          setActiveTab(TABS[next].id)
          setContentIndex(0)
          if (contentPanelRef.current) contentPanelRef.current.scrollTop = 0
        } else {
          if (soundControl && contentIndex === 0) {
            setFocusSection('tabs')
            return
          }
          if (contentIndex === 0 && contentPanelRef.current && contentPanelRef.current.scrollTop > 0) {
            contentPanelRef.current.scrollTop -= contentPanelRef.current.clientHeight * 0.6
          } else setContentIndex(Math.max(0, contentIndex - 1))
        }
        return
      }

      if (key === 'ArrowDown' || code === 40 || code === 20) {
        e.preventDefault()
        if (focusSection === 'tabs') {
          const next = Math.min(TABS.length - 1, tabIndex + 1)
          setTabIndex(next)
          setActiveTab(TABS[next].id)
          setContentIndex(0)
          if (contentPanelRef.current) contentPanelRef.current.scrollTop = 0
        } else {
          const items = contentItems()
          const next = Math.min(Math.max(0, items.length - 1), contentIndex + 1)
          const panel = contentPanelRef.current
          if (
            contentIndex === items.length - 1 &&
            panel &&
            panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1
          ) {
            panel.scrollTop += panel.clientHeight * 0.6
          } else setContentIndex(next)
        }
        return
      }

      if (key === 'ArrowRight' || code === 39 || code === 22) {
        e.preventDefault()
        if (focusSection === 'tabs') {
          if (contentItems().length) {
            setFocusSection('content')
            setContentIndex(0)
          }
        }
        return
      }

      if (key === 'ArrowLeft' || code === 37 || code === 21) {
        e.preventDefault()
        if (focusSection === 'content') {
          setFocusSection('tabs')
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, focusSection, tabIndex, contentIndex, onClose, soundVolume, settings.graphicsQuality])

  if (!isOpen) return null

  const setGraphicsQuality = (graphicsQuality: GraphicsQuality) => {
    const updated = { ...settings, graphicsQuality }
    onUpdateSettings(updated)
    saveStoredSettings(updated)
  }

  // The quality row is one focus stop, so Left/Right steps the tier instead of moving focus.
  const stepQuality = (delta: number) => {
    const ids = GRAPHICS_QUALITY_OPTIONS.map((option) => option.id)
    const current = Math.max(0, ids.indexOf(settings.graphicsQuality))
    const next = Math.min(Math.max(0, current + delta), ids.length - 1)
    if (ids[next] !== settings.graphicsQuality) setGraphicsQuality(ids[next])
  }

  const toggleSetting = (key: keyof LauncherSettings) => {
    const updated = { ...settings, [key]: !settings[key] }
    onUpdateSettings(updated)
    saveStoredSettings(updated)
  }

  const tokens = resolveThemeTokens(currentTheme)

  const rowButtonClass =
    'group flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--tv-glass-border)] bg-[var(--tv-glass)] p-4 text-left outline-none transition-all duration-150 hover:bg-white/[0.08] focus:border-[var(--tv-accent)] focus:bg-[var(--tv-surface-elevated)] focus:shadow-[0_0_24px_var(--tv-glow)]'

  const actionButtonClass =
    'inline-flex items-center gap-2 rounded-full border border-[var(--tv-glass-border)] bg-[var(--tv-glass)] px-4 py-2 text-xs font-semibold text-white outline-none transition-all duration-150 hover:bg-white/20 focus:scale-[1.03] focus:border-[var(--tv-accent)] focus:bg-[var(--tv-accent)] focus:text-[var(--tv-accent-text)] focus:shadow-[0_0_20px_var(--tv-glow)]'

  const infoCardClass =
    'rounded-2xl border border-[var(--tv-glass-border)] bg-[var(--tv-glass)]'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="tv-menu-focus fixed inset-0 z-50 flex items-center justify-center p-[3.5vw] text-white select-none animate-in fade-in duration-200"
      style={{
        ...themeTokensToCssVars(tokens),
        background: `
          radial-gradient(ellipse 90% 60% at 50% 10%, ${tokens.glow1}, transparent 75%),
          radial-gradient(ellipse 70% 50% at 20% 90%, ${tokens.glow2}, transparent 75%),
          ${colorWithAlpha(tokens.bg, 0.90)}
        `,
      }}
    >
      <div
        className="relative flex h-[82vh] w-full max-w-5xl overflow-hidden rounded-[28px] border"
        style={{
          backgroundColor: tokens.surface,
          borderColor: tokens.glassBorder,
          boxShadow: `0 28px 90px rgba(0,0,0,0.92), 0 0 48px ${tokens.glow1}`,
        }}
      >
        {/* Left Side: System Categories Navigation */}
        <aside
          className="flex min-h-0 w-[34%] flex-col border-r p-[max(20px,2vw)]"
          style={{
            borderColor: tokens.glassBorder,
            backgroundColor: colorWithAlpha(tokens.bg, 0.55),
          }}
        >
          <div className="flex items-center gap-3 pb-5 border-b" style={{ borderColor: tokens.glassBorder }}>
            <div
              className="grid size-11 shrink-0 place-items-center rounded-2xl shadow-lg"
              style={{
                backgroundColor: tokens.accent,
                color: tokens.accentText,
                boxShadow: `0 4px 18px ${tokens.glow1}`,
              }}
            >
              <Sliders className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 id="settings-title" className="truncate text-[clamp(17px,1.25vw,23px)] font-bold tracking-tight text-white">
                Launcher Settings
              </h2>
              <p className="truncate text-[clamp(11px,0.75vw,14px)] text-white/55">
                System & device preferences
              </p>
            </div>
          </div>

          <nav aria-label="Settings Categories" className="no-scrollbar -mx-4 min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-6 flex flex-col gap-1.5">
            {TABS.map((tab, idx) => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              const isFocused = focusSection === 'tabs' && tabIndex === idx

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[idx] = el
                  }}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    setTabIndex(idx)
                    setFocusSection('tabs')
                    setContentIndex(0)
                    if (contentPanelRef.current) contentPanelRef.current.scrollTop = 0
                  }}
                  className={cn(
                    'flex shrink-0 items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-[clamp(13px,0.9vw,17px)] font-semibold transition-all duration-150 outline-none',
                    isFocused
                      ? 'scale-[1.015] border-[var(--tv-accent)] text-white'
                      : isSelected
                        ? 'border-[var(--tv-glass-border)] bg-[var(--tv-glass)] text-white'
                        : 'border-transparent text-white/70 hover:bg-white/8 hover:text-white',
                  )}
                  style={
                    isFocused
                      ? { backgroundColor: tokens.surfaceElevated, boxShadow: `0 0 22px ${tokens.glow1}` }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className="size-4 shrink-0 transition-colors"
                      style={isSelected || isFocused ? { color: tokens.accent } : undefined}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-white">{tab.label}</span>
                      <span
                        className={cn(
                          'block truncate text-[11px] font-normal',
                          isFocused ? 'text-white/80' : 'text-white/45',
                        )}
                      >
                        {tab.summary}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 ml-1.5 opacity-55 transition-colors"
                    style={isSelected ? { color: tokens.accent } : undefined}
                  />
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Right Side: Options Panel */}
        <section
          aria-label="Settings options"
          onFocusCapture={(event) => {
            const index = contentItems().indexOf(event.target as HTMLButtonElement)
            if (index >= 0) {
              setFocusSection('content')
              setContentIndex(index)
            }
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col p-[max(20px,2vw)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b pb-4" style={{ borderColor: tokens.glassBorder }}>
            <div className="min-w-0">
              <h3 className="text-[clamp(18px,1.4vw,26px)] font-bold tracking-tight text-white">
                {TABS.find((t) => t.id === activeTab)?.label}
              </h3>
              <p className="text-[clamp(11px,0.8vw,15px)] text-white/60">
                {TABS.find((t) => t.id === activeTab)?.summary}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--tv-glass-border)] bg-[var(--tv-glass)] text-white/80 outline-none transition-all hover:bg-white/20 hover:text-white focus:border-[var(--tv-accent)] focus:shadow-[0_0_16px_var(--tv-glow)]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            ref={contentPanelRef}
            className="no-scrollbar -mx-4 min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6"
          >
            {/* Category 1: Display & Video */}
            {activeTab === 'display' && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  data-quality-row="true"
                  aria-label={`UI Graphics Quality: ${qualityLabel(resolvedQuality)}`}
                  onClick={() => stepQuality(1)}
                  className={rowButtonClass}
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-white">UI Graphics Quality</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      {settings.graphicsQuality === 'auto'
                        ? `Auto picks ${qualityLabel(resolvedQuality)} for this device`
                        : `Manual override · Auto picks ${qualityLabel(detectedQuality)}`}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/45">{QUALITY_HINTS[resolvedQuality]}</span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                    {GRAPHICS_QUALITY_OPTIONS.map((option) => {
                      const selected = settings.graphicsQuality === option.id
                      return (
                        <span
                          key={option.id}
                          className={cn(
                            'rounded-full border px-3.5 py-1.5 text-xs font-semibold',
                            selected
                              ? 'border-transparent'
                              : 'border-[var(--tv-glass-border)] bg-black/35 text-white/75',
                          )}
                          style={
                            selected
                              ? {
                                  backgroundColor: tokens.accent,
                                  color: tokens.accentText,
                                  boxShadow: `0 0 16px ${tokens.glow1}`,
                                }
                              : undefined
                          }
                        >
                          {option.label}
                        </span>
                      )
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.kenBurns}
                  onClick={() => toggleSetting('kenBurns')}
                  className={rowButtonClass}
                >
                  <div>
                    <span className="block text-sm font-semibold text-white">Ken Burns Cinematic Pan</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      Subtly zooms hero slide backdrops for atmospheric theater motion.
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={settings.kenBurns}
                    accent={tokens.accent}
                    glow={tokens.glow1}
                  />
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.liveWallpaper}
                  onClick={() => toggleSetting('liveWallpaper')}
                  className={rowButtonClass}
                >
                  <div>
                    <span className="block text-sm font-semibold text-white">Secondary Live Wallpaper</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      Plays animated ambient backdrop video when browsing shelves.
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={settings.liveWallpaper}
                    accent={tokens.accent}
                    glow={tokens.glow1}
                  />
                </button>

                <div className={cn(infoCardClass, 'flex items-center justify-between gap-4 p-4')}>
                  <div>
                    <span className="block text-sm font-semibold text-white">Current Display Mode</span>
                    <span className="mt-0.5 block text-xs text-white/55">
                      Physical output mode reported by Android.
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-full border border-[var(--tv-glass-border)] bg-black/35 px-3.5 py-1 text-xs font-semibold tabular-nums"
                    style={{ color: tokens.accent }}
                  >
                    {display?.available && display.width && display.height && display.refreshRate
                      ? `${display.width} × ${display.height} · ${Number(display.refreshRate.toFixed(2))} Hz`
                      : 'Unavailable'}
                  </span>
                </div>

                <div className={cn(infoCardClass, 'flex items-center justify-between gap-4 p-4')}>
                  <div>
                    <span className="block text-sm font-semibold text-white">Supported HDR Formats</span>
                    <span className="mt-0.5 block text-xs text-white/55">
                      Reported panel capabilities, independent of active video playback.
                    </span>
                  </div>
                  <span className="max-w-[50%] text-right text-xs font-medium text-white/80">
                    {!display?.available
                      ? 'Unavailable'
                      : display.hdrTypes?.length
                        ? display.hdrTypes.join(' · ')
                        : 'None reported'}
                  </span>
                </div>

                {(onOpenDisplaySettings || onOpenAmlogicPictureSettings) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {onOpenDisplaySettings && (
                      <button type="button" onClick={onOpenDisplaySettings} className={actionButtonClass}>
                        <Monitor className="size-3.5" />
                        <span>Open Android Display Settings</span>
                      </button>
                    )}
                    {onOpenAmlogicPictureSettings && (
                      <button type="button" onClick={onOpenAmlogicPictureSettings} className={actionButtonClass}>
                        <Sparkles className="size-3.5" />
                        <span>Amlogic AI Picture (AI-SR)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Category 2: Launcher Preferences */}
            {activeTab === 'launcher' && (
              <div className="flex flex-col gap-3">
                {onOpenThemes && (
                  <button
                    type="button"
                    onClick={onOpenThemes}
                    className={rowButtonClass}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl"
                        style={{
                          background: `linear-gradient(135deg, ${tokens.accent}, ${tokens.accent2})`,
                          color: tokens.accentText,
                          boxShadow: `0 0 14px ${tokens.glow1}`,
                        }}
                      >
                        <Palette className="size-4.5" />
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          UI Theme & Theme Studio
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-white/60">
                          Active: {currentTheme.name} · Browse palettes or create custom themes
                        </span>
                      </div>
                    </div>
                    <span
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--tv-glass-border)] bg-black/35 px-3.5 py-1.5 text-xs font-semibold"
                      style={{ color: tokens.accent }}
                    >
                      <span>Customize</span>
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoAdvanceHero}
                  onClick={() => toggleSetting('autoAdvanceHero')}
                  className={rowButtonClass}
                >
                  <div>
                    <span className="block text-sm font-semibold text-white">Auto-Advance Featured Carousel</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      Automatically rotates featured hero titles every 9 seconds when idle.
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={settings.autoAdvanceHero}
                    accent={tokens.accent}
                    glow={tokens.glow1}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => toggleSetting('clock24h')}
                  className={rowButtonClass}
                >
                  <div>
                    <span className="block text-sm font-semibold text-white">Status Clock Format</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      Switch between standard 12-hour and 24-hour time display.
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-full border border-[var(--tv-glass-border)] bg-black/35 px-3.5 py-1.5 text-xs font-semibold tabular-nums"
                    style={{ color: tokens.accent }}
                  >
                    {settings.clock24h ? '24-Hour (14:30)' : '12-Hour (2:30 PM)'}
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showWeather}
                  onClick={() => toggleSetting('showWeather')}
                  className={rowButtonClass}
                >
                  <div>
                    <span className="block text-sm font-semibold text-white">Header Live Weather</span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      Display local temperature badge alongside the status clock.
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={settings.showWeather}
                    accent={tokens.accent}
                    glow={tokens.glow1}
                  />
                </button>
              </div>
            )}

            {/* Category 3: Audio & Sound */}
            {activeTab === 'audio' && (
              <div className="flex flex-col gap-3.5">
                <button
                  type="button"
                  data-launcher-sound="true"
                  role="slider"
                  aria-label="Launcher sounds"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={soundVolume}
                  aria-valuetext={soundVolume === 0 ? 'Off' : `${soundVolume}%`}
                  onClick={() => updateSoundVolume(soundVolume === 0 ? lastSoundVolume.current : 0)}
                  className={cn(rowButtonClass, 'flex-col items-stretch p-5')}
                >
                  <span className="flex items-center justify-between gap-5">
                    <span className="text-sm font-semibold text-white">Launcher Navigation Sounds</span>
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: tokens.accent }}
                    >
                      {soundVolume === 0 ? 'Muted' : `${soundVolume}%`}
                    </span>
                  </span>
                  <span className="mt-3.5 block h-2 overflow-hidden rounded-full bg-white/15">
                    <span
                      className="relative block h-full overflow-hidden rounded-full transition-[width] duration-150"
                      style={{ width: `${soundVolume}%` }}
                    >
                      <FlowFill />
                    </span>
                  </span>
                </button>

                {audioError && (
                  <p role="alert" className="text-sm text-rose-300">
                    {audioError}
                  </p>
                )}

                {onOpenSoundSettings && (
                  <button
                    type="button"
                    onClick={onOpenSoundSettings}
                    className={rowButtonClass}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-white">Open Android Audio Settings</span>
                      <span className="mt-0.5 block text-xs text-white/55">
                        Volume, sound output, and surround audio formats
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-white/55" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {/* Category 4: Apps & Storage */}
            {activeTab === 'apps' && (
              <div className="flex flex-col gap-3.5">
                <div className={cn(infoCardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white">Active Streaming Apps</span>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: tokens.accent }}
                    >
                      {installedAppsCount} Apps Installed
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mb-3.5">
                    Customize pinned applications and home row ordering.
                  </p>
                  <button type="button" onClick={onResetApps} className={actionButtonClass}>
                    <RotateCcw className="size-3.5" />
                    <span>Reset App Row to Default</span>
                  </button>
                </div>

                <div className={cn(infoCardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white">Internal 16GB eMMC Storage</span>
                    <span className="text-xs tabular-nums text-white/80">11.8 GB Free of 16.0 GB</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden mb-3.5">
                    <div
                      className="relative h-full overflow-hidden rounded-full transition-all"
                      style={{ width: '26%', boxShadow: `0 0 10px ${tokens.accent}` }}
                    >
                      <FlowFill />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-white/55">
                      {cacheCleared ? 'Temporary session cache cleared' : 'Temporary launcher cache: 2.4 MB'}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearTemporaryCache}
                      className={actionButtonClass}
                    >
                      <span>{cacheCleared ? 'Cache Cleared ✓' : 'Clear Temporary Cache'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Category 5: Network & Account */}
            {activeTab === 'network' && (
              <div className="flex flex-col gap-3.5">
                <div className={cn(infoCardClass, 'p-4')}>
                  <div className="flex items-center gap-3 mb-3.5">
                    <div
                      className="grid size-10 place-items-center rounded-full text-sm font-bold"
                      style={{
                        backgroundColor: activeProfileColor || tokens.accent,
                        color: activeProfileColor ? getContrastText(activeProfileColor) : tokens.accentText,
                        boxShadow: `0 0 0 1.5px ${tokens.accent}, 0 0 14px ${tokens.glow1}`,
                      }}
                    >
                      {activeProfileName ? activeProfileName.slice(0, 1).toUpperCase() : <User className="size-5" />}
                    </div>
                    <div>
                      <span className="block text-sm font-semibold text-white">Launcher Profile</span>
                      <span className="block text-xs text-white/55">{activeProfileName ?? 'No profile selected'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button type="button" onClick={onSelectProfile} className={actionButtonClass}>
                      <User className="size-3.5" />
                      <span>Switch Launcher Profile</span>
                    </button>
                    {onOpenAccountSettings && (
                      <button type="button" onClick={onOpenAccountSettings} className={actionButtonClass}>
                        <span>Google TV Accounts</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className={cn(infoCardClass, 'p-4')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <Wifi className="size-4" style={{ color: tokens.accent }} />
                      <span className="text-sm font-semibold text-white">
                        {network?.label ?? (native ? 'Checking connection' : 'Browser preview session')}
                      </span>
                    </div>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: tokens.accent }}
                    >
                      {network
                        ? network.connected
                          ? network.internet
                            ? 'Internet connected'
                            : 'Connected · no internet'
                          : 'Offline'
                        : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                    <div>
                      IP address:{' '}
                      <span className="font-medium tabular-nums text-white">
                        {network?.ipAddress ?? 'Unavailable'}
                      </span>
                    </div>
                    <div>
                      VPN: <span className="font-medium text-white">{network?.vpn ? 'Active' : 'Not detected'}</span>
                    </div>
                  </div>
                </div>

                {onOpenWifiSettings && (
                  <div className="pt-0.5">
                    <button type="button" onClick={onOpenWifiSettings} className={actionButtonClass}>
                      <Wifi className="size-3.5" />
                      <span>Open Wi-Fi Settings</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Category 6: System & About */}
            {activeTab === 'system' && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Device Model
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">onn. 4K Plus Streaming Device</span>
                    <span className="text-white/60">Walmart Item #15557424949</span>
                  </div>
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      SoC / Processor
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">Amlogic S905X5M</span>
                    <span className="text-white/60">Quad-core Cortex-A55 @ 2.5 GHz</span>
                  </div>
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Graphics / GPU
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">ARM Mali-G310 V2</span>
                    <span className="text-white/60">Hardware AV1 / HEVC Decoding</span>
                  </div>
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Memory & Storage
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">2GB DDR4 · 16GB eMMC</span>
                    <span className="text-white/60">Widevine L1 DRM Certified</span>
                  </div>
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Operating System
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">Google TV (Android 14)</span>
                    <span className="text-white/60">Kernel 6.1.x</span>
                  </div>
                  <div className={cn(infoCardClass, 'p-3.5')}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Launcher Build
                    </span>
                    <span className="mt-1 block text-sm font-bold text-white">v2.6.0 (Cinematic Edition)</span>
                    <span className="text-white/60">Smoked-Glass 4K Shell</span>
                  </div>
                </div>

                <div className={cn(infoCardClass, 'flex flex-wrap items-center justify-between gap-3 p-3.5 mt-0.5')}>
                  <span className="text-xs text-white/70">System Software Status</span>
                  <div className="flex items-center gap-2.5">
                    {onOpenSystemSettings && (
                      <button type="button" onClick={onOpenSystemSettings} className={actionButtonClass}>
                        <Sliders className="size-3.5" />
                        <span>Android Settings</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setUpdateChecked(true)}
                      className={actionButtonClass}
                    >
                      <RefreshCw
                        className="size-3.5"
                        style={updateChecked ? { color: tokens.accent } : undefined}
                      />
                      <span>{updateChecked ? 'Up to date' : 'Check for Updates'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
