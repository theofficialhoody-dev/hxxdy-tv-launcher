import type { ContinueItem, HeroSlide, LauncherApp, ServiceId } from './launcher-data'

type RawApp = { pkg: string; label: string; icon: string }

type RawWatchNext = {
  id: string
  pkg: string
  appName: string
  appIcon: string
  title: string
  description: string
  image: string
  backdrop: string
  logo: string
  intentUri: string
  positionMs: number
  durationMs: number
  type: number
  season: string
  episode: string
  episodeTitle: string
}

/** Methods exposed by the Android shell (LauncherBridge.kt) via addJavascriptInterface. */
type Bridge = {
  getApps(): string
  launch(pkg: string): boolean
  launchIntent(uri: string): boolean
  getWatchNext(): string
  getYouTubeHistory(): string
  hasWatchNextAccess(): boolean
  requestWatchNextAccess(): void
  getNetwork(): string
  getDisplayInfo(): string
  getAudioInfo(): string
  getDeviceProfile(): string
  adjustMediaVolume(direction: number): boolean
  openSystem(kind: string): boolean
  openAppInfo(pkg: string): boolean
  playLiveWallpaper?(url: string): boolean
  pauseLiveWallpaper?(): void
  stopLiveWallpaper?(): void
}

declare global {
  interface Window {
    LauncherBridge?: Bridge
  }
}

/** `amlogic` is the vendor "More Settings" list that holds Picture > AI-PQ/AI-SR (Amlogic boxes). */
export type SystemTarget = 'settings' | 'wifi' | 'network' | 'accounts' | 'display' | 'sound' | 'amlogic'

export type NetworkInfo = { connected: boolean; label: string; internet?: boolean; vpn?: boolean; ipAddress?: string | null }
export type DisplayInfo = { available: boolean; width?: number; height?: number; refreshRate?: number; hdrTypes?: string[] }
/** Reported by the shell once per launch: total RAM in bytes, Android's low-RAM flag and the API level. */
export type DeviceProfile = { totalMem: number; lowRam: boolean; sdk: number }
export type AudioInfo = { volume: number; maxVolume: number; muted: boolean; fixedVolume: boolean; systemSounds: boolean | null }

const PACKAGE_TO_SERVICE: Record<string, ServiceId> = {
  'com.netflix.ninja': 'netflix',
  'com.disney.disneyplus': 'disney-plus',
  'com.wbd.stream': 'max',
  'com.hbo.hbonow': 'max',
  'com.amazon.amazonvideo.livingroom': 'prime-video',
  'com.amazon.avod': 'prime-video',
  'com.apple.atve.androidtv.appletv': 'apple-tv',
  'com.apple.atve.sony.appletv': 'apple-tv',
  'com.hulu.livingroomplus': 'hulu',
  'com.hulu.plus': 'hulu',
  'com.google.android.youtube.tv': 'youtube',
  'com.spotify.tv.android': 'spotify',
  'com.plexapp.android': 'plex',
  'tv.twitch.android.app': 'twitch',
}

function bridge(): Bridge | null {
  return typeof window === 'undefined' ? null : (window.LauncherBridge ?? null)
}

function parse<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function getDeviceProfile(): DeviceProfile | null {
  const b = bridge()
  // Older installed shells do not expose the probe yet: treat that as unknown, not as a crash.
  if (!b || typeof b.getDeviceProfile !== 'function') return null
  const profile = parse<DeviceProfile | null>(b.getDeviceProfile(), null)
  if (!profile || !Number.isFinite(profile.totalMem) || profile.totalMem <= 0) return null
  return { totalMem: profile.totalMem, lowRam: profile.lowRam === true, sdk: profile.sdk || 0 }
}

export function isNative(): boolean {
  return bridge() !== null
}

export function loadApps(): LauncherApp[] {
  const b = bridge()
  if (!b) return []
  return parse<RawApp[]>(b.getApps(), []).map((app) => ({
    pkg: app.pkg,
    label: app.label,
    icon: app.icon,
    service: PACKAGE_TO_SERVICE[app.pkg],
  }))
}

function remainingLabel(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) return ''
  const minutes = Math.max(0, Math.round((durationMs - positionMs) / 60000))
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m left`
  return `${minutes}m left`
}

function detailLabel(item: RawWatchNext): string {
  const parts: string[] = []
  if (item.season && item.episode) parts.push(`S${item.season} · E${item.episode}`)
  else if (item.episode) parts.push(`E${item.episode}`)
  if (item.episodeTitle) parts.push(item.episodeTitle)
  if (parts.length) return parts.join(' · ')
  return item.type === 0 ? 'Film' : item.appName
}

export function loadContinueWatching(): ContinueItem[] {
  const b = bridge()
  if (!b) return []
  return parse<RawWatchNext[]>(b.getWatchNext(), []).map((item) => ({
    id: item.id,
    title: item.title,
    detail: detailLabel(item),
    remaining: remainingLabel(item.positionMs, item.durationMs),
    progress: item.durationMs > 0 ? Math.min(1, Math.max(0, item.positionMs / item.durationMs)) : 0,
    image: item.image,
    backdrop: item.backdrop,
    logo: item.logo,
    pkg: item.pkg,
    service: PACKAGE_TO_SERVICE[item.pkg],
    appName: item.appName,
    appIcon: item.appIcon,
    intentUri: item.intentUri,
    description: item.description,
  }))
}

export function loadYouTubeHistory(): ContinueItem[] {
  const b = bridge()
  if (!b) return []
  return parse<Pick<RawWatchNext, 'id' | 'pkg' | 'appName' | 'appIcon' | 'title' | 'description' | 'image' | 'intentUri'>[]>(b.getYouTubeHistory(), []).map((item) => ({
    ...item, detail: 'Recently watched', remaining: '', progress: 0, logo: '', historyOnly: true,
  }))
}

export function heroFromContinue(items: ContinueItem[]): HeroSlide[] {
  return items
    .filter((item) => item.backdrop || item.image)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      backdrop: item.backdrop || item.image,
      logo: item.logo ?? '',
      service: item.service,
      appName: item.appName,
      appIcon: item.appIcon,
      intentUri: item.intentUri,
      pkg: item.pkg,
      eyebrow: 'Continue Watching',
      meta: [item.detail, item.remaining].filter(Boolean),
      badges: [],
      synopsis: item.description ?? '',
    }))
}

export function hasWatchNextAccess(): boolean {
  return bridge()?.hasWatchNextAccess() ?? false
}

export function requestWatchNextAccess(): void {
  bridge()?.requestWatchNextAccess()
}

export function getNetwork(): NetworkInfo {
  const b = bridge()
  return b ? parse<NetworkInfo>(b.getNetwork(), { connected: false, label: 'Offline' }) : { connected: true, label: 'Wi-Fi' }
}

export function getDisplayInfo(): DisplayInfo {
  const b = bridge()
  return b ? parse<DisplayInfo>(b.getDisplayInfo(), { available: false }) : { available: false }
}

export function getAudioInfo(): AudioInfo | null {
  const b = bridge()
  return b ? parse<AudioInfo | null>(b.getAudioInfo(), null) : null
}

export function adjustMediaVolume(direction: -1 | 1): boolean {
  const b = bridge()
  return b ? b.adjustMediaVolume(direction) : false
}

export function launchApp(pkg: string): boolean {
  return bridge()?.launch(pkg) ?? false
}

export function launchIntent(uri: string): boolean {
  return bridge()?.launchIntent(uri) ?? false
}

export function openSystem(kind: SystemTarget): boolean {
  return bridge()?.openSystem(kind) ?? false
}

export function openAppInfo(pkg: string): boolean {
  return bridge()?.openAppInfo(pkg) ?? false
}

/** True when the installed shell decodes the live wallpaper on a native SurfaceView. */
export function hasNativeLiveWallpaper(): boolean {
  return typeof bridge()?.playLiveWallpaper === 'function'
}

export function playLiveWallpaper(url: string): boolean {
  const b = bridge()
  return typeof b?.playLiveWallpaper === 'function' ? b.playLiveWallpaper(url) : false
}

export function pauseLiveWallpaper(): void {
  const b = bridge()
  if (typeof b?.pauseLiveWallpaper === 'function') b.pauseLiveWallpaper()
}

export function stopLiveWallpaper(): void {
  const b = bridge()
  if (typeof b?.stopLiveWallpaper === 'function') b.stopLiveWallpaper()
}
