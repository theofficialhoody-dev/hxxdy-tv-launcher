'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Dices, Palette, Pencil, Pipette, Sparkles, X } from 'lucide-react'
import {
  applyThemeCssVariables,
  colorWithAlpha,
  getContrastText,
  resolveThemeTokens,
  STUDIO_COLOR_SWATCHES,
  themeTokensToCssVars,
  type StudioColorSwatch,
  type ThemeConfig,
  type ThemeGlowIntensity,
} from '@/lib/theme-data'
import { cn } from '@/lib/utils'
import { FlowFill } from './flow-fill'
import { TvKeyboard } from './tv-keyboard'

type ThemeCreatorProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (theme: ThemeConfig) => void
  existingThemeCount: number
  currentTheme?: ThemeConfig
  editingTheme?: ThemeConfig | null
}

function hslToHex(h: number, s: number, l: number): string {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '')
  const r = (parseInt(clean.substring(0, 2), 16) || 0) / 255
  const g = (parseInt(clean.substring(2, 4), 16) || 0) / 255
  const b = (parseInt(clean.substring(4, 6), 16) || 0) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h = Math.round(h * 60)
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

type ColorLayer = 'accent' | 'bg' | 'secondary'

const INTENSITY_OPTIONS: { id: ThemeGlowIntensity; label: string; desc: string }[] = [
  { id: 'subtle', label: 'Subtle · 20%', desc: 'Calm ambient focus' },
  { id: 'vibrant', label: 'Cinematic · 50%', desc: 'Balanced theater radiance' },
  { id: 'dramatic', label: 'High Voltage · 85%', desc: 'Vivid synthwave aura' },
]

const BG_LEVELS = [
  { level: 0, label: 'Pure OLED', desc: '0% pitch black' },
  { level: 3, label: 'Abyss', desc: '3% deep shadow' },
  { level: 7, label: 'Midnight', desc: '7% rich dark tint' },
  { level: 12, label: 'Cosmic', desc: '12% atmospheric void' },
  { level: 16, label: 'Smoked', desc: '16% charcoal tone' },
]

const TONE_OPTIONS = [
  { id: 'neon', label: 'Electric Neon', desc: '100% saturation' },
  { id: 'ice', label: 'Ice Brilliance', desc: 'Bright radiant' },
  { id: 'velvet', label: 'Deep Velvet', desc: 'Rich jewel tone' },
  { id: 'pastel', label: 'Soft Pastel', desc: 'Calm aesthetic' },
  { id: 'white', label: 'Pure White', desc: 'Monochrome silver' },
] as const

const TONE_SL: Record<'neon' | 'ice' | 'velvet' | 'pastel', { s: number; l: number }> = {
  neon: { s: 100, l: 50 },
  ice: { s: 95, l: 70 },
  velvet: { s: 85, l: 38 },
  pastel: { s: 70, l: 60 },
}

const SUGGESTED_NAMES = [
  'Neon Odyssey',
  'Cyber Horizon',
  'Midnight Velvet',
  'Solaris Horizon',
  'Starlight Cinema',
  'Deep Abyss',
  'Vapor Twilight',
  'Emerald Matrix',
  'Cyber Noir',
  'Obsidian Pulse',
  'Golden Hour',
  'Titanium Studio',
  'Arcade Dream',
  'Crimson Dusk',
  'Quantum Violet',
  'Polar Mirage',
]

function buildStudioTheme(
  accent: string,
  bg: string,
  secondaryGlow: string,
  intensity: ThemeGlowIntensity,
  name: string,
  id: string,
  isCustom?: boolean,
): ThemeConfig {
  const alpha = intensity === 'subtle' ? 0.18 : intensity === 'vibrant' ? 0.28 : 0.42
  const borderAlpha = intensity === 'subtle' ? 0.2 : intensity === 'vibrant' ? 0.28 : 0.38
  return {
    id,
    name,
    description: 'Custom Studio Creation',
    bg,
    accent,
    secondaryAccent: secondaryGlow,
    accentText: getContrastText(accent),
    glow1: colorWithAlpha(accent, alpha),
    glow2: colorWithAlpha(secondaryGlow, alpha * 0.8),
    glassBg: colorWithAlpha(accent, intensity === 'dramatic' ? 0.13 : 0.1),
    glassBorder: colorWithAlpha(accent, borderAlpha),
    intensity,
    isCustom,
  }
}

function detectToneFromHex(hex: string): 'neon' | 'ice' | 'velvet' | 'pastel' | 'white' {
  const clean = hex.trim().toLowerCase()
  if (clean === '#ffffff' || clean === '#fff') return 'white'
  const { s, l } = hexToHsl(clean)
  if (s < 15 && l > 80) return 'white'
  if (l >= 64) return 'ice'
  if (l <= 42) return 'velvet'
  if (s <= 78) return 'pastel'
  return 'neon'
}

export function ThemeCreator({
  isOpen,
  onClose,
  onSave,
  existingThemeCount,
  currentTheme,
  editingTheme = null,
}: ThemeCreatorProps) {
  const seedTheme = editingTheme || currentTheme
  const initialTokens = resolveThemeTokens(seedTheme)
  const [activeLayer, setActiveLayer] = useState<ColorLayer>('accent')
  const [accent, setAccent] = useState(initialTokens.accent)
  const [bg, setBg] = useState(initialTokens.bg)
  const [secondaryGlow, setSecondaryGlow] = useState(initialTokens.accent2)

  const [currentHue, setCurrentHue] = useState(() => hexToHsl(initialTokens.accent).h)
  const [accentTone, setAccentTone] = useState<'neon' | 'ice' | 'velvet' | 'pastel' | 'white'>(() =>
    detectToneFromHex(initialTokens.accent),
  )
  const [bgDarkness, setBgDarkness] = useState<number>(() => hexToHsl(initialTokens.bg).l)
  const [secondaryTone, setSecondaryTone] = useState<'neon' | 'ice' | 'velvet' | 'pastel' | 'white'>(() =>
    detectToneFromHex(initialTokens.accent2),
  )

  const [intensity, setIntensity] = useState<ThemeGlowIntensity>(seedTheme?.intensity || 'vibrant')
  const [nameIndex, setNameIndex] = useState(existingThemeCount % SUGGESTED_NAMES.length)
  const [customName, setCustomName] = useState('')
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [focusedControlId, setFocusedControlId] = useState<string>('layer-accent')

  const rootRef = useRef<HTMLDivElement>(null)
  const firstLayerRef = useRef<HTMLButtonElement>(null)
  const typeNameRef = useRef<HTMLButtonElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const pointerReadyRef = useRef(true)

  useEffect(() => {
    if (!isOpen) return
    const onPointerMove = (event: MouseEvent) => {
      if (event.movementX || event.movementY) pointerReadyRef.current = true
    }
    window.addEventListener('mousemove', onPointerMove)
    return () => window.removeEventListener('mousemove', onPointerMove)
  }, [isOpen])

  useEffect(() => {
    const source = editingTheme || currentTheme
    if (isOpen && source) {
      const tokens = resolveThemeTokens(source)
      setAccent(tokens.accent)
      setBg(tokens.bg)
      setSecondaryGlow(tokens.accent2)
      setIntensity(source.intensity)
      setCurrentHue(hexToHsl(tokens.accent).h)
      setAccentTone(detectToneFromHex(tokens.accent))
      setSecondaryTone(detectToneFromHex(tokens.accent2))
      const bgL = hexToHsl(tokens.bg).l
      const nearestBg = BG_LEVELS.reduce((best, lvl) =>
        Math.abs(lvl.level - bgL) < Math.abs(best.level - bgL) ? lvl : best,
      )
      setBgDarkness(bgL <= 1 ? 0 : nearestBg.level)
      setActiveLayer('accent')
      setCustomName(editingTheme ? editingTheme.name : '')
      setIsKeyboardOpen(false)
      setFocusedControlId('layer-accent')
      requestAnimationFrame(() => {
        firstLayerRef.current?.focus({ preventScroll: true })
      })
    }
  }, [isOpen, currentTheme, editingTheme])

  const applyTone = useCallback(
    (tone: 'neon' | 'ice' | 'velvet' | 'pastel' | 'white') => {
      if (activeLayer === 'accent') setAccentTone(tone)
      else setSecondaryTone(tone)
      const color =
        tone === 'white'
          ? '#ffffff'
          : hslToHex(currentHue, TONE_SL[tone].s, TONE_SL[tone].l)
      if (activeLayer === 'accent') setAccent(color)
      else setSecondaryGlow(color)
    },
    [activeLayer, currentHue],
  )

  useEffect(() => {
    const targetHex = activeLayer === 'accent' ? accent : activeLayer === 'bg' ? bg : secondaryGlow
    setCurrentHue(hexToHsl(targetHex).h)
  }, [activeLayer, accent, bg, secondaryGlow])

  const applyHueChange = useCallback(
    (newHue: number) => {
      setCurrentHue(newHue)
      if (activeLayer === 'accent') {
        if (newHue === -1) {
          setAccentTone('white')
          setAccent('#ffffff')
        } else {
          const nextTone = accentTone === 'white' ? 'neon' : accentTone
          if (accentTone === 'white') setAccentTone('neon')
          setAccent(hslToHex(newHue, TONE_SL[nextTone].s, TONE_SL[nextTone].l))
        }
      } else if (activeLayer === 'bg') {
        const nextLevel = bgDarkness === 0 ? 7 : bgDarkness
        if (bgDarkness === 0) setBgDarkness(7)
        setBg(hslToHex(newHue, 75, nextLevel))
      } else {
        const nextTone = secondaryTone === 'white' ? 'neon' : secondaryTone
        if (secondaryTone === 'white') setSecondaryTone('neon')
        setSecondaryGlow(hslToHex(newHue, TONE_SL[nextTone].s, TONE_SL[nextTone].l))
      }
    },
    [activeLayer, accentTone, bgDarkness, secondaryTone],
  )

  const applyBgDarkness = useCallback(
    (darkness: number) => {
      setBgDarkness(darkness)
      if (darkness === 0) setBg('#000000')
      else setBg(hslToHex(currentHue, 75, darkness))
    },
    [currentHue],
  )

  const applySwatch = useCallback(
    (sw: StudioColorSwatch) => {
      if (activeLayer === 'accent') {
        setAccent(sw.hex)
        setAccentTone(detectToneFromHex(sw.hex))
      } else if (activeLayer === 'bg') {
        if (sw.hex === '#000000') {
          setBg('#000000')
          setBgDarkness(0)
        } else if (sw.hue < 0) {
          const targetLevel = bgDarkness > 0 ? bgDarkness : 7
          setBgDarkness(targetLevel)
          setBg(hslToHex(215, 18, targetLevel))
        } else {
          const targetLevel = bgDarkness > 0 ? bgDarkness : 7
          setBgDarkness(targetLevel)
          setBg(hslToHex(sw.hue, 75, targetLevel))
        }
      } else {
        setSecondaryGlow(sw.hex)
        setSecondaryTone(detectToneFromHex(sw.hex))
      }
      if (sw.hue >= 0) setCurrentHue(sw.hue)
    },
    [activeLayer, bgDarkness],
  )

  const handleAutoHarmonize = useCallback(() => {
    const hsl = hexToHsl(accent)
    const compHue = (hsl.h + 180) % 360
    setSecondaryGlow(hslToHex(compHue, 100, 54))
    setSecondaryTone('neon')
    setBg(hslToHex((hsl.h + 20) % 360, 60, 4))
    setBgDarkness(3)
  }, [accent])

  const displayName = customName.trim() || SUGGESTED_NAMES[nameIndex]

  const liveTheme = useMemo(
    () =>
      buildStudioTheme(
        accent,
        bg,
        secondaryGlow,
        intensity,
        displayName,
        editingTheme?.id ?? 'studio-preview',
      ),
    [accent, bg, secondaryGlow, intensity, displayName, editingTheme?.id],
  )

  const liveTokens = useMemo(() => resolveThemeTokens(liveTheme), [liveTheme])

  const handleSave = useCallback(() => {
    const newTheme = buildStudioTheme(
      accent,
      bg,
      secondaryGlow,
      intensity,
      displayName,
      editingTheme?.id ?? `custom-${Date.now()}`,
      true,
    )
    onSave(newTheme)
  }, [accent, bg, displayName, editingTheme?.id, intensity, onSave, secondaryGlow])

  // Live TV background reflection across root and main
  useEffect(() => {
    if (!isOpen) return
    applyThemeCssVariables(liveTheme)
  }, [isOpen, liveTheme])

  // Spatial 2D D-Pad & keyboard navigation matching SettingsModal & AppsMenuModal
  useEffect(() => {
    if (!isOpen || isKeyboardOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, keyCode: code } = event
      const current = document.activeElement
      const isTextInputFocused =
        current instanceof HTMLInputElement && current.type === 'text'

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

      if (isTextInputFocused) {
        if (key === 'Enter' || key === 'Escape') {
          event.preventDefault()
          nameInputRef.current?.blur()
          typeNameRef.current?.focus({ preventScroll: true })
          return
        }
        if (
          key === 'ArrowUp' ||
          key === 'ArrowDown' ||
          code === 38 ||
          code === 19 ||
          code === 40 ||
          code === 20
        ) {
          // Fall through to spatial D-Pad movement
          nameInputRef.current?.blur()
        } else {
          return
        }
      }

      if (isBack) {
        event.preventDefault()
        onClose()
        return
      }

      // When Hue slider track is focused, Left/Right adjusts hue directly
      const isHueSlider =
        current instanceof HTMLElement && current.dataset.hueSlider === 'true'
      if (
        isHueSlider &&
        (key === 'ArrowLeft' || key === 'ArrowRight' || code === 37 || code === 39 || code === 21 || code === 22)
      ) {
        event.preventDefault()
        const delta = key === 'ArrowLeft' || code === 37 || code === 21 ? -15 : 15
        applyHueChange((currentHue + delta + 360) % 360)
        return
      }

      if (isSelect) {
        event.preventDefault()
        if (!event.repeat && current instanceof HTMLButtonElement) {
          current.click()
        }
        return
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
      if (!root) return
      const fromEl =
        current instanceof HTMLElement && root.contains(current)
          ? current
          : firstLayerRef.current
      if (!fromEl) return

      const bounds = (el: HTMLElement) => {
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top, width: r.width, height: r.height }
      }
      const from = bounds(fromEl)
      const fromX = from.x + from.width / 2
      const fromY = from.y + from.height / 2

      let best: HTMLElement | undefined
      let bestScore = Infinity
      for (const candidate of root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input[type="text"]:not(:disabled)',
      )) {
        if (candidate === fromEl || candidate.offsetParent === null) continue
        const to = bounds(candidate)
        const dx = to.x + to.width / 2 - fromX
        const dy = to.y + to.height / 2 - fromY
        const horizontal = direction === 'right' || direction === 'left'
        const primary =
          direction === 'right'
            ? dx
            : direction === 'left'
              ? -dx
              : direction === 'down'
                ? dy
                : -dy
        if (primary <= 2) continue
        const cross = horizontal ? Math.abs(dy) : Math.abs(dx)
        const aligned = horizontal
          ? to.y < from.y + from.height && to.y + to.height > from.y
          : to.x < from.x + from.width && to.x + to.width > from.x
        const score = primary + cross * 1.8 + (aligned ? 0 : 10000)
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
  }, [isOpen, isKeyboardOpen, currentHue, applyHueChange, onClose])

  if (!isOpen) return null

  const activeColorHex = activeLayer === 'accent' ? accent : activeLayer === 'bg' ? bg : secondaryGlow
  const activeSwatchMatch = STUDIO_COLOR_SWATCHES.find(
    (sw) => sw.hex.toLowerCase() === activeColorHex.toLowerCase(),
  )
  const activeLayerLabel =
    activeLayer === 'accent' ? 'Primary Accent' : activeLayer === 'bg' ? 'Canvas Base' : 'Secondary Aura'
  const activeIntensityLabel = INTENSITY_OPTIONS.find((opt) => opt.id === intensity)?.label ?? ''

  const cardSurfaceStyle = {
    backgroundColor: liveTokens.glass,
    boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tv-creator-title"
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement
        if (target.dataset.controlId) setFocusedControlId(target.dataset.controlId)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="tv-menu-focus fixed inset-0 z-50 flex items-center justify-center p-[2.5vw] text-white select-none animate-in fade-in duration-200"
      style={{
        ...themeTokensToCssVars(liveTokens),
        background: `
          radial-gradient(ellipse 88% 60% at 72% 12%, ${liveTokens.glow1}, transparent 70%),
          radial-gradient(ellipse 72% 52% at 18% 88%, ${liveTokens.glow2}, transparent 70%),
          ${colorWithAlpha(liveTokens.bg, 0.9)}
        `,
      }}
    >
      {/* Floating Apple TV / Google TV Smoked-Glass Studio Container */}
      <div
        className="relative flex h-[min(88vh,780px)] w-[min(92vw,1160px)] flex-col overflow-hidden rounded-[28px] border"
        style={{
          backgroundColor: liveTokens.surface,
          borderColor: liveTokens.glassBorder,
          boxShadow: `0 28px 90px rgba(0,0,0,0.92), 0 0 48px ${liveTokens.glow1}`,
        }}
      >
        {/* Single-Row Top Bar */}
        <header
          className="flex shrink-0 items-center justify-between gap-4 border-b px-[2.2vw] py-[1.8vh]"
          style={{ borderColor: liveTokens.glassBorder }}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span
              className="grid size-[clamp(38px,2.5vw,46px)] shrink-0 place-items-center rounded-2xl shadow-lg"
              style={{
                backgroundColor: liveTokens.accent,
                color: liveTokens.accentText,
                boxShadow: `0 4px 18px ${liveTokens.glow1}`,
              }}
            >
              <Palette className="size-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="tv-creator-title"
                className="truncate text-[clamp(18px,1.35vw,25px)] font-bold leading-tight tracking-tight text-white"
              >
                Theme Studio
              </h2>
              <p className="truncate text-[clamp(11px,0.78vw,14px)] text-white/58">
                Tailor accent, canvas, and ambient aura with live TV preview
              </p>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              data-control-id="auto-harmonize"
              onMouseEnter={() => {
                if (pointerReadyRef.current) setFocusedControlId('auto-harmonize')
              }}
              onClick={handleAutoHarmonize}
              className={cn(
                'flex h-[clamp(34px,2.35vw,40px)] items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-3.5 text-xs font-semibold outline-none transition-all duration-150',
                focusedControlId === 'auto-harmonize' ? 'scale-[1.03]' : 'text-white/90 hover:text-white',
              )}
              style={
                focusedControlId === 'auto-harmonize'
                  ? {
                      backgroundColor: liveTokens.accent,
                      color: liveTokens.accentText,
                      boxShadow: `0 0 20px ${liveTokens.glow1}`,
                    }
                  : cardSurfaceStyle
              }
            >
              <Sparkles className="size-3.5" />
              <span>Auto-Harmonize</span>
            </button>

            <button
              type="button"
              data-control-id="hex-picker"
              onMouseEnter={() => {
                if (pointerReadyRef.current) setFocusedControlId('hex-picker')
              }}
              onClick={() => colorInputRef.current?.click()}
              aria-label={`Custom hex picker for ${activeLayerLabel}, current color ${activeColorHex}`}
              className={cn(
                'relative flex h-[clamp(34px,2.35vw,40px)] items-center gap-2 whitespace-nowrap shrink-0 rounded-full px-3.5 text-xs font-semibold tabular-nums text-white outline-none transition-all duration-150',
                focusedControlId === 'hex-picker' && 'scale-[1.03]',
              )}
              style={{
                backgroundColor:
                  focusedControlId === 'hex-picker' ? liveTokens.surfaceElevated : liveTokens.glass,
                boxShadow:
                  focusedControlId === 'hex-picker'
                    ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 18px ${liveTokens.glow1}`
                    : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
              }}
            >
              <span
                className="size-3.5 rounded-full ring-1 ring-white/40"
                style={{ backgroundColor: activeColorHex }}
              />
              <span>{activeColorHex.toUpperCase()}</span>
              <Pipette className="size-3.5 text-white/65" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              tabIndex={-1}
              aria-hidden="true"
              value={activeColorHex}
              onChange={(e) => {
                const hex = e.target.value
                if (activeLayer === 'accent') {
                  setAccent(hex)
                  setAccentTone(detectToneFromHex(hex))
                } else if (activeLayer === 'bg') {
                  setBg(hex)
                  const l = hexToHsl(hex).l
                  if (l <= 1) setBgDarkness(0)
                  else {
                    const nearest = BG_LEVELS.reduce((best, lvl) =>
                      Math.abs(lvl.level - l) < Math.abs(best.level - l) ? lvl : best,
                    )
                    setBgDarkness(nearest.level || 3)
                  }
                } else {
                  setSecondaryGlow(hex)
                  setSecondaryTone(detectToneFromHex(hex))
                }
                setCurrentHue(hexToHsl(hex).h)
              }}
              className="sr-only"
            />

            <button
              type="button"
              data-control-id="header-close"
              onMouseEnter={() => {
                if (pointerReadyRef.current) setFocusedControlId('header-close')
              }}
              onClick={onClose}
              aria-label="Exit theme studio"
              className={cn(
                'grid size-[clamp(34px,2.35vw,40px)] shrink-0 place-items-center rounded-full text-white/80 outline-none transition-all duration-150 hover:text-white',
                focusedControlId === 'header-close' && 'scale-[1.03] text-white',
              )}
              style={{
                backgroundColor:
                  focusedControlId === 'header-close' ? liveTokens.surfaceElevated : liveTokens.glass,
                boxShadow:
                  focusedControlId === 'header-close'
                    ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 18px ${liveTokens.glow1}`
                    : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Two-Column Spatial Studio Body (No full-width stacked list rows) */}
        <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(285px,35%)_1fr]">
          {/* LEFT RAIL: Live Launcher Miniature Stage + Color Layer Target + Theme Identity */}
          <aside
            className="flex flex-col justify-between gap-[1.8vh] border-b p-[1.8vw] md:border-b-0 md:border-r"
            style={{
              borderColor: liveTokens.glassBorder,
              backgroundColor: colorWithAlpha(liveTokens.bg, 0.52),
            }}
          >
            {/* Live Miniature Launcher Preview */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Live Preview
                </span>
                <span className="truncate text-xs font-semibold text-white/85">{displayName}</span>
              </div>

              <div
                aria-hidden="true"
                className="relative flex aspect-[16/10] w-full flex-col justify-between overflow-hidden rounded-2xl p-3.5"
                style={{
                  backgroundColor: liveTokens.bg,
                  boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}, 0 14px 32px rgba(0,0,0,0.65)`,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    opacity: 'calc(0.95 * var(--tv-glow-scale, 1))',
                    background: `
                      radial-gradient(ellipse 85% 65% at 75% 18%, ${liveTokens.glow1}, transparent 68%),
                      radial-gradient(ellipse 70% 55% at 18% 85%, ${liveTokens.glow2}, transparent 70%)
                    `,
                  }}
                />

                {/* Mini Top Bar */}
                <div className="relative z-10 flex items-center justify-end gap-1.5">
                  <div
                    className="flex items-center gap-1 rounded-full p-0.5"
                    style={{
                      backgroundColor: liveTokens.surface,
                      boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                    }}
                  >
                    <span className="size-2 rounded-full bg-white/40" />
                    <span className="size-2 rounded-full bg-white/40" />
                    <span className="size-2 rounded-full bg-white/40" />
                  </div>
                  <div
                    className="flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-0.5"
                    style={{
                      backgroundColor: liveTokens.surface,
                      boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                    }}
                  >
                    <span className="text-[8.5px] font-semibold tabular-nums text-white/90">72° · 9:41 AM</span>
                    <span className="size-2 rounded-full bg-white/40" />
                  </div>
                </div>

                {/* Mini Hero + Mini Focused Play Pill + Mini Shelf Cards */}
                <div className="relative z-10 mt-auto flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight tracking-tight text-white">
                        {displayName}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="h-1 w-8 rounded-full"
                          style={{ backgroundColor: liveTokens.accent }}
                        />
                        <span className="h-1 w-5 rounded-full bg-white/30" />
                      </div>
                    </div>

                    {/* Mini Halo Play Pill */}
                    <div className="relative shrink-0 rounded-full isolate">
                      <span
                        className="tv-halo-glow z-0"
                        style={{ '--tv-halo-spread': '-2px', '--tv-halo-blur': '6px' } as React.CSSProperties}
                      />
                      <span
                        aria-hidden="true"
                        className="tv-conic-border"
                        style={{ borderRadius: '9999px' } as React.CSSProperties}
                      />
                      <span
                        className="relative z-10 flex h-5 items-center rounded-full px-2.5 text-[9px] font-bold text-white"
                        style={{ backgroundColor: liveTokens.surface }}
                      >
                        <span className="relative z-20">Play</span>
                      </span>
                    </div>
                  </div>

                  {/* Mini Cards + Flow Progress */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div
                      className="relative aspect-[16/9] overflow-hidden rounded-lg"
                      style={{
                        backgroundColor: liveTokens.surfaceElevated,
                        boxShadow: `inset 0 0 0 1px ${liveTokens.accent}`,
                      }}
                    >
                      <div className="absolute inset-x-1.5 bottom-1 h-[3px] overflow-hidden rounded-full bg-white/20">
                        <div className="relative h-full w-3/4 overflow-hidden rounded-full">
                          <FlowFill />
                        </div>
                      </div>
                    </div>
                    <div
                      className="aspect-[16/9] rounded-lg"
                      style={{
                        backgroundColor: liveTokens.glass,
                        boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                      }}
                    />
                    <div
                      className="aspect-[16/9] rounded-lg"
                      style={{
                        backgroundColor: liveTokens.glass,
                        boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Color Layer Target Selector */}
            <div>
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Editing Layer
              </span>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    { id: 'accent', label: 'Primary Accent', value: accent },
                    { id: 'bg', label: 'Canvas Base', value: bg },
                    { id: 'secondary', label: 'Secondary Aura', value: secondaryGlow },
                  ] as const
                ).map((layer, idx) => {
                  const selected = activeLayer === layer.id
                  const controlId = `layer-${layer.id}`
                  const isFocused = focusedControlId === controlId
                  return (
                    <button
                      key={layer.id}
                      ref={idx === 0 ? firstLayerRef : undefined}
                      type="button"
                      data-control-id={controlId}
                      onMouseEnter={() => {
                        if (pointerReadyRef.current) setFocusedControlId(controlId)
                      }}
                      onClick={() => setActiveLayer(layer.id)}
                      className={cn(
                        'flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left outline-none transition-all duration-150',
                        isFocused ? 'scale-[1.015] text-white' : selected ? 'text-white' : 'text-white/75 hover:text-white',
                      )}
                      style={{
                        backgroundColor: isFocused
                          ? liveTokens.surfaceElevated
                          : selected
                            ? liveTokens.glass
                            : 'rgba(255,255,255,0.03)',
                        boxShadow: isFocused
                          ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 18px ${liveTokens.glow1}`
                          : selected
                            ? `inset 0 0 0 1px ${liveTokens.accent}`
                            : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                      }}
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-white">{layer.label}</span>
                        <span className="block text-[11px] font-medium tabular-nums text-white/55">
                          {layer.value.toUpperCase()}
                        </span>
                      </div>
                      <span
                        className="ml-2 size-5 shrink-0 rounded-full border border-white/35 shadow-sm"
                        style={{ backgroundColor: layer.value }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Theme Name Identity */}
            <div>
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Theme Name
              </span>
              <input
                ref={nameInputRef}
                type="text"
                data-control-id="theme-name-input"
                maxLength={28}
                value={customName}
                placeholder={SUGGESTED_NAMES[nameIndex]}
                onFocus={() => setFocusedControlId('theme-name-input')}
                onChange={(e) => setCustomName(e.target.value)}
                aria-label="Custom theme name"
                className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-white placeholder:text-white/50 outline-none transition-colors"
                style={{
                  backgroundColor: colorWithAlpha(bg, 0.72),
                  boxShadow:
                    focusedControlId === 'theme-name-input'
                      ? `inset 0 0 0 1.5px ${liveTokens.accent}`
                      : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                }}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  ref={typeNameRef}
                  type="button"
                  data-control-id="type-name"
                  onMouseEnter={() => {
                    if (pointerReadyRef.current) setFocusedControlId('type-name')
                  }}
                  onClick={() => setIsKeyboardOpen(true)}
                  className="flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-all duration-150"
                  style={
                    focusedControlId === 'type-name'
                      ? {
                          backgroundColor: liveTokens.accent,
                          color: liveTokens.accentText,
                          boxShadow: `0 0 16px ${liveTokens.glow1}`,
                        }
                      : {
                          backgroundColor: liveTokens.glass,
                          color: '#ffffff',
                          boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                        }
                  }
                >
                  <Pencil className="size-3" />
                  <span>Keyboard</span>
                </button>
                <button
                  type="button"
                  data-control-id="shuffle-name"
                  onMouseEnter={() => {
                    if (pointerReadyRef.current) setFocusedControlId('shuffle-name')
                  }}
                  onClick={() => {
                    setCustomName('')
                    setNameIndex((prev) => (prev + 1) % SUGGESTED_NAMES.length)
                  }}
                  className="flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-all duration-150"
                  style={
                    focusedControlId === 'shuffle-name'
                      ? {
                          backgroundColor: liveTokens.accent,
                          color: liveTokens.accentText,
                          boxShadow: `0 0 16px ${liveTokens.glow1}`,
                        }
                      : {
                          backgroundColor: liveTokens.glass,
                          color: '#ffffff',
                          boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                        }
                  }
                >
                  <Dices className="size-3.5" />
                  <span>Shuffle</span>
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT WORKSPACE: Compact Grouped Color, Lighting & Palette Panels */}
          <section className="flex flex-col justify-between gap-[1.6vh] p-[1.8vw]">
            {/* Panel 1: 360° Hue Spectrum */}
            <div
              className="rounded-2xl p-3.5"
              style={cardSurfaceStyle}
            >
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Hue Spectrum · {activeLayerLabel}
                </span>
                <span className="text-xs font-bold tabular-nums" style={{ color: liveTokens.accent }}>
                  {currentHue}°
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  data-control-id="hue-minus"
                  onMouseEnter={() => {
                    if (pointerReadyRef.current) setFocusedControlId('hue-minus')
                  }}
                  onClick={() => applyHueChange((currentHue - 10 + 360) % 360)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums outline-none transition-all duration-150"
                  style={
                    focusedControlId === 'hue-minus'
                      ? {
                          backgroundColor: liveTokens.accent,
                          color: liveTokens.accentText,
                          boxShadow: `0 0 14px ${liveTokens.glow1}`,
                        }
                      : {
                          backgroundColor: liveTokens.surfaceElevated,
                          color: 'rgba(255,255,255,0.88)',
                          boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                        }
                  }
                >
                  -10°
                </button>

                <button
                  type="button"
                  role="slider"
                  data-hue-slider="true"
                  data-control-id="hue-slider"
                  aria-label={`Hue spectrum for ${activeLayerLabel}`}
                  aria-valuemin={0}
                  aria-valuemax={359}
                  aria-valuenow={currentHue}
                  onMouseEnter={() => {
                    if (pointerReadyRef.current) setFocusedControlId('hue-slider')
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    applyHueChange(Math.round(ratio * 359))
                  }}
                  className="relative h-5 flex-1 cursor-pointer overflow-hidden rounded-full outline-none"
                  style={{
                    boxShadow:
                      focusedControlId === 'hue-slider'
                        ? `0 0 0 2px ${liveTokens.accent}, 0 0 16px ${liveTokens.glow1}`
                        : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                  }}
                >
                  <span
                    className="block h-full w-full"
                    style={{
                      background:
                        'linear-gradient(to right, #ff0000 0%, #ff7700 8%, #ffdd00 16%, #88ff00 25%, #00ff66 33%, #00ffff 45%, #0088ff 58%, #7700ff 72%, #ff00ff 85%, #ff0077 94%, #ff0000 100%)',
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-2 -translate-x-1/2 rounded-full bg-white shadow-md ring-1 ring-black/60"
                    style={{ left: `${(Math.max(0, currentHue) / 360) * 100}%` }}
                  />
                </button>

                <button
                  type="button"
                  data-control-id="hue-plus"
                  onMouseEnter={() => {
                    if (pointerReadyRef.current) setFocusedControlId('hue-plus')
                  }}
                  onClick={() => applyHueChange((currentHue + 10) % 360)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums outline-none transition-all duration-150"
                  style={
                    focusedControlId === 'hue-plus'
                      ? {
                          backgroundColor: liveTokens.accent,
                          color: liveTokens.accentText,
                          boxShadow: `0 0 14px ${liveTokens.glow1}`,
                        }
                      : {
                          backgroundColor: liveTokens.surfaceElevated,
                          color: 'rgba(255,255,255,0.88)',
                          boxShadow: `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                        }
                  }
                >
                  +10°
                </button>
              </div>
            </div>

            {/* Panel 2 & 3 Side-by-Side: Tone / Canvas Depth + Ambient Glow Energy */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {/* Sub-panel A: Canvas Depth or Tone & Radiance */}
              <div className="rounded-2xl p-3.5" style={cardSurfaceStyle}>
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                    {activeLayer === 'bg' ? 'Canvas Depth' : 'Tone & Radiance'}
                  </span>
                </div>

                {activeLayer === 'bg' ? (
                  <div className="flex flex-col gap-1.5">
                    {BG_LEVELS.map((b) => {
                      const isSelected = bgDarkness === b.level
                      const controlId = `bg-${b.level}`
                      const isFocused = focusedControlId === controlId
                      return (
                        <button
                          key={b.level}
                          type="button"
                          data-control-id={controlId}
                          onMouseEnter={() => {
                            if (pointerReadyRef.current) setFocusedControlId(controlId)
                          }}
                          onClick={() => applyBgDarkness(b.level)}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left outline-none transition-all duration-150',
                            isFocused && 'scale-[1.015]',
                          )}
                          style={{
                            backgroundColor: isFocused
                              ? liveTokens.surfaceElevated
                              : isSelected
                                ? 'rgba(255,255,255,0.08)'
                                : 'rgba(255,255,255,0.025)',
                            boxShadow: isFocused
                              ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 14px ${liveTokens.glow1}`
                              : isSelected
                                ? `inset 0 0 0 1px ${liveTokens.accent}`
                                : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                          }}
                        >
                          <span className="truncate text-xs font-semibold text-white">{b.label}</span>
                          <span className="shrink-0 text-[11px] text-white/55">{b.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {TONE_OPTIONS.map((t) => {
                      const activeTone = activeLayer === 'accent' ? accentTone : secondaryTone
                      const isSelected = activeTone === t.id
                      const controlId = `tone-${t.id}`
                      const isFocused = focusedControlId === controlId
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-control-id={controlId}
                          onMouseEnter={() => {
                            if (pointerReadyRef.current) setFocusedControlId(controlId)
                          }}
                          onClick={() => applyTone(t.id)}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left outline-none transition-all duration-150',
                            isFocused && 'scale-[1.015]',
                          )}
                          style={{
                            backgroundColor: isFocused
                              ? liveTokens.surfaceElevated
                              : isSelected
                                ? 'rgba(255,255,255,0.08)'
                                : 'rgba(255,255,255,0.025)',
                            boxShadow: isFocused
                              ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 14px ${liveTokens.glow1}`
                              : isSelected
                                ? `inset 0 0 0 1px ${liveTokens.accent}`
                                : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                          }}
                        >
                          <span className="truncate text-xs font-semibold text-white">{t.label}</span>
                          <span className="shrink-0 text-[11px] text-white/55">{t.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Sub-panel B: Ambient Glow Energy */}
              <div className="flex flex-col justify-between rounded-2xl p-3.5" style={cardSurfaceStyle}>
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                    Ambient Glow Energy
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-between gap-2">
                  {INTENSITY_OPTIONS.map((opt) => {
                    const isActive = intensity === opt.id
                    const controlId = `intensity-${opt.id}`
                    const isFocused = focusedControlId === controlId
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-control-id={controlId}
                        onMouseEnter={() => {
                          if (pointerReadyRef.current) setFocusedControlId(controlId)
                        }}
                        onClick={() => setIntensity(opt.id)}
                        className={cn(
                          'flex flex-1 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left outline-none transition-all duration-150',
                          isFocused && 'scale-[1.015]',
                        )}
                        style={{
                          backgroundColor: isFocused
                            ? liveTokens.surfaceElevated
                            : isActive
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(255,255,255,0.025)',
                          boxShadow: isFocused
                            ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 16px ${liveTokens.glow1}`
                            : isActive
                              ? `inset 0 0 0 1px ${liveTokens.accent}`
                              : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
                        }}
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-white">{opt.label}</span>
                          <span className="block truncate text-[11px] text-white/55">{opt.desc}</span>
                        </div>
                        <span
                          aria-hidden="true"
                          className="grid size-4.5 shrink-0 place-items-center rounded-full"
                          style={
                            isActive
                              ? { backgroundColor: liveTokens.accent, color: liveTokens.accentText }
                              : { boxShadow: `inset 0 0 0 1.5px ${liveTokens.glassBorder}` }
                          }
                        >
                          {isActive && <Check className="size-3 stroke-[3]" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Panel 4: Compact Color Swatch Matrix */}
            <div className="rounded-2xl p-3.5" style={cardSurfaceStyle}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Quick Swatches
                </span>
                <span className="text-xs font-medium text-white/75">
                  {activeSwatchMatch ? activeSwatchMatch.label : activeColorHex.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-8 gap-2 sm:grid-cols-12">
                {STUDIO_COLOR_SWATCHES.map((sw) => {
                  const controlId = `swatch-${sw.label}`
                  const isFocused = focusedControlId === controlId
                  const isActive = activeColorHex.toLowerCase() === sw.hex.toLowerCase()
                  const ringColor = sw.hex === '#000000' ? '#ffffff' : sw.hex

                  return (
                    <button
                      key={sw.label}
                      type="button"
                      data-control-id={controlId}
                      aria-label={`${sw.label} (${sw.hex})`}
                      title={sw.label}
                      onMouseEnter={() => {
                        if (pointerReadyRef.current) setFocusedControlId(controlId)
                      }}
                      onClick={() => applySwatch(sw)}
                      className={cn(
                        'mx-auto grid size-7 place-items-center rounded-full outline-none transition-transform duration-150',
                        isFocused ? 'scale-120' : 'hover:scale-110',
                      )}
                      style={{
                        backgroundColor: sw.hex,
                        boxShadow: isFocused
                          ? `0 0 0 2px ${liveTokens.surface}, 0 0 0 3.5px ${ringColor}, 0 0 14px ${colorWithAlpha(ringColor, 0.5)}`
                          : isActive
                            ? `0 0 0 2px ${liveTokens.surface}, 0 0 0 3px ${ringColor}`
                            : 'inset 0 0 0 1px rgba(255,255,255,0.28)',
                      }}
                    >
                      {isActive && (
                        <Check
                          className="size-3.5 stroke-[3]"
                          style={{ color: getContrastText(sw.hex) }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Clean Action Footer */}
        <footer
          className="flex shrink-0 items-center justify-between gap-4 border-t px-[2.2vw] py-[1.6vh]"
          style={{ borderColor: liveTokens.glassBorder }}
        >
          <p className="hidden truncate text-xs font-medium tabular-nums text-white/58 sm:block">
            {activeLayerLabel}: {activeColorHex.toUpperCase()} · {activeIntensityLabel}
          </p>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              data-control-id="footer-cancel"
              onMouseEnter={() => {
                if (pointerReadyRef.current) setFocusedControlId('footer-cancel')
              }}
              onClick={onClose}
              className={cn(
                'rounded-full px-5 py-2 text-xs font-semibold outline-none transition-all duration-150',
                focusedControlId === 'footer-cancel'
                  ? 'scale-[1.03] text-white'
                  : 'text-white/75 hover:text-white',
              )}
              style={{
                backgroundColor:
                  focusedControlId === 'footer-cancel' ? liveTokens.surfaceElevated : liveTokens.glass,
                boxShadow:
                  focusedControlId === 'footer-cancel'
                    ? `inset 0 0 0 1.5px ${liveTokens.accent}, 0 0 18px ${liveTokens.glow1}`
                    : `inset 0 0 0 1px ${liveTokens.glassBorder}`,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-control-id="footer-save"
              onMouseEnter={() => {
                if (pointerReadyRef.current) setFocusedControlId('footer-save')
              }}
              onClick={handleSave}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap shrink-0 rounded-full px-6 py-2 text-xs font-bold outline-none transition-all duration-150',
                focusedControlId === 'footer-save' ? 'scale-[1.03]' : 'hover:scale-[1.02]',
              )}
              style={{
                backgroundColor: liveTokens.accent,
                color: liveTokens.accentText,
                boxShadow:
                  focusedControlId === 'footer-save'
                    ? `inset 0 0 0 1.5px rgba(255,255,255,0.65), 0 0 24px ${liveTokens.glow1}`
                    : `0 0 16px ${liveTokens.glow1}`,
              }}
            >
              <Check className="size-3.5 stroke-[3]" />
              <span>{editingTheme ? 'Save Changes' : 'Save & Apply Theme'}</span>
            </button>
          </div>
        </footer>
      </div>

      {/* Remote-Friendly Theme Naming Keyboard */}
      <TvKeyboard
        isOpen={isKeyboardOpen}
        value={customName}
        placeholder={SUGGESTED_NAMES[nameIndex]}
        submitLabel="Done"
        mode="text"
        currentTheme={liveTheme}
        onChange={setCustomName}
        onSubmit={() => {
          setIsKeyboardOpen(false)
          requestAnimationFrame(() => typeNameRef.current?.focus({ preventScroll: true }))
        }}
        onClose={() => {
          setIsKeyboardOpen(false)
          requestAnimationFrame(() => typeNameRef.current?.focus({ preventScroll: true }))
        }}
      />
    </div>
  )
}
