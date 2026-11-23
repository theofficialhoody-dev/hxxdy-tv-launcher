'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  continueWatching as demoContinue,
  heroSlides as demoHero,
  installedApps,
  PLAY_PACKAGES,
  registerNativeApps,
  services,
  type ContinueItem,
  type HeroSlide,
  type LauncherApp,
  type NavItemId,
  type ServiceId,
  type TasteItem,
} from '@/lib/launcher-data'
import {
  getDeviceProfile,
  getNetwork,
  hasWatchNextAccess,
  isNative,
  launchApp,
  launchIntent,
  loadApps,
  loadContinueWatching,
  openAppInfo,
  openSystem,
  requestWatchNextAccess,
  type DeviceProfile,
  type NetworkInfo,
} from '@/lib/native-bridge'
import { NUVIO_PACKAGE, nuvioFeaturedSlides, refreshTrendingSlides } from '@/lib/nuvio-featured'
import { detectQuality, resolveQuality } from '@/lib/device-quality'
import { SHELF_ANCHOR } from '@/lib/layout'
import { refreshTasteItems, tasteItemsForSession, tasteServiceName } from '@/lib/taste'
import { getNavigationSoundVolume, playNavigationSound } from '@/lib/navigation-sounds'
import {
  applyThemeCssVariables,
  BUILT_IN_THEMES,
  deleteCustomThemeFromStorage,
  getCustomThemes,
  getStoredThemeId,
  resolveThemeTokens,
  saveCustomThemeToStorage,
  setStoredThemeId,
  themeTokensToCssVars,
  type ThemeConfig,
} from '@/lib/theme-data'
import { TopHeader } from './top-header'
import { HeroBackdrop } from './hero-backdrop'
import { HeroInfo } from './hero-info'
import { ContinueWatchingRow } from './continue-watching-row'
import { YourTasteRow } from './your-taste-row'
import { AppsRow } from './apps-row'
import { LaunchOverlay, type LaunchState } from './launch-overlay'
import { ThemeModal } from './theme-modal'
import { ThemeCreator } from './theme-creator'
import { ProfileModal } from './profile-modal'
import { AppsMenuModal } from './apps-menu-modal'
import { SurfsharkModal } from './surfshark-modal'
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings, SettingsModal, type LauncherSettings } from './settings-modal'
import { createProfile, loadProfiles, saveProfiles, type Profile } from '@/lib/profiles'
type Zone = 'nav' | 'hero' | 'continue' | 'taste' | 'appsControls' | 'apps'

const ZONES: Zone[] = ['nav', 'hero', 'continue', 'taste', 'appsControls', 'apps']
const SLIDE_MS = 9000
const LAUNCH_MS = 2200
const LONG_PRESS_MS = 500
const HOLD_INDICATOR_MS = 120
const LAUNCH_DELAY_MS = 300
const SURFSHARK_PACKAGE = 'com.surfshark.vpnclient.android'
const YOUTUBE_PACKAGE = 'com.google.android.youtube.tv'
const SMARTTUBE_PACKAGES = ['org.smarttube.stable', 'org.smarttube.beta']
const isYouTubeItem = (item: ContinueItem) => item.pkg === YOUTUBE_PACKAGE || SMARTTUBE_PACKAGES.includes(item.pkg ?? '') || item.service === 'youtube'
const ORDER_KEY = 'tv_launcher_apps_order'
const HIDDEN_KEY = 'tv_launcher_apps_hidden'
// Row caps: every mounted card is a decoded poster riding a spring, and the box has 2 GB of RAM. The
// caps live here (not in the rows) so the "1 / N" caption counts exactly what is shown.
const CONTINUE_LIMIT = 10
const TASTE_LIMIT = 6

const idOf = (app: LauncherApp): string => app.service ?? app.pkg

function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

type NavItem = { id: NavItemId; label: string }

type LauncherData = {
  native: boolean
  apps: LauncherApp[]
  continueItems: ContinueItem[]
  slides: HeroSlide[]
  nav: NavItem[]
  network: NetworkInfo
}

const demoNav: NavItem[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'network', label: 'Wi-Fi · Home-5G' },
  { id: 'settings', label: 'Settings' },
  { id: 'apps', label: 'My Apps' },
  { id: 'profile', label: 'Me' },
]

const demoData: LauncherData = {
  native: false,
  apps: installedApps.map((id) => ({ pkg: id, label: services[id].name, icon: services[id].logo, service: id })),
  continueItems: demoContinue,
  slides: demoHero,
  nav: demoNav,
  network: { connected: true, label: 'Wi-Fi · Home-5G' },
}

const emptyData: LauncherData = { ...demoData, apps: [], continueItems: [], slides: [] }
const EMPTY_NATIVE_APPS: ReadonlyMap<string, LauncherApp> = new Map()

/** Resume via the app's own intent, falling back to simply opening the app. */
function openItem(intentUri?: string, pkg?: string): boolean {
  if (intentUri && launchIntent(intentUri)) return true
  return pkg ? launchApp(pkg) : false
}

function loadLauncherData(): LauncherData {
  if (!isNative()) return demoData
  const apps = loadApps()
  registerNativeApps(apps)
  const network = getNetwork()
  return {
    native: true,
    apps,
    continueItems: loadContinueWatching(),
    // The hero only features popular movies and shows, sourced the same way Nuvio does.
    slides: apps.some((app) => app.pkg === NUVIO_PACKAGE) ? nuvioFeaturedSlides() : [],
    nav: [
      { id: 'theme', label: 'Theme' },
      { id: 'network', label: network.label },
      ...(apps.some((app) => app.pkg === SURFSHARK_PACKAGE) ? [{ id: 'surfshark' as const, label: 'Surfshark VPN' }] : []),
      { id: 'settings', label: 'Settings' },
      { id: 'apps', label: 'My Apps' },
      { id: 'profile', label: 'Profile' },
    ],
    network,
  }
}

function retainUnchangedItems<T>(previous: T[], next: T[], key: (item: T) => string): T[] {
  const existing = new Map(previous.map((item) => [key(item), item]))
  const result = next.map((item) => {
    const old = existing.get(key(item))
    return old && JSON.stringify(old) === JSON.stringify(item) ? old : item
  })
  return result.length === previous.length && result.every((item, index) => item === previous[index]) ? previous : result
}

export function TvLauncher() {
  // Real data is only known on the client (the Android shell injects its bridge), so render nothing until then.
  const [data, setData] = useState<LauncherData>(emptyData)
  // Your Taste is rebuilt from the latest Watch Next history, so it starts empty until the init effect runs.
  const [taste, setTaste] = useState<TasteItem[]>([])
  const [ready, setReady] = useState(false)
  const { apps, slides: heroSlides, nav: navItems } = data

  // Settings, home-row order and hidden apps are client-only state, loaded in the init effect.
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS)
  // Read once from the shell after mount; a desktop browser has no bridge, so it stays HIGH there.
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null)
  const detectedQuality = useMemo(() => detectQuality(deviceProfile), [deviceProfile])
  const quality = useMemo(
    () => resolveQuality(settings.graphicsQuality, deviceProfile),
    [settings.graphicsQuality, deviceProfile],
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false)
  const [isSurfsharkOpen, setIsSurfsharkOpen] = useState(false)
  const [appsMenuTab, setAppsMenuTab] = useState<'installed' | 'store'>('installed')
  const [appsMenuRowEdit, setAppsMenuRowEdit] = useState(false)
  const [organize, setOrganize] = useState(false)
  const [movingApp, setMovingApp] = useState(false)
  const [holdingAppIndex, setHoldingAppIndex] = useState<number | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [demoAdded, setDemoAdded] = useState<string[]>([])
  const [demoRemoved, setDemoRemoved] = useState<string[]>([])

  const [zone, setZone] = useState<Zone>('hero')
  const [indices, setIndices] = useState<Record<Zone, number>>({ nav: 0, hero: 0, continue: 0, taste: 0, appsControls: 0, apps: 0 })
  const [slide, setSlide] = useState(0)
  const [launch, setLaunch] = useState<LaunchState | null>(null)
  const [docHidden, setDocHidden] = useState(false)
  const launchRef = useRef<LaunchState | null>(null)
  const launchTimerRef = useRef<number | undefined>(undefined)
  const [notice, setNotice] = useState<{ key: number; text: string } | null>(null)

  // Theme Management
  const [themeId, setThemeId] = useState<string>(BUILT_IN_THEMES[0].id)
  const [customThemes, setCustomThemes] = useState<ThemeConfig[]>([])
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState<ThemeConfig | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId),
    [profiles, activeProfileId],
  )
  const hiddenSet = useMemo(() => new Set(activeProfile?.hidden ?? []), [activeProfile?.hidden])
  const visibleContinueItems = useMemo(
    () => data.continueItems.filter((item) => !hiddenSet.has(item.id)),
    [data.continueItems, hiddenSet],
  )
  const continueItems = useMemo(
    () => visibleContinueItems.filter((item) => !isYouTubeItem(item)).slice(0, CONTINUE_LIMIT),
    [visibleContinueItems],
  )
  const allThemes = useMemo(() => [...BUILT_IN_THEMES, ...customThemes], [customThemes])
  const currentTheme = useMemo(
    () => allThemes.find((t) => t.id === themeId) || BUILT_IN_THEMES[0],
    [allThemes, themeId],
  )

  const currentThemeTokens = useMemo(() => resolveThemeTokens(currentTheme), [currentTheme])

  useEffect(() => {
    if (!ready || isThemeModalOpen || isCreateModalOpen) return
    const root = document.querySelector('main')
    applyThemeCssVariables(currentTheme, root)
  }, [ready, isThemeModalOpen, isCreateModalOpen, currentTheme])

  const persistActiveProfileTheme = (nextThemeId: string) => {
    const updated = profiles.map((profile) =>
      profile.id === activeProfileId ? { ...profile, themeId: nextThemeId } : profile,
    )
    setProfiles(updated)
    saveProfiles(updated, activeProfileId)
  }

  const handleSelectTheme = (theme: ThemeConfig) => {
    setThemeId(theme.id)
    setStoredThemeId(theme.id)
    persistActiveProfileTheme(theme.id)
    setNotice({ key: Date.now(), text: `Theme · ${theme.name}` })
  }

  const handleSaveCustomTheme = (newTheme: ThemeConfig) => {
    const updated = saveCustomThemeToStorage(newTheme)
    setCustomThemes(updated)
    setThemeId(newTheme.id)
    setStoredThemeId(newTheme.id)
    persistActiveProfileTheme(newTheme.id)
    setEditingTheme(null)
    setIsCreateModalOpen(false)
    setIsThemeModalOpen(false)
    setNotice({ key: Date.now(), text: `Custom theme applied · ${newTheme.name}` })
  }

  const handleDeleteCustomTheme = (id: string) => {
    const updated = deleteCustomThemeFromStorage(id)
    setCustomThemes(updated)
    const updatedProfiles = profiles.map((profile) =>
      profile.themeId === id ? { ...profile, themeId: BUILT_IN_THEMES[0].id } : profile,
    )
    if (updatedProfiles.some((profile, index) => profile !== profiles[index])) {
      setProfiles(updatedProfiles)
      saveProfiles(updatedProfiles, activeProfileId)
    }
    if (themeId === id) {
      setThemeId(BUILT_IN_THEMES[0].id)
      setStoredThemeId(BUILT_IN_THEMES[0].id)
    }
    setNotice({ key: Date.now(), text: 'Custom theme removed' })
  }

  const handleSwitchProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id)
    if (!profile) return
    setActiveProfileId(id)
    saveProfiles(profiles, id)
    setThemeId(profile.themeId)
    setStoredThemeId(profile.themeId)
  }

  const handleAddProfile = () => {
    const newProfile = createProfile(`Profile ${profiles.length + 1}`, profiles.length, themeId)
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    setActiveProfileId(newProfile.id)
    setThemeId(newProfile.themeId)
    setStoredThemeId(newProfile.themeId)
    saveProfiles(updated, newProfile.id)
  }

  const handleRenameProfile = (id: string, name: string) => {
    const updated = profiles.map((p) => (p.id === id ? { ...p, name } : p))
    setProfiles(updated)
    saveProfiles(updated, activeProfileId)
  }

  const handleUpdateProfileColor = (id: string, color: string) => {
    const updated = profiles.map((p) => (p.id === id ? { ...p, color } : p))
    setProfiles(updated)
    saveProfiles(updated, activeProfileId)
  }

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) return
    const updated = profiles.filter((p) => p.id !== id)
    const nextActive = activeProfileId === id ? updated[0]?.id ?? '' : activeProfileId
    setProfiles(updated)
    if (activeProfileId === id) {
      setActiveProfileId(nextActive)
      const nextProfile = updated.find((p) => p.id === nextActive)
      if (nextProfile) {
        setThemeId(nextProfile.themeId)
        setStoredThemeId(nextProfile.themeId)
      }
    }
    saveProfiles(updated, nextActive || activeProfileId)
  }

  const handleRestoreProfileHidden = (id: string) => {
    const updated = profiles.map((p) => (p.id === id ? { ...p, hidden: [] } : p))
    setProfiles(updated)
    saveProfiles(updated, activeProfileId)
  }

  const handleHideContinueItem = (id: string) => {
    const updated = profiles.map((profile) =>
      profile.id === activeProfileId && !profile.hidden.includes(id)
        ? { ...profile, hidden: [...profile.hidden, id] }
        : profile,
    )
    setProfiles(updated)
    saveProfiles(updated, activeProfileId)
    setIndices((prev) => ({ ...prev, continue: Math.max(0, prev.continue - 1) }))
    setNotice({ key: Date.now(), text: 'Removed from this profile’s Continue Watching' })
  }

  const appById = useMemo(() => {
    const map = new Map<string, LauncherApp>()
    for (const app of apps) if (!map.has(idOf(app))) map.set(idOf(app), app)
    return map
  }, [apps])
  const installedIds = useMemo(() => {
    const base = [...appById.keys()].filter((id) => !demoRemoved.includes(id))
    return [...base, ...demoAdded.filter((id) => !base.includes(id))]
  }, [appById, demoAdded, demoRemoved])
  const appsList = useMemo(() => {
    const visible = installedIds.filter((id) => !hidden.includes(id))
    const ordered = order.filter((id) => visible.includes(id))
    return [...ordered, ...visible.filter((id) => !ordered.includes(id))]
  }, [installedIds, hidden, order])
  const hiddenCount = installedIds.filter((id) => hidden.includes(id)).length
  const appInfo = useCallback(
    (id: string) => {
      const app = appById.get(id)
      const service = services[id]
      return {
        pkg: app?.pkg,
        name: app?.label ?? service?.name ?? id,
        icon: app?.icon ?? service?.logo,
        service: app?.service ?? (service && !service.native ? id : undefined),
      }
    },
    [appById],
  )

  const itemRefs = useRef<Record<Zone, (HTMLElement | null)[]>>({ nav: [], hero: [], continue: [], taste: [], appsControls: [], apps: [] })
  const refCallbacksRef = useRef<Record<Zone, Map<number, (el: HTMLElement | null) => void>>>({
    nav: new Map(),
    hero: new Map(),
    continue: new Map(),
    taste: new Map(),
    appsControls: new Map(),
    apps: new Map(),
  })
  const pressRef = useRef<{ handled: boolean; zone: Zone; index: number } | null>(null)
  const pressTimerRef = useRef<number | undefined>(undefined)
  const holdVisualTimerRef = useRef<number | undefined>(undefined)
  const pointerPressRef = useRef<{ index: number; handled: boolean } | null>(null)
  const pointerTimerRef = useRef<number | undefined>(undefined)
  const pointerVisualTimerRef = useRef<number | undefined>(undefined)
  const pointerReadyRef = useRef(true)
  const wheelLockRef = useRef(0)
  const stackRef = useRef<HTMLDivElement>(null)
  const continueSectionRef = useRef<HTMLElement>(null)
  const tasteSectionRef = useRef<HTMLElement>(null)
  const appsSectionRef = useRef<HTMLElement>(null)
  const appsShelfRef = useRef<HTMLUListElement>(null)

  const register = useCallback(
    (z: Zone) => (index: number) => {
      let cb = refCallbacksRef.current[z].get(index)
      if (!cb) {
        cb = (el: HTMLElement | null) => {
          itemRefs.current[z][index] = el
        }
        refCallbacksRef.current[z].set(index, cb)
      }
      return cb
    },
    [],
  )

  const focusItem = useCallback((z: Zone, index: number) => {
    setZone(z)
    setIndices((prev) => (prev[z] === index ? prev : { ...prev, [z]: index }))
  }, [])

  const changeSlide = useCallback(
    (delta: number) => {
      if (!heroSlides.length) return
      setSlide((s) => (s + delta + heroSlides.length) % heroSlides.length)
    },
    [heroSlides.length],
  )

  const startLaunch = useCallback((open: () => boolean, state: Omit<LaunchState, 'key'>) => {
    const next = { key: Date.now(), ...state }
    launchRef.current = next
    setLaunch(next)
    window.clearTimeout(launchTimerRef.current)
    launchTimerRef.current = window.setTimeout(() => {
      if (!open()) {
        launchRef.current = null
        setLaunch(null)
        setNotice({ key: Date.now(), text: `Couldn't open ${state.name}` })
      }
    }, LAUNCH_DELAY_MS)
  }, [])

  const moveApp = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= appsList.length || from === to) return
      const next = [...appsList]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      setOrder(next)
      writeList(ORDER_KEY, next)
      focusItem('apps', to)
    },
    [appsList, focusItem],
  )

  const resetApps = useCallback(() => {
    setOrder([])
    setHidden([])
    writeList(ORDER_KEY, [])
    writeList(HIDDEN_KEY, [])
    setOrganize(false)
    setMovingApp(false)
    setNotice({ key: Date.now(), text: 'Home row reset' })
  }, [])

  const toggleHomeRow = useCallback(
    (id: ServiceId) => {
      const adding = hidden.includes(id)
      const next = adding ? hidden.filter((h) => h !== id) : [...hidden, id]
      setHidden(next)
      writeList(HIDDEN_KEY, next)
      setNotice({ key: Date.now(), text: `${appInfo(id).name} ${adding ? 'added to' : 'removed from'} Home row` })
    },
    [appInfo, hidden],
  )

  const launchById = useCallback(
    (id: ServiceId) => {
      const info = appInfo(id)
      startLaunch(() => data.native ? Boolean(info.pkg && launchApp(info.pkg)) : true, { name: info.name, service: info.service, icon: info.icon, action: `Opening ${info.name}` })
    },
    [appInfo, data.native, startLaunch],
  )

  const installApp = useCallback(
    (id: ServiceId) => {
      if (data.native) {
        const pkg = PLAY_PACKAGES[id]
        const ok = pkg ? launchIntent(`intent://details?id=${pkg}#Intent;scheme=market;package=com.android.vending;end`) : false
        if (!ok) setNotice({ key: Date.now(), text: `Couldn't open the Play Store for ${services[id]?.name ?? id}` })
        return
      }
      setDemoAdded((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setDemoRemoved((prev) => prev.filter((r) => r !== id))
    },
    [data.native],
  )

  const uninstallApp = useCallback(
    (id: ServiceId) => {
      if (data.native) {
        const pkg = appById.get(id)?.pkg
        if (!pkg || !openAppInfo(pkg)) setNotice({ key: Date.now(), text: 'Could not open app uninstall settings' })
        return
      }
      setDemoRemoved((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setDemoAdded((prev) => prev.filter((a) => a !== id))
    },
    [appById, data.native],
  )

  const openAppsMenu = useCallback((tab: 'installed' | 'store' = 'installed') => {
    setAppsMenuTab(tab)
    setAppsMenuRowEdit(false)
    setIsAppsMenuOpen(true)
  }, [])
  const openRowEditor = useCallback(() => {
    setMovingApp(false)
    setAppsMenuTab('installed')
    setAppsMenuRowEdit(true)
    setIsAppsMenuOpen(true)
  }, [])

  const updateSettings = useCallback((next: LauncherSettings) => {
    setSettings(next)
    saveStoredSettings(next)
  }, [])

  const activate = useCallback(
    (z: Zone, index: number) => {
      if (z === 'nav') {
        const item = navItems[index]
        if (!item) return
        if (item.id === 'apps') {
          openAppsMenu()
        } else if (item.id === 'theme') {
          setIsThemeModalOpen(true)
        } else if (item.id === 'profile') {
          setIsProfileModalOpen(true)
        } else if (item.id === 'settings') {
          setIsSettingsOpen(true)
        } else if (item.id === 'surfshark') {
          setIsSurfsharkOpen(true)
        } else if (data.native) {
          openSystem('network')
        } else {
          setNotice({ key: Date.now(), text: 'Connected to Home-5G · 940 Mbps' })
        }
        return
      }
      if (z === 'hero') {
        const s = heroSlides[slide]
        if (!s) return
        startLaunch(() => data.native ? openItem(s.intentUri, s.pkg) : true, {
          name: s.appName ?? s.title,
          service: s.service,
          icon: s.appIcon,
          action: `Playing ${s.title}`,
        })
        return
      }
      if (z === 'continue') {
        const item = continueItems[index]
        if (!item) return
        startLaunch(() => data.native ? openItem(item.intentUri, item.pkg) : true, {
          name: item.appName ?? item.title,
          service: item.service,
          icon: item.appIcon,
          action: `${item.historyOnly ? 'Playing' : 'Resuming'} ${item.title}`,
        })
        return
      }
      if (z === 'taste') {
        const item = taste[index]
        if (!item) return
        startLaunch(() => (data.native && item.intentUri ? openItem(item.intentUri) : true), {
          name: tasteServiceName(item),
          service: item.service,
          action: `Playing ${item.title}`,
        })
        return
      }
      if (z === 'appsControls') {
        if (!organize) {
          setOrganize(true)
          setMovingApp(false)
          focusItem('apps', Math.min(indices.apps, Math.max(0, appsList.length - 1)))
        } else if (index === 0) {
          openRowEditor()
        } else if (data.native && index === 1) {
          const targetId = appsList[Math.min(indices.apps, Math.max(0, appsList.length - 1))]
          const pkg = targetId ? appInfo(targetId).pkg : undefined
          if (pkg && !openAppInfo(pkg)) setNotice({ key: Date.now(), text: 'Could not open app info' })
        } else if (index === (data.native ? 2 : 1)) {
          resetApps()
        } else {
          setOrganize(false)
          setMovingApp(false)
          focusItem('apps', indices.apps)
        }
        return
      }
      if (index >= appsList.length) {
        if (organize) {
          setOrganize(false)
          setMovingApp(false)
        }
        openAppsMenu()
        return
      }
      const id = appsList[index]
      if (!organize) launchById(id)
      else setMovingApp((moving) => !moving)
    },
    [appInfo, appsList, continueItems, data.native, focusItem, heroSlides, indices.apps, launchById, navItems, openAppsMenu, openRowEditor, organize, resetApps, slide, startLaunch],
  )

  const activateRef = useRef(activate)
  useEffect(() => {
    activateRef.current = activate
  })
  const registerNav = useMemo(() => register('nav'), [register])
  const registerHeroPlay = useMemo(() => register('hero')(0), [register])
  const registerContinue = useMemo(() => register('continue'), [register])
  const registerTaste = useMemo(() => register('taste'), [register])
  const registerAppsControls = useMemo(() => register('appsControls'), [register])
  const registerApps = useMemo(() => register('apps'), [register])
  const hoverNav = useCallback((i: number) => {
    if (pointerReadyRef.current) focusItem('nav', i)
  }, [focusItem])
  const hoverHero = useCallback(() => {
    if (pointerReadyRef.current) focusItem('hero', 0)
  }, [focusItem])
  const hoverContinue = useCallback((i: number) => {
    if (pointerReadyRef.current) focusItem('continue', i)
  }, [focusItem])
  const selectContinue = useCallback((i: number) => {
    focusItem('continue', i)
  }, [focusItem])
  const hoverTaste = useCallback((i: number) => {
    if (pointerReadyRef.current) focusItem('taste', i)
  }, [focusItem])
  const selectTaste = useCallback((i: number) => {
    focusItem('taste', i)
  }, [focusItem])
  const hoverAppsControl = useCallback((i: number) => {
    if (pointerReadyRef.current) focusItem('appsControls', i)
  }, [focusItem])
  const hoverApps = useCallback((i: number) => {
    if (pointerReadyRef.current) focusItem('apps', i)
  }, [focusItem])
  const activateNav = useCallback((i: number) => activateRef.current('nav', i), [])
  const playHero = useCallback(() => activateRef.current('hero', 0), [])
  const activateContinue = useCallback((i: number) => activateRef.current('continue', i), [])
  const activateTaste = useCallback((i: number) => activateRef.current('taste', i), [])
  const activateApps = useCallback((i: number) => activateRef.current('apps', i), [])
  const openAppsMenuDefault = useCallback(() => openAppsMenu(), [openAppsMenu])
  const dismissLaunch = useCallback(() => {
    window.clearTimeout(launchTimerRef.current)
    launchRef.current = null
    setLaunch(null)
  }, [])
  const setOrganizeMode = useCallback(
    (on: boolean) => {
      setOrganize(on)
      setMovingApp(false)
      setHoldingAppIndex(null)
      if (on) focusItem('apps', Math.min(indices.apps, Math.max(0, appsList.length - 1)))
    },
    [appsList.length, focusItem, indices.apps],
  )
  const openAppInfoAtIndex = useCallback(
    (idx: number) => {
      const targetId = appsList[idx]
      const pkg = targetId ? appInfo(targetId).pkg : undefined
      if (pkg && !openAppInfo(pkg)) setNotice({ key: Date.now(), text: 'Could not open app info' })
    },
    [appInfo, appsList],
  )
  const topHeaderItems = useMemo(
    () =>
      navItems.map((item) =>
        item.id === 'profile' ? { ...item, label: activeProfile?.name ?? item.label } : item,
      ),
    [navItems, activeProfile?.name],
  )

  const enterOrganizeAndPickApp = useCallback(
    (index: number) => {
      if (index < 0 || index >= appsList.length) return
      setHoldingAppIndex(null)
      setOrganize(true)
      setMovingApp(true)
      focusItem('apps', index)
    },
    [appsList.length, focusItem],
  )

  const clearPointerHold = useCallback(() => {
    window.clearTimeout(pointerTimerRef.current)
    window.clearTimeout(pointerVisualTimerRef.current)
    pointerPressRef.current = null
    setHoldingAppIndex(null)
  }, [])

  const handleTilePointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      focusItem('apps', index)
      if (organize || index >= appsList.length) {
        pointerPressRef.current = { index, handled: false }
        return
      }
      window.clearTimeout(pointerTimerRef.current)
      window.clearTimeout(pointerVisualTimerRef.current)
      pointerPressRef.current = { index, handled: false }
      pointerVisualTimerRef.current = window.setTimeout(() => {
        if (pointerPressRef.current && !pointerPressRef.current.handled) {
          setHoldingAppIndex(index)
        }
      }, HOLD_INDICATOR_MS)
      pointerTimerRef.current = window.setTimeout(() => {
        if (!pointerPressRef.current || pointerPressRef.current.handled) return
        pointerPressRef.current.handled = true
        enterOrganizeAndPickApp(index)
      }, LONG_PRESS_MS)
    },
    [appsList.length, enterOrganizeAndPickApp, focusItem, organize],
  )

  const handleTilePointerUp = useCallback(
    (index: number) => {
      const press = pointerPressRef.current
      clearPointerHold()
      if (!press || press.handled) return
      activateRef.current('apps', index)
    },
    [clearPointerHold],
  )

  const zoneCounts: Record<Zone, number> = {
    nav: navItems.length,
    hero: heroSlides.length ? 1 : 0,
    continue: continueItems.length,
    taste: taste.length,
    appsControls: organize ? (data.native ? 4 : 3) : 0,
    apps: appsList.length + 1,
  }
  const activeZones = ZONES.filter((z) => zoneCounts[z] > 0)
  // Where Back/Home returns to: the hero when there is one, otherwise the first shelf.
  const homeZone: Zone = heroSlides.length ? 'hero' : continueItems.length ? 'continue' : 'apps'

  const modalOpen = isThemeModalOpen || isCreateModalOpen || isProfileModalOpen || isSettingsOpen || isAppsMenuOpen || isSurfsharkOpen

  const triggerLongPress = useEffectEvent(() => {
    const press = pressRef.current
    window.clearTimeout(pressTimerRef.current)
    window.clearTimeout(holdVisualTimerRef.current)
    setHoldingAppIndex(null)
    if (!press || press.handled) return
    if (press.zone === 'apps' && !organize && press.index < appsList.length) {
      press.handled = true
      enterOrganizeAndPickApp(press.index)
      return
    }
    const pkg = press.zone === 'apps' && press.index < appsList.length ? appInfo(appsList[press.index] ?? '').pkg : undefined
    if (data.native && pkg) {
      press.handled = true
      openAppInfo(pkg)
    }
  })

  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'LauncherSettings') {
      event.preventDefault()
      setIsThemeModalOpen(false)
      setIsCreateModalOpen(false)
      setEditingTheme(null)
      setIsProfileModalOpen(false)
      setIsAppsMenuOpen(false)
      setIsSurfsharkOpen(false)
      setIsSettingsOpen(true)
      return
    }
    // Modals manage their own remote input.
    if (modalOpen) return

    const key = event.key
    const code = event.keyCode
    pointerReadyRef.current = false
    const isSelect = ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key) || code === 13 || code === 23 || code === 66
    const isBack = ['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key) || code === 27 || code === 8 || code === 4

    if (launch) {
      if (isBack || isSelect) {
        event.preventDefault()
        window.clearTimeout(launchTimerRef.current)
        launchRef.current = null
        setLaunch(null)
      }
      return
    }

    const isPlay =
      ['MediaPlayPause', 'Play', 'MediaPlay', 'MediaPause'].includes(key) || code === 179 || code === 85 || code === 126 || code === 127
    if (isPlay) {
      event.preventDefault()
      activate(zone, indices[zone])
      return
    }

    // Media next / previous step through the hero slides on TV remotes.
    if (code === 87 || key === 'MediaTrackNext') {
      event.preventDefault()
      changeSlide(1)
      return
    }
    if (code === 88 || key === 'MediaTrackPrevious') {
      event.preventDefault()
      changeSlide(-1)
      return
    }

    if (key === 't' || key === 'T') {
      event.preventDefault()
      setIsThemeModalOpen(true)
      return
    }
    if (key === 's' || key === 'S') {
      event.preventDefault()
      setIsSettingsOpen(true)
      return
    }
    if (key === 'a' || key === 'A') {
      event.preventDefault()
      openAppsMenu()
      return
    }

    const zoneIndex = activeZones.indexOf(zone)
    const isUp = key === 'ArrowUp' || code === 38 || code === 19
    const isDown = key === 'ArrowDown' || code === 40 || code === 20
    const isLeft = key === 'ArrowLeft' || code === 37 || code === 21
    const isRight = key === 'ArrowRight' || code === 39 || code === 22
    if (isUp || isDown) {
      event.preventDefault()
      if (movingApp) return
      const step = isUp ? -1 : 1
      setZone(activeZones[Math.min(activeZones.length - 1, Math.max(0, zoneIndex + step))])
    } else if (isLeft || isRight) {
      event.preventDefault()
      const delta = isLeft ? -1 : 1
      if (zone === 'hero') changeSlide(delta)
      else if (zone === 'continue' && continueItems.length > 0) {
        focusItem('continue', (indices.continue + delta + continueItems.length) % continueItems.length)
      } else if (zone === 'taste' && taste.length > 0) {
        focusItem('taste', (indices.taste + delta + taste.length) % taste.length)
      } else if (zone === 'apps' && organize && movingApp) moveApp(indices.apps, indices.apps + delta)
      else focusItem(zone, Math.min(zoneCounts[zone] - 1, Math.max(0, indices[zone] + delta)))
    } else if (isSelect) {
      event.preventDefault()
      // Activation happens on key-up so a long press enters Organize & Move mode on app tiles.
      // Ignore synthetic key repeat events if we already started timing, or trigger immediately if not handled.
      if (pressRef.current) {
        if (!event.repeat) triggerLongPress()
      } else {
        pressRef.current = { handled: false, zone, index: indices[zone] }
        if (zone === 'apps' && !organize && indices.apps < appsList.length) {
          window.clearTimeout(holdVisualTimerRef.current)
          holdVisualTimerRef.current = window.setTimeout(() => {
            if (pressRef.current && !pressRef.current.handled && pressRef.current.zone === 'apps') {
              setHoldingAppIndex(pressRef.current.index)
            }
          }, HOLD_INDICATOR_MS)
        }
        pressTimerRef.current = window.setTimeout(triggerLongPress, LONG_PRESS_MS)
      }
    } else if (key === 'ContextMenu' || key === 'i' || key === 'I') {
      // Menu toggles organize mode on apps and hides Continue Watching items for this profile.
      if (zone === 'apps') {
        event.preventDefault()
        if (indices.apps < appsList.length) {
          setOrganize((on) => !on)
          setMovingApp(false)
        }
      } else if (zone === 'continue' && continueItems[indices.continue]) {
        event.preventDefault()
        handleHideContinueItem(continueItems[indices.continue].id)
      }
    } else if (isBack) {
      event.preventDefault()
      if (movingApp || organize) {
        setMovingApp(false)
        setOrganize(false)
        focusItem('apps', Math.min(indices.apps, Math.max(0, appsList.length - 1)))
      }
    }
  })

  const handleKeyUp = useEffectEvent((event: KeyboardEvent) => {
    const isSelect = ['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(event.key) || event.keyCode === 13 || event.keyCode === 23 || event.keyCode === 66
    if (!isSelect) return
    const press = pressRef.current
    pressRef.current = null
    window.clearTimeout(pressTimerRef.current)
    window.clearTimeout(holdVisualTimerRef.current)
    setHoldingAppIndex(null)
    if (!press || press.handled || launch || modalOpen) return
    event.preventDefault()
    activate(press.zone, press.index)
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKey(event)
    const onKeyUp = (event: KeyboardEvent) => handleKeyUp(event)
    const onPointerMove = (event: MouseEvent) => {
      if (event.movementX || event.movementY) pointerReadyRef.current = true
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onPointerMove)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onPointerMove)
    }
  }, [])

  useEffect(() => {
    let volume = getNavigationSoundVolume()
    const update = () => { volume = getNavigationSoundVolume() }
    const sound = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = event.key
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) playNavigationSound('move', volume)
      else if (['Enter', ' ', 'Select', 'Ok', 'MediaSelect'].includes(key)) playNavigationSound('select', volume)
      else if (['Escape', 'Backspace', 'Back', 'GoBack', 'BrowserBack'].includes(key)) playNavigationSound('back', volume)
    }
    window.addEventListener('keydown', sound)
    window.addEventListener('launcher:sound-volume', update)
    return () => { window.removeEventListener('keydown', sound); window.removeEventListener('launcher:sound-volume', update) }
  }, [])

  const refreshData = useEffectEvent(() => {
    const next = { ...loadLauncherData() }
    next.apps = retainUnchangedItems(data.apps, next.apps, (item) => item.pkg)
    next.continueItems = retainUnchangedItems(data.continueItems, next.continueItems, (item) => item.id)
    next.slides = retainUnchangedItems(data.slides, next.slides, (item) => item.id)
    const focusedContinueId = continueItems[indices.continue]?.id
    const nextContinueItems = next.continueItems
      .filter((item) => !isYouTubeItem(item) && !hiddenSet.has(item.id))
      .slice(0, CONTINUE_LIMIT)
    const focusedContinueIndex = nextContinueItems.findIndex((item) => item.id === focusedContinueId)
    setData(next)
    setIndices((prev) => ({
      nav: Math.min(prev.nav, Math.max(0, next.nav.length - 1)),
      hero: prev.hero,
      continue: focusedContinueIndex >= 0 ? focusedContinueIndex : Math.min(prev.continue, Math.max(0, nextContinueItems.length - 1)),
      taste: prev.taste,
      appsControls: prev.appsControls,
      apps: Math.min(prev.apps, Math.max(0, next.apps.length)),
    }))
    setSlide((s) => (s < next.slides.length ? s : 0))
    // Recommendations follow the newest watch history; the cached deck is reused until the TTL expires.
    refreshTasteItems(next.continueItems).then((changed) => {
      if (changed) setTaste(tasteItemsForSession().slice(0, TASTE_LIMIT))
    })
    return next
  })

  // Initial load, then refresh when the shell reports installs/removals, new Watch Next data, or a Home press.
  useEffect(() => {
    setCustomThemes(getCustomThemes())
    setTaste(tasteItemsForSession().slice(0, TASTE_LIMIT))
    setSettings(getStoredSettings())
    setDeviceProfile(getDeviceProfile())
    setOrder(readList(ORDER_KEY))
    setHidden(readList(HIDDEN_KEY))
    const storedThemeId = getStoredThemeId()
    setThemeId(storedThemeId)
    const { profiles: loadedProfiles, activeId: loadedActiveId } = loadProfiles(storedThemeId)
    setProfiles(loadedProfiles)
    setActiveProfileId(loadedActiveId)
    const activeProfile = loadedProfiles.find((p) => p.id === loadedActiveId)
    if (activeProfile) {
      setThemeId(activeProfile.themeId)
      setStoredThemeId(activeProfile.themeId)
    }
    const initial = refreshData()
    setZone(initial.slides.length ? 'hero' : initial.continueItems.length ? 'continue' : 'apps')
    setReady(true)
    if (isNative()) {
      if (!hasWatchNextAccess()) requestWatchNextAccess()
      refreshTrendingSlides().then((changed) => {
        if (changed) refreshData()
      })
    }
    // WebView timers freeze while another app is in front, so the launch overlay must be dropped explicitly
    // or it would still be on screen when the user comes back.
    const dismissLaunch = (force: boolean) => {
      const current = launchRef.current
      if (current && (force || Date.now() - current.key >= LAUNCH_MS)) {
        window.clearTimeout(launchTimerRef.current)
        launchRef.current = null
        setLaunch(null)
      }
    }
    const onRefresh = () => {
      dismissLaunch(false)
      refreshData()
    }
    const onVisibility = () => {
      setDocHidden(document.hidden)
      if (document.hidden) {
        resetPress()
        dismissLaunch(true)
      } else {
        dismissLaunch(false)
      }
    }
    const onPageHide = () => dismissLaunch(true)
    const onRefreshFocus = () => dismissLaunch(true)
    const onResume = () => dismissLaunch(true)
    const resetPress = () => {
      pressRef.current = null
      pointerPressRef.current = null
      setHoldingAppIndex(null)
      window.clearTimeout(pressTimerRef.current)
      window.clearTimeout(holdVisualTimerRef.current)
      window.clearTimeout(pointerTimerRef.current)
      window.clearTimeout(pointerVisualTimerRef.current)
    }
    const onHome = () => {
      resetPress()
      setIsThemeModalOpen(false)
      setIsCreateModalOpen(false)
      setEditingTheme(null)
      setIsProfileModalOpen(false)
      setIsSettingsOpen(false)
      setIsAppsMenuOpen(false)
      setIsSurfsharkOpen(false)
      setOrganize(false)
      setMovingApp(false)
      window.clearTimeout(launchTimerRef.current)
      launchRef.current = null
      setLaunch(null)
      setSlide(0)
      const next = refreshData()
      setZone(next.slides.length ? 'hero' : next.continueItems.length ? 'continue' : 'apps')
    }
    window.addEventListener('launcher:refresh', onRefresh)
    window.addEventListener('launcher:resume', onResume)
    window.addEventListener('launcher:home', onHome)
    window.addEventListener('blur', resetPress)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('focus', onRefreshFocus)
    return () => {
      window.removeEventListener('launcher:refresh', onRefresh)
      window.removeEventListener('launcher:resume', onResume)
      window.removeEventListener('launcher:home', onHome)
      window.removeEventListener('blur', resetPress)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', onRefreshFocus)
      window.clearTimeout(launchTimerRef.current)
    }
  }, [])

  const focusedIndex = indices[zone]

  useEffect(() => {
    if (modalOpen) return
    const el = itemRefs.current[zone][focusedIndex]
    el?.focus({ preventScroll: true })

    const shelf = zone === 'apps' ? appsShelfRef.current : null
    if (shelf && el) {
      const item = (el.parentElement ?? el) as HTMLElement
      const padding = window.innerWidth * 0.05
      const left = item.offsetLeft
      const right = left + item.offsetWidth
      const visibleLeft = shelf.scrollLeft + padding
      const visibleRight = shelf.scrollLeft + shelf.clientWidth - padding
      if (left < visibleLeft) shelf.scrollLeft = Math.max(0, left - padding)
      else if (right > visibleRight) shelf.scrollLeft = right - shelf.clientWidth + padding
    }
  }, [zone, focusedIndex, modalOpen])

  // The stack only moves between shelves: a horizontal step inside a row cannot change that row's top
  // edge, so reading `offsetTop` (a forced layout) and rewriting the transform on every step was pure
  // wasted work on the A55.
  useEffect(() => {
    if (modalOpen) return
    const stack = stackRef.current
    if (!stack) return
    const section =
      zone === 'continue'
        ? continueSectionRef.current
        : zone === 'taste'
          ? tasteSectionRef.current
          : zone === 'apps' || zone === 'appsControls'
            ? appsSectionRef.current
            : null
    const anchorKey =
      zone === 'continue'
        ? 'continue'
        : zone === 'taste'
          ? 'taste'
          : 'apps'
    const offset =
      section && (zone === 'continue' || zone === 'taste' || zone === 'apps' || zone === 'appsControls')
        ? Math.max(0, section.offsetTop - window.innerHeight * SHELF_ANCHOR[anchorKey])
        : 0
    stack.style.transform = `translate3d(0, ${-offset}px, 0)`
  }, [zone, ready, appsList.length, continueItems.length, modalOpen])

  useEffect(() => {
    if (!settings.autoAdvanceHero || launch || heroSlides.length < 2 || zone === 'continue' || zone === 'taste' || zone === 'apps' || zone === 'appsControls' || modalOpen) return
    const id = window.setTimeout(() => changeSlide(1), SLIDE_MS)
    return () => window.clearTimeout(id)
  }, [slide, launch, changeSlide, heroSlides.length, zone, modalOpen, settings.autoAdvanceHero])

  useEffect(() => {
    launchRef.current = launch
    if (!launch) return
    const id = window.setTimeout(() => setLaunch(null), LAUNCH_MS)
    return () => window.clearTimeout(id)
  }, [launch])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(id)
  }, [notice])

  const activeZoneCount = zoneCounts[zone]
  const activeZoneIndex = indices[zone]

  // Keep focus on a zone that exists when data changes underneath it.
  useEffect(() => {
    if (!ready) return
    if (activeZoneCount === 0) setZone(homeZone)
    else if (activeZoneIndex >= activeZoneCount) {
      setIndices((prev) => ({ ...prev, [zone]: activeZoneCount - 1 }))
    }
    if (slide >= heroSlides.length && heroSlides.length) setSlide(0)
  }, [ready, zone, homeZone, activeZoneCount, activeZoneIndex, slide, heroSlides.length])

  const browsing = zone === 'continue' || zone === 'taste' || zone === 'apps' || zone === 'appsControls'
  // Nothing behind a modal, the launch overlay or a backgrounded window needs to keep animating.
  const animationsPaused = modalOpen || Boolean(launch) || docHidden

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (modalOpen || launch || movingApp) return
    if (Math.abs(e.deltaY) < 18) return
    const now = Date.now()
    if (now - wheelLockRef.current < 320) return
    wheelLockRef.current = now
    const currentIdx = activeZones.indexOf(zone)
    if (e.deltaY > 0) {
      const nextIdx = Math.min(activeZones.length - 1, currentIdx + 1)
      if (activeZones[nextIdx]) setZone(activeZones[nextIdx])
    } else {
      const minIdx = activeZones.includes(homeZone) ? activeZones.indexOf(homeZone) : 0
      const prevIdx = Math.max(minIdx, currentIdx - 1)
      if (activeZones[prevIdx]) setZone(activeZones[prevIdx])
    }
  }

  if (!ready) return <main className="h-dvh w-full bg-black" />
  const previewingTheme = isThemeModalOpen || isCreateModalOpen
  return (
    <main
      onWheel={handleWheel}
      className="relative h-dvh w-full select-none overflow-hidden text-white"
      data-quality={quality}
      style={
        previewingTheme
          ? { backgroundColor: 'var(--tv-bg, #000000)' }
          : {
              ...themeTokensToCssVars(currentThemeTokens),
              backgroundColor: currentThemeTokens.bg,
            }
      }
    >
      <HeroBackdrop
        slides={heroSlides}
        activeIndex={slide}
        dimmed={browsing}
        immersiveBackdrop={
          zone === 'taste'
            ? taste[Math.max(0, Math.min(taste.length - 1, indices.taste))]?.backdrop ??
              taste[Math.max(0, Math.min(taste.length - 1, indices.taste))]?.image ??
              null
            : null
        }
        paused={animationsPaused}
        kenBurns={settings.kenBurns}
        liveWallpaper={settings.liveWallpaper}
        quality={quality}
      />

      <TopHeader
        items={topHeaderItems}
        focusedIndex={zone === 'nav' ? focusedIndex : -1}
        registerRef={registerNav}
        onHover={hoverNav}
        onActivate={activateNav}
        activeThemeName={currentTheme.name}
        activeProfile={activeProfile}
        networkConnected={data.network.connected}
        clock24h={settings.clock24h}
        showWeather={settings.showWeather}
      />

      <div
        ref={stackRef}
        data-tv-paused={animationsPaused || undefined}
        className="relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      >
        <HeroInfo
          slides={heroSlides}
          activeIndex={slide}
          focused={zone === 'hero'}
          visible={!browsing}
          paused={Boolean(launch)}
          slideDuration={SLIDE_MS}
          playRef={registerHeroPlay}
          onHover={hoverHero}
          onPlay={playHero}
          onSelectSlide={setSlide}
        />

        <div className="flex flex-col gap-[6.8vh] pt-[4vh] pb-[14vh]">
          {continueItems.length > 0 && (
            <ContinueWatchingRow
              items={continueItems}
              activeIndex={indices.continue}
              rowFocused={zone === 'continue'}
              revealed={zone === 'continue' || zone === 'hero' || zone === 'taste'}
              sectionRef={continueSectionRef}
              registerRef={registerContinue}
              onSelect={selectContinue}
              onHover={hoverContinue}
              onActivate={activateContinue}
            />
          )}

          {taste.length > 0 && (
            <YourTasteRow
              items={taste}
              activeIndex={indices.taste}
              rowFocused={zone === 'taste'}
              revealed={zone === 'taste' || zone === 'apps' || zone === 'appsControls'}
              sectionRef={tasteSectionRef}
              registerRef={registerTaste}
              onSelect={selectTaste}
              onHover={hoverTaste}
              onActivate={activateTaste}
            />
          )}

          <AppsRow
            apps={appsList}
            organize={organize}
            movingApp={movingApp}
            holdingIndex={holdingAppIndex}
            rowActive={zone === 'apps'}
            isNativeAppInfoAvailable={data.native}
            onSetOrganize={setOrganizeMode}
            hiddenCount={hiddenCount}
            onOpenAppInfo={openAppInfoAtIndex}
            onResetApps={resetApps}
            onOpenAppsMenu={openAppsMenuDefault}
            onEditRow={openRowEditor}
            focusedIndex={zone === 'apps' ? focusedIndex : -1}
            focusedControl={zone === 'appsControls' ? focusedIndex : -1}
            registerControlRef={registerAppsControls}
            onControlHover={hoverAppsControl}
            sectionRef={appsSectionRef}
            shelfRef={appsShelfRef}
            registerRef={registerApps}
            onHover={hoverApps}
            onActivate={activateApps}
            onTilePointerDown={handleTilePointerDown}
            onTilePointerUp={handleTilePointerUp}
            onTilePointerCancel={clearPointerHold}
          />
        </div>
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[5vh] z-40 flex justify-center">
        {notice && (
          <p
            key={notice.key}
            className="rounded-full px-[1.5em] py-[0.65em] text-[clamp(12px,0.9vw,18px)] font-medium text-white animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              backgroundColor: currentThemeTokens.surfaceElevated,
              boxShadow: `inset 0 0 0 1px ${currentThemeTokens.glassBorder}, 0 12px 32px rgba(0,0,0,0.75), 0 0 24px ${currentThemeTokens.glow1}`,
            }}
          >
            {notice.text}
          </p>
        )}
      </div>

      {launch && <LaunchOverlay key={launch.key} launch={launch} currentTheme={currentTheme} onDismiss={dismissLaunch} />}

      {isProfileModalOpen && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          profiles={profiles}
          activeId={activeProfileId}
          themes={allThemes}
          currentTheme={currentTheme}
          onClose={() => setIsProfileModalOpen(false)}
          onSwitch={handleSwitchProfile}
          onAdd={handleAddProfile}
          onRename={handleRenameProfile}
          onUpdateColor={handleUpdateProfileColor}
          onDelete={handleDeleteProfile}
          onRestoreHidden={handleRestoreProfileHidden}
        />
      )}

      {isThemeModalOpen && (
        <ThemeModal
          isOpen={isThemeModalOpen}
          onClose={() => setIsThemeModalOpen(false)}
          currentThemeId={themeId}
          allThemes={allThemes}
          onSelectTheme={handleSelectTheme}
          onOpenCreateModal={() => {
            setEditingTheme(null)
            setIsThemeModalOpen(false)
            setIsCreateModalOpen(true)
          }}
          onEditCustomTheme={(theme) => {
            setEditingTheme(theme)
            setIsThemeModalOpen(false)
            setIsCreateModalOpen(true)
          }}
          onDeleteCustomTheme={handleDeleteCustomTheme}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          resolvedQuality={quality}
          detectedQuality={detectedQuality}
          onUpdateSettings={updateSettings}
          onResetApps={resetApps}
          installedAppsCount={installedIds.length}
          currentTheme={currentTheme}
          native={data.native}
          activeProfileName={activeProfile?.name}
          activeProfileColor={activeProfile?.color}
          onSelectProfile={() => {
            setIsSettingsOpen(false)
            setIsProfileModalOpen(true)
          }}
          onOpenThemes={() => {
            setIsSettingsOpen(false)
            setIsThemeModalOpen(true)
          }}
          onOpenSystemSettings={data.native ? () => openSystem('settings') : undefined}
          onOpenDisplaySettings={data.native ? () => {
            if (!openSystem('display')) setNotice({ key: Date.now(), text: 'Could not open display settings' })
          } : undefined}
          onOpenSoundSettings={data.native ? () => {
            if (!openSystem('sound')) setNotice({ key: Date.now(), text: 'Could not open sound settings' })
          } : undefined}
          onOpenAmlogicPictureSettings={data.native ? () => {
            if (!openSystem('amlogic')) setNotice({ key: Date.now(), text: 'Could not open Amlogic picture settings' })
          } : undefined}
          onOpenWifiSettings={data.native ? () => openSystem('wifi') : undefined}
          onOpenAccountSettings={data.native ? () => {
            if (!openSystem('accounts')) setNotice({ key: Date.now(), text: 'Could not open account settings' })
          } : undefined}
        />
      )}

      {isAppsMenuOpen && (
        <AppsMenuModal
          isOpen={isAppsMenuOpen}
          onClose={() => setIsAppsMenuOpen(false)}
          installedApps={installedIds}
          nativeApps={data.native ? appById : EMPTY_NATIVE_APPS}
          homeRowApps={appsList}
          onLaunchApp={(id) => {
            setIsAppsMenuOpen(false)
            launchById(id)
          }}
          onToggleHomeRow={toggleHomeRow}
          onInstallApp={installApp}
          onUninstallApp={uninstallApp}
          onSearchPlayStore={data.native ? (query) => {
            const opened = query
              ? launchIntent(`intent://search?q=${encodeURIComponent(query)}&c=apps#Intent;scheme=market;package=com.android.vending;end`)
              : launchApp('com.android.vending')
            if (!opened) setNotice({ key: Date.now(), text: 'Could not open Google Play search' })
          } : undefined}
          onOpenPlayListing={data.native ? (pkg) => {
            if (!launchIntent(`intent://details?id=${encodeURIComponent(pkg)}#Intent;scheme=market;package=com.android.vending;end`)) {
              setNotice({ key: Date.now(), text: 'Could not open this Google Play listing' })
            }
          } : undefined}
          initialTab={appsMenuTab}
          initialRowEdit={appsMenuRowEdit}
          currentTheme={currentTheme}
          simulateInstall={!data.native}
        />
      )}

      {isSurfsharkOpen && (
        <SurfsharkModal
          isOpen={isSurfsharkOpen}
          currentTheme={currentTheme}
          onClose={() => setIsSurfsharkOpen(false)}
          onOpen={() => {
            setIsSurfsharkOpen(false)
            const app = apps.find((candidate) => candidate.pkg === SURFSHARK_PACKAGE)
            if (app) launchById(idOf(app))
            else setNotice({ key: Date.now(), text: 'Surfshark is not installed' })
          }}
        />
      )}

      {isCreateModalOpen && (
        <ThemeCreator
          isOpen={isCreateModalOpen}
          onClose={() => {
            setEditingTheme(null)
            setIsCreateModalOpen(false)
            setIsThemeModalOpen(true)
          }}
          onSave={handleSaveCustomTheme}
          existingThemeCount={customThemes.length}
          currentTheme={currentTheme}
          editingTheme={editingTheme}
        />
      )}
    </main>
  )
}
