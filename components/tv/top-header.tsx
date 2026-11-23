'use client'

import { memo } from 'react'
import { CircleUserRound, LayoutGrid, Palette, Settings, Shield, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavItemId } from '@/lib/launcher-data'
import type { Profile } from '@/lib/profiles'
import { StatusClock } from './status-clock'

const icons: Record<NavItemId, LucideIcon> = {
  profile: CircleUserRound,
  theme: Palette,
  network: Wifi,
  settings: Settings,
  apps: LayoutGrid,
  surfshark: Shield,
}

type TopHeaderProps = {
  items: { id: NavItemId; label: string }[]
  focusedIndex: number
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
  activeThemeName?: string
  activeProfile?: Profile
  networkConnected?: boolean
  clock24h?: boolean
  showWeather?: boolean
}

export const TopHeader = memo(function TopHeader({
  items,
  focusedIndex,
  registerRef,
  onHover,
  onActivate,
  activeThemeName,
  activeProfile,
  networkConnected = true,
  clock24h,
  showWeather,
}: TopHeaderProps) {
  const accentColor = 'var(--tv-accent, #38bdf8)'
  const accentTextColor = 'var(--tv-accent-text, #000000)'

  const profileEntry = items
    .map((item, index) => ({ item, index }))
    .find(({ item }) => item.id === 'profile')
  const systemEntries = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.id !== 'profile')

  const pillSurfaceStyle = {
    backgroundColor: 'var(--tv-surface, rgba(10,11,16,0.86))',
    boxShadow: 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.14)), 0 10px 30px rgba(0,0,0,0.5)',
  }

  const tooltipClass =
    'pointer-events-none absolute left-1/2 top-full mt-[1.2vh] -translate-x-1/2 whitespace-nowrap rounded-full px-[0.95em] py-[0.38em] text-[clamp(12px,0.84vw,16px)] font-medium text-white transition-[opacity,transform] duration-200'

  const tooltipStyle = {
    backgroundColor: 'var(--tv-surface, rgba(10,11,16,0.92))',
    boxShadow:
      'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.16)), 0 8px 24px rgba(0,0,0,0.65), 0 0 16px var(--tv-glow, rgba(56,189,248,0.24))',
  }

  const renderSystemItem = ({ item, index }: { item: { id: NavItemId; label: string }; index: number }) => {
    const Icon = item.id === 'network' && !networkConnected ? WifiOff : icons[item.id]
    const focused = focusedIndex === index
    const labelText =
      item.id === 'theme' && activeThemeName
        ? `Theme · ${activeThemeName}`
        : item.id === 'network' && !networkConnected
          ? 'Offline · Network'
          : item.label

    const ariaLabel =
      item.id === 'theme'
        ? 'Change UI Theme'
        : item.id === 'network'
          ? networkConnected
            ? 'Network status: connected'
            : 'Network status: disconnected'
          : item.id === 'settings'
            ? 'Settings'
            : item.id === 'apps'
              ? 'Jump to My Apps'
              : 'Open Surfshark VPN'

    return (
      <li key={item.id} className="relative">
        <button
          ref={registerRef(index)}
          type="button"
          aria-label={ariaLabel}
          onMouseEnter={() => onHover(index)}
          onClick={() => onActivate(index)}
          className={cn(
            'relative grid size-[clamp(38px,2.85vw,56px)] place-items-center rounded-full text-white/85 outline-none focus:outline-none focus-visible:outline-none',
            'transition-[transform,background-color,color,box-shadow] duration-200 ease-out',
            focused ? 'scale-105' : 'hover:bg-white/10 hover:text-white',
          )}
          style={
            focused
              ? {
                  backgroundColor: accentColor,
                  color: accentTextColor,
                  boxShadow: '0 0 18px var(--tv-glow, rgba(56,189,248,0.35))',
                }
              : undefined
          }
        >
          <Icon
            className={cn(
              'size-[47%]',
              item.id === 'network' && !networkConnected && !focused && 'text-rose-400',
            )}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        <span
          aria-hidden="true"
          className={cn(tooltipClass, focused ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0')}
          style={tooltipStyle}
        >
          {labelText}
        </span>
      </li>
    )
  }

  const profileFocused = profileEntry ? focusedIndex === profileEntry.index : false
  const profileLabel = activeProfile?.name ?? profileEntry?.item.label ?? 'Profile'

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-end gap-[0.75vw] px-[5vw] pt-[3.4vh]">
      <nav aria-label="System" className="pointer-events-auto">
        <ul
          className="flex items-center gap-[0.34vw] rounded-full p-[clamp(4px,0.34vw,6px)]"
          style={pillSurfaceStyle}
        >
          {systemEntries.map(renderSystemItem)}
        </ul>
      </nav>

      {profileEntry && (
        <nav aria-label="Profile & Status" className="pointer-events-auto">
          <button
            ref={registerRef(profileEntry.index)}
            type="button"
            aria-label={`Switch profile (${profileLabel})`}
            onMouseEnter={() => onHover(profileEntry.index)}
            onClick={() => onActivate(profileEntry.index)}
            className="group flex items-center gap-[clamp(10px,0.85vw,16px)] rounded-full py-[clamp(4px,0.34vw,6px)] pl-[clamp(14px,1.1vw,22px)] pr-[clamp(4px,0.34vw,6px)] text-white outline-none focus:outline-none focus-visible:outline-none"
            style={pillSurfaceStyle}
          >
            <StatusClock clock24h={clock24h} showWeather={showWeather} embedded />
            <span className="relative grid size-[clamp(38px,2.85vw,56px)] shrink-0 place-items-center rounded-full">
              <span
                className={cn(
                  'grid size-full place-items-center rounded-full transition-[transform,background-color,color,box-shadow] duration-200 ease-out',
                  profileFocused
                    ? 'scale-105'
                    : 'scale-100 bg-white/[0.11] text-white/85 group-hover:bg-white/[0.16] group-hover:text-white',
                )}
                style={
                  profileFocused
                    ? {
                        backgroundColor: accentColor,
                        color: accentTextColor,
                        boxShadow: '0 0 18px var(--tv-glow, rgba(56,189,248,0.35))',
                      }
                    : undefined
                }
                aria-hidden="true"
              >
                {activeProfile ? (
                  <span className="text-[clamp(15px,1.12vw,21px)] font-bold leading-none">
                    {activeProfile.name.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <CircleUserRound className="size-[47%]" strokeWidth={1.75} />
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(tooltipClass, profileFocused ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0')}
                style={tooltipStyle}
              >
                {profileLabel}
              </span>
            </span>
          </button>
        </nav>
      )}
    </header>
  )
})
