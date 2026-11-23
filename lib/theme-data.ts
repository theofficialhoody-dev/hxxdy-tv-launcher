import type { CSSProperties } from 'react'

export type ThemeGlowIntensity = 'subtle' | 'vibrant' | 'dramatic'

export type ThemeConfig = {
  id: string
  name: string
  description: string
  isCustom?: boolean
  // Core colors
  bg: string // e.g. '#000000'
  accent: string // e.g. '#3b82f6'
  secondaryAccent?: string // Solid secondary gradient/aura hex e.g. '#a855f7'
  accentText: string // e.g. '#ffffff' or '#000000'
  glow1: string // Primary ambient spotlight / aurora color
  glow2: string // Secondary ambient color
  glassBg: string // rgba for cards
  glassBorder: string // rgba for hairline borders
  intensity: ThemeGlowIntensity
}

export type ResolvedThemeTokens = {
  bg: string
  surface: string
  surfaceElevated: string
  accent: string
  accent2: string
  accentText: string
  glow1: string
  glow2: string
  glass: string
  glassBorder: string
  glowScale: number
}

export type StudioColorSwatch = {
  hue: number
  hex: string
  label: string
}

export const STUDIO_COLOR_SWATCHES: StudioColorSwatch[] = [
  { hue: 0, hex: '#f43f5e', label: 'Crimson' },
  { hue: 15, hex: '#fb7185', label: 'Coral' },
  { hue: 28, hex: '#f97316', label: 'Tangerine' },
  { hue: 42, hex: '#fb923c', label: 'Amber' },
  { hue: 52, hex: '#f59e0b', label: 'Gold' },
  { hue: 68, hex: '#eab308', label: 'Solar' },
  { hue: 84, hex: '#84cc16', label: 'Lime' },
  { hue: 120, hex: '#22c55e', label: 'Spring' },
  { hue: 145, hex: '#10b981', label: 'Emerald' },
  { hue: 165, hex: '#14b8a6', label: 'Teal' },
  { hue: 180, hex: '#06b6d4', label: 'Cyan' },
  { hue: 195, hex: '#0ea5e9', label: 'Sky' },
  { hue: 215, hex: '#38bdf8', label: 'Ice Azure' },
  { hue: 228, hex: '#3b82f6', label: 'Cobalt' },
  { hue: 242, hex: '#6366f1', label: 'Indigo' },
  { hue: 260, hex: '#8b5cf6', label: 'Violet' },
  { hue: 278, hex: '#a855f7', label: 'Purple' },
  { hue: 295, hex: '#c084fc', label: 'Orchid' },
  { hue: 312, hex: '#d946ef', label: 'Magenta' },
  { hue: 330, hex: '#ec4899', label: 'Hot Pink' },
  { hue: -1, hex: '#ffffff', label: 'Pure White' },
  { hue: -2, hex: '#94a3b8', label: 'Titanium' },
  { hue: -3, hex: '#000000', label: 'OLED Black' },
]

export const BUILT_IN_THEMES: ThemeConfig[] = [
  {
    id: 'midnight-oled',
    name: 'Midnight OLED',
    description: 'Pure pitch black canvas with piercing icy azure focus glow.',
    bg: '#000000',
    accent: '#38bdf8',
    secondaryAccent: '#6366f1',
    accentText: '#000000',
    glow1: 'rgba(56, 189, 248, 0.24)',
    glow2: 'rgba(99, 102, 241, 0.18)',
    glassBg: 'rgba(255, 255, 255, 0.075)',
    glassBorder: 'rgba(255, 255, 255, 0.16)',
    intensity: 'vibrant',
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    description: 'Electric cyan and neon magenta over deep obsidian synth space.',
    bg: '#050512',
    accent: '#06b6d4',
    secondaryAccent: '#ec4899',
    accentText: '#000000',
    glow1: 'rgba(6, 182, 212, 0.28)',
    glow2: 'rgba(236, 72, 153, 0.24)',
    glassBg: 'rgba(6, 182, 212, 0.10)',
    glassBorder: 'rgba(6, 182, 212, 0.28)',
    intensity: 'dramatic',
  },
  {
    id: 'nordic-aurora',
    name: 'Nordic Aurora',
    description: 'Ethereal emerald and polar teal dancing across arctic darkness.',
    bg: '#021812',
    accent: '#34d399',
    secondaryAccent: '#2dd4bf',
    accentText: '#022c22',
    glow1: 'rgba(52, 211, 153, 0.26)',
    glow2: 'rgba(45, 212, 191, 0.20)',
    glassBg: 'rgba(16, 185, 129, 0.10)',
    glassBorder: 'rgba(52, 211, 153, 0.26)',
    intensity: 'vibrant',
  },
  {
    id: 'crimson-cinema',
    name: 'Crimson Cinema',
    description: 'Theatrical red velvet and champagne gold from the golden age.',
    bg: '#140307',
    accent: '#f43f5e',
    secondaryAccent: '#fbbf24',
    accentText: '#ffffff',
    glow1: 'rgba(244, 63, 94, 0.26)',
    glow2: 'rgba(251, 191, 36, 0.18)',
    glassBg: 'rgba(244, 63, 94, 0.10)',
    glassBorder: 'rgba(251, 113, 133, 0.26)',
    intensity: 'vibrant',
  },
  {
    id: 'sunset-horizon',
    name: 'Sunset Horizon',
    description: 'Warm dusk twilight with radiating ember coral and golden glow.',
    bg: '#170b06',
    accent: '#fb923c',
    secondaryAccent: '#f43f5e',
    accentText: '#180702',
    glow1: 'rgba(251, 146, 60, 0.26)',
    glow2: 'rgba(244, 63, 94, 0.20)',
    glassBg: 'rgba(251, 146, 60, 0.10)',
    glassBorder: 'rgba(253, 186, 116, 0.26)',
    intensity: 'vibrant',
  },
  {
    id: 'royal-amethyst',
    name: 'Royal Amethyst',
    description: 'Deep celestial cosmos enveloped in rich radiant purple nebula.',
    bg: '#0d0419',
    accent: '#c084fc',
    secondaryAccent: '#ec4899',
    accentText: '#1e053a',
    glow1: 'rgba(192, 132, 252, 0.26)',
    glow2: 'rgba(236, 72, 153, 0.20)',
    glassBg: 'rgba(192, 132, 252, 0.10)',
    glassBorder: 'rgba(216, 180, 254, 0.26)',
    intensity: 'vibrant',
  },
  {
    id: 'oceanic-abyss',
    name: 'Oceanic Abyss',
    description: 'Trench navy blue with bioluminescent marine aqua accents.',
    bg: '#03101c',
    accent: '#38bdf8',
    secondaryAccent: '#0ea5e9',
    accentText: '#041d30',
    glow1: 'rgba(56, 189, 248, 0.24)',
    glow2: 'rgba(14, 165, 233, 0.20)',
    glassBg: 'rgba(56, 189, 248, 0.08)',
    glassBorder: 'rgba(125, 211, 252, 0.22)',
    intensity: 'subtle',
  },
  {
    id: 'solar-dune',
    name: 'Solar Dune',
    description: 'Burnished bronze and desert spice sands illuminated by sun flares.',
    bg: '#1c1004',
    accent: '#fbbf24',
    secondaryAccent: '#f97316',
    accentText: '#261603',
    glow1: 'rgba(251, 191, 36, 0.26)',
    glow2: 'rgba(249, 115, 22, 0.20)',
    glassBg: 'rgba(251, 191, 36, 0.09)',
    glassBorder: 'rgba(252, 211, 77, 0.25)',
    intensity: 'vibrant',
  },
  {
    id: 'matrix-monolith',
    name: 'Matrix Monolith',
    description: 'Phosphor green CRT terminal glow piercing ultra-dark void.',
    bg: '#020d04',
    accent: '#4ade80',
    secondaryAccent: '#10b981',
    accentText: '#022108',
    glow1: 'rgba(74, 222, 128, 0.26)',
    glow2: 'rgba(16, 185, 129, 0.18)',
    glassBg: 'rgba(74, 222, 128, 0.09)',
    glassBorder: 'rgba(134, 239, 172, 0.26)',
    intensity: 'vibrant',
  },
  {
    id: 'minimalist-titanium',
    name: 'Minimalist Titanium',
    description: 'Brushed graphite monochrome with pure crisp platinum highlights.',
    bg: '#0c0e12',
    accent: '#ffffff',
    secondaryAccent: '#94a3b8',
    accentText: '#000000',
    glow1: 'rgba(255, 255, 255, 0.18)',
    glow2: 'rgba(148, 163, 184, 0.16)',
    glassBg: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.20)',
    intensity: 'subtle',
  },
]

export function parseColorToRgb(color: string): { r: number; g: number; b: number } {
  const trimmed = (color || '').trim()
  if (trimmed.startsWith('#')) {
    const raw = trimmed.slice(1)
    const expanded =
      raw.length === 3
        ? raw
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : raw.padEnd(6, '0')
    return {
      r: parseInt(expanded.slice(0, 2), 16) || 0,
      g: parseInt(expanded.slice(2, 4), 16) || 0,
      b: parseInt(expanded.slice(4, 6), 16) || 0,
    }
  }
  const match = trimmed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (match) {
    return {
      r: Math.min(255, Math.max(0, Math.round(Number(match[1])))),
      g: Math.min(255, Math.max(0, Math.round(Number(match[2])))),
      b: Math.min(255, Math.max(0, Math.round(Number(match[3])))),
    }
  }
  return { r: 56, g: 189, b: 248 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function colorWithAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseColorToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, Number(alpha.toFixed(3))))})`
}

export function getContrastText(hex: string): string {
  const { r, g, b } = parseColorToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 145 ? '#000000' : '#ffffff'
}

export function getIntensityGlowScale(intensity: ThemeGlowIntensity): number {
  if (intensity === 'subtle') return 0.65
  if (intensity === 'dramatic') return 1.38
  return 1
}

export function resolveThemeTokens(theme?: ThemeConfig): ResolvedThemeTokens {
  const t = theme ?? BUILT_IN_THEMES[0]
  const scale = getIntensityGlowScale(t.intensity)
  const accent2Rgb = parseColorToRgb(t.secondaryAccent || t.glow2 || t.accent)
  const accent2 = t.secondaryAccent || rgbToHex(accent2Rgb.r, accent2Rgb.g, accent2Rgb.b)
  const bgRgb = parseColorToRgb(t.bg || '#000000')
  const surfaceR = Math.min(255, bgRgb.r + 10)
  const surfaceG = Math.min(255, bgRgb.g + 11)
  const surfaceB = Math.min(255, bgRgb.b + 15)
  const glowAlpha1 = Math.min(0.48, 0.24 * scale)
  const glowAlpha2 = Math.min(0.40, 0.19 * scale)
  const borderAlpha = Math.min(0.42, (t.intensity === 'subtle' ? 0.18 : t.intensity === 'dramatic' ? 0.34 : 0.24))

  return {
    bg: t.bg || '#000000',
    surface: `rgba(${surfaceR}, ${surfaceG}, ${surfaceB}, 0.94)`,
    surfaceElevated: `rgba(${Math.min(255, surfaceR + 8)}, ${Math.min(255, surfaceG + 8)}, ${Math.min(255, surfaceB + 10)}, 0.96)`,
    accent: t.accent,
    accent2,
    accentText: t.accentText || getContrastText(t.accent),
    glow1: t.glow1 || colorWithAlpha(t.accent, glowAlpha1),
    glow2: t.glow2 || colorWithAlpha(accent2, glowAlpha2),
    glass: t.glassBg || colorWithAlpha(t.accent, 0.09),
    glassBorder: t.glassBorder || colorWithAlpha(t.accent, borderAlpha),
    glowScale: scale,
  }
}

export function themeTokensToCssVars(tokens: ResolvedThemeTokens): CSSProperties {
  return {
    '--tv-bg': tokens.bg,
    '--tv-surface': tokens.surface,
    '--tv-surface-elevated': tokens.surfaceElevated,
    '--tv-accent': tokens.accent,
    '--tv-accent-2': tokens.accent2,
    '--tv-accent-text': tokens.accentText,
    '--tv-glow': tokens.glow1,
    '--tv-glow-2': tokens.glow2,
    '--tv-glass': tokens.glass,
    '--tv-glass-border': tokens.glassBorder,
    '--tv-glow-scale': String(tokens.glowScale),
  } as CSSProperties
}

export function applyThemeCssVariables(theme: ThemeConfig, target?: HTMLElement | null): void {
  if (typeof document === 'undefined') return
  const tokens = resolveThemeTokens(theme)
  const targets = [document.documentElement, target ?? document.querySelector('main')].filter(
    (el): el is HTMLElement => Boolean(el),
  )

  for (const el of targets) {
    el.style.setProperty('--tv-bg', tokens.bg)
    el.style.setProperty('--tv-surface', tokens.surface)
    el.style.setProperty('--tv-surface-elevated', tokens.surfaceElevated)
    el.style.setProperty('--tv-accent', tokens.accent)
    el.style.setProperty('--tv-accent-2', tokens.accent2)
    el.style.setProperty('--tv-accent-text', tokens.accentText)
    el.style.setProperty('--tv-glow', tokens.glow1)
    el.style.setProperty('--tv-glow-2', tokens.glow2)
    el.style.setProperty('--tv-glass', tokens.glass)
    el.style.setProperty('--tv-glass-border', tokens.glassBorder)
    el.style.setProperty('--tv-glow-scale', String(tokens.glowScale))
  }
}

const STORAGE_KEY_CURRENT = 'tv_launcher_theme_id'
const STORAGE_KEY_CUSTOM = 'tv_launcher_custom_themes'

export function getStoredThemeId(): string {
  if (typeof window === 'undefined') return BUILT_IN_THEMES[0].id
  try {
    return localStorage.getItem(STORAGE_KEY_CURRENT) || BUILT_IN_THEMES[0].id
  } catch {
    return BUILT_IN_THEMES[0].id
  }
}

export function setStoredThemeId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT, id)
  } catch {
    // Ignore storage errors
  }
}

export function getCustomThemes(): ThemeConfig[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomThemeToStorage(theme: ThemeConfig): ThemeConfig[] {
  if (typeof window === 'undefined') return []
  try {
    const current = getCustomThemes()
    const index = current.findIndex((t) => t.id === theme.id)
    let updated: ThemeConfig[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = theme
    } else {
      updated = [theme, ...current]
    }
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export function deleteCustomThemeFromStorage(id: string): ThemeConfig[] {
  if (typeof window === 'undefined') return []
  try {
    const current = getCustomThemes()
    const updated = current.filter((t) => t.id !== id)
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}
