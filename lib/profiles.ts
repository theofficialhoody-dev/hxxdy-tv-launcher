import { STUDIO_COLOR_SWATCHES } from './theme-data'

export type Profile = {
  id: string
  name: string
  color: string
  themeId: string
  /** Continue Watching entries the profile removed from its row. */
  hidden: string[]
}

export const PROFILE_COLORS = STUDIO_COLOR_SWATCHES.map((swatch) => swatch.hex)
const DEFAULT_PROFILE_COLORS = ['#38bdf8', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#f97316']
export const MAX_PROFILES = 6

const KEY_PROFILES = 'launcher.profiles'
const KEY_ACTIVE = 'launcher.activeProfile'

export function createProfile(name: string, index: number, themeId: string): Profile {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name,
    color: DEFAULT_PROFILE_COLORS[index % DEFAULT_PROFILE_COLORS.length],
    themeId,
    hidden: [],
  }
}

export function loadProfiles(defaultThemeId: string): { profiles: Profile[]; activeId: string } {
  let profiles: Profile[] = []
  try {
    const raw = localStorage.getItem(KEY_PROFILES)
    if (raw) profiles = (JSON.parse(raw) as Profile[]).filter((p) => p && p.id && p.name)
  } catch {
    profiles = []
  }
  if (!profiles.length) profiles = [createProfile('Me', 0, defaultThemeId)]
  profiles = profiles.map((p) => ({ ...p, hidden: p.hidden ?? [], themeId: p.themeId || defaultThemeId }))
  let activeId = ''
  try {
    activeId = localStorage.getItem(KEY_ACTIVE) ?? ''
  } catch {}
  if (!profiles.some((p) => p.id === activeId)) activeId = profiles[0].id
  return { profiles, activeId }
}

export function saveProfiles(profiles: Profile[], activeId: string): void {
  try {
    localStorage.setItem(KEY_PROFILES, JSON.stringify(profiles))
    localStorage.setItem(KEY_ACTIVE, activeId)
  } catch {}
}
