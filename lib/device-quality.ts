import type { DeviceProfile } from './native-bridge'

/** Manual override exposed in Launcher Settings → Display & Video. */
export type GraphicsQuality = 'auto' | 'high' | 'medium' | 'low'
/** The tier actually applied to the UI; `auto` is resolved once against the device specs. */
export type ResolvedQuality = 'high' | 'medium' | 'low'

const GIGABYTE = 1024 ** 3

export const GRAPHICS_QUALITY_OPTIONS: { id: GraphicsQuality; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === 'auto' || value === 'high' || value === 'medium' || value === 'low'
}

/**
 * HIGH: 3GB+ and Android 12+, not flagged low-RAM.
 * MEDIUM: ~2GB boxes (the Onn 4K Plus reports 1.9GB) or Android 10–11.
 * LOW: a device flagged low-RAM, or under 1.5GB.
 * No bridge (desktop browser preview) stays HIGH, so the design is untouched there.
 */
export function detectQuality(profile: DeviceProfile | null): ResolvedQuality {
  if (!profile) return 'high'
  const ramGb = profile.totalMem / GIGABYTE
  if (profile.lowRam || ramGb < 1.5) return 'low'
  if (ramGb >= 3 && profile.sdk >= 31) return 'high'
  return 'medium'
}

export function resolveQuality(setting: GraphicsQuality, profile: DeviceProfile | null): ResolvedQuality {
  return setting === 'auto' ? detectQuality(profile) : setting
}

export function qualityLabel(quality: ResolvedQuality): string {
  return quality === 'high' ? 'High' : quality === 'medium' ? 'Medium' : 'Low'
}
