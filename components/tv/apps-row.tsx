'use client'

import { memo, type PointerEvent, type Ref } from 'react'
import { motion } from 'motion/react'
import {
  Check,
  Info,
  LayoutGrid,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { services, type ServiceId } from '@/lib/launcher-data'
import { ServiceLogo } from './service-logo'

type AppsRowProps = {
  apps: ServiceId[]
  organize: boolean
  movingApp: boolean
  holdingIndex: number | null
  rowActive?: boolean
  isNativeAppInfoAvailable?: boolean
  onSetOrganize: (on: boolean) => void
  hiddenCount: number
  focusedIndex: number
  focusedControl: number
  registerControlRef: (index: number) => (el: HTMLElement | null) => void
  onControlHover: (index: number) => void
  sectionRef: Ref<HTMLElement>
  shelfRef: Ref<HTMLUListElement>
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
  onTilePointerDown?: (index: number, e: PointerEvent<HTMLButtonElement>) => void
  onTilePointerUp?: (index: number) => void
  onTilePointerCancel?: () => void
  onOpenAppInfo?: (index: number) => void
  onResetApps: () => void
  onOpenAppsMenu?: () => void
  onEditRow: () => void
}

export const AppsRow = memo(function AppsRow({
  apps,
  organize: isOrganizeMode,
  movingApp,
  holdingIndex,
  rowActive = false,
  isNativeAppInfoAvailable = false,
  onSetOrganize,
  hiddenCount,
  focusedIndex,
  focusedControl,
  registerControlRef,
  onControlHover,
  sectionRef,
  shelfRef,
  registerRef,
  onHover,
  onActivate,
  onTilePointerDown,
  onTilePointerUp,
  onTilePointerCancel,
  onOpenAppInfo,
  onResetApps,
  onOpenAppsMenu,
  onEditRow,
}: AppsRowProps) {
  const accentColor = 'var(--tv-accent, #38bdf8)'
  const accentTextColor = 'var(--tv-accent-text, #000000)'

  const focusedControlStyle = {
    backgroundColor: accentColor,
    color: accentTextColor,
    boxShadow: '0 0 18px var(--tv-glow, rgba(56,189,248,0.28))',
  }
  const idleControlStyle = {
    backgroundColor: 'var(--tv-surface, rgba(10,11,16,0.78))',
    boxShadow: 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.16))',
  }
  const controlButtonClass =
    'flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-[1em] py-[0.38em] text-[clamp(11px,0.76vw,15px)] font-medium text-white/85 outline-none transition-all hover:text-white'

  let controlSlot = 0

  return (
    <motion.section
      ref={sectionRef}
      aria-labelledby="apps-heading"
      initial={{ opacity: 0, y: 24 }}
      animate={{
        opacity: rowActive || isOrganizeMode ? 1 : 0.85,
        y: 0,
      }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-[3.5vh] min-h-dvh pt-[2vh]"
    >
      {/* Row Header */}
      <div className="flex items-center justify-between gap-4 px-[5vw]">
        <div className="flex items-baseline gap-[0.9vw]">
          <h2
            id="apps-heading"
            className="text-[clamp(14px,1.1vw,22px)] font-semibold tracking-tight text-white/85"
          >
            My Apps
          </h2>
          <span
            className="text-[clamp(11px,0.78vw,15px)] font-medium tabular-nums"
            style={{ color: accentColor }}
          >
            {apps.length}
          </span>
        </div>

        {/* Active Organize Controls (entered via long-press / hold or menu key) */}
        {isOrganizeMode && (
          <div className="flex items-center gap-[0.7vw]">
            <button
              ref={registerControlRef(controlSlot)}
              onMouseEnter={() => onControlHover(0)}
              type="button"
              onClick={onEditRow}
              aria-label="Add or remove apps from Home row"
              className={controlButtonClass}
              style={focusedControl === 0 ? focusedControlStyle : idleControlStyle}
            >
              <LayoutGrid className="size-[1.05em]" />
              <span>Add / Remove{hiddenCount > 0 ? ` (${hiddenCount})` : ''}</span>
            </button>

            {isNativeAppInfoAvailable && onOpenAppInfo && (
              <button
                ref={registerControlRef(++controlSlot)}
                onMouseEnter={() => onControlHover(1)}
                type="button"
                onClick={() => onOpenAppInfo(Math.max(0, Math.min(apps.length - 1, focusedIndex)))}
                aria-label="Open Android App Info"
                className={controlButtonClass}
                style={focusedControl === 1 ? focusedControlStyle : idleControlStyle}
              >
                <Info className="size-[1.05em]" />
                <span>App Info</span>
              </button>
            )}

            {(() => {
              const resetIdx = ++controlSlot
              return (
                <button
                  ref={registerControlRef(resetIdx)}
                  onMouseEnter={() => onControlHover(resetIdx)}
                  type="button"
                  onClick={onResetApps}
                  aria-label="Reset apps to default order"
                  className={controlButtonClass}
                  style={focusedControl === resetIdx ? focusedControlStyle : idleControlStyle}
                >
                  <RotateCcw className="size-[1.05em]" />
                  <span>Reset</span>
                </button>
              )
            })()}

            {(() => {
              const doneIdx = ++controlSlot
              return (
                <button
                  ref={registerControlRef(doneIdx)}
                  onMouseEnter={() => onControlHover(doneIdx)}
                  type="button"
                  onClick={() => onSetOrganize(false)}
                  aria-label="Finish organizing"
                  className={cn(controlButtonClass, 'px-[1.15em] text-white')}
                  style={focusedControl === doneIdx ? focusedControlStyle : idleControlStyle}
                >
                  <Check className="size-[1.05em] stroke-[2.5]" />
                  <span>Done</span>
                </button>
              )
            })()}
          </div>
        )}
      </div>

      {/* Main Apps Shelf */}
      <ul
        ref={shelfRef}
        className="no-scrollbar relative flex gap-[2.4vw] overflow-x-auto px-[5vw] pb-[6vh] pt-[3vh]"
      >
        {apps.map((id, index) => {
          const focused = focusedIndex === index
          const isHolding = holdingIndex === index
          const isLifted = isOrganizeMode && focused && movingApp
          const service = services[id]
          if (!service) return null

          return (
            <li key={id} className="relative shrink-0 flex flex-col items-center">
              {/* Main App Launch Tile */}
              <button
                ref={registerRef(index)}
                type="button"
                onMouseEnter={() => onHover(index)}
                onPointerDown={(e) => onTilePointerDown?.(index, e)}
                onPointerUp={() => onTilePointerUp?.(index)}
                onPointerLeave={() => onTilePointerCancel?.()}
                onPointerCancel={() => onTilePointerCancel?.()}
                onClick={(e) => {
                  if (e.detail === 0) return
                  onActivate(index)
                }}
                aria-label={
                  isOrganizeMode
                    ? `${isLifted ? 'Place' : 'Move'} ${service.name}`
                    : `Open ${service.name}`
                }
                className="flex w-[clamp(110px,9.5vw,210px)] flex-col items-center outline-none"
              >
                <span
                  className={cn(
                    'relative flex aspect-[16/10] w-full items-center justify-center rounded-[clamp(12px,1vw,22px)] isolate transition-transform duration-150 ease-out',
                    isLifted
                      ? 'z-20 animate-tv-tile-float'
                      : isHolding
                        ? 'z-10 scale-96'
                        : focused
                          ? 'z-10 scale-[1.06]'
                          : isOrganizeMode
                            ? 'scale-96 opacity-75'
                            : 'scale-100',
                  )}
                >
                  {(focused || isHolding) && (
                    <span
                      aria-hidden="true"
                      className="tv-halo-glow z-0"
                      style={{ '--tv-halo-spread': '-2px', '--tv-halo-blur': '9px' } as React.CSSProperties}
                    />
                  )}
                  {/* Static 1.5px gradient edge, sibling of the clipped surface. */}
                  {(focused || isHolding) && (
                    <span
                      aria-hidden="true"
                      className="tv-conic-border"
                      style={{ borderRadius: 'clamp(12px,1vw,22px)' } as React.CSSProperties}
                    />
                  )}
                  <span
                    className="relative z-10 flex size-full items-center justify-center overflow-hidden rounded-[inherit]"
                    style={{
                      backgroundColor:
                        focused || isHolding
                          ? 'var(--tv-surface, rgba(12, 13, 18, 0.96))'
                          : 'var(--tv-glass, rgba(255,255,255,0.06))',
                      boxShadow:
                        focused || isHolding
                          ? 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.24)), 0 18px 40px -10px rgba(0,0,0,0.88)'
                          : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.12))',
                    }}
                  >
                    <ServiceLogo
                      id={id}
                      className={cn(
                        'relative z-10',
                        service.native
                          ? 'size-full rounded-[inherit] object-cover transition-opacity duration-200'
                          : 'h-[40%] w-[60%] transition-opacity duration-200',
                        focused ? 'opacity-100' : 'opacity-85',
                      )}
                    />
                    {/* Hold-to-organize progress bar */}
                    {isHolding && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[3px] origin-left overflow-hidden animate-slide-progress"
                        style={{ animationDuration: '500ms' }}
                      >
                        <span className="tv-flow-track" />
                      </span>
                    )}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-[1.4vh] max-w-full truncate text-[clamp(11px,0.8vw,16px)] font-medium transition-[opacity,color] duration-200',
                    focused ? 'opacity-100' : 'opacity-55',
                  )}
                  style={focused ? { color: accentColor } : { color: '#ffffff' }}
                >
                  {service.name}
                </span>
              </button>
            </li>
          )
        })}

        {/* All Apps Shelf Tile */}
        <li className="shrink-0 flex flex-col items-center">
          {(() => {
            const isAllAppsFocused = focusedIndex === apps.length

            return (
              <button
                ref={registerRef(apps.length)}
                type="button"
                onMouseEnter={() => onHover(apps.length)}
                onClick={() => onOpenAppsMenu?.()}
                aria-label="Open All Apps library"
                className="group flex w-[clamp(110px,9.5vw,210px)] flex-col items-center outline-none"
              >
                <span
                  className={cn(
                    'relative flex aspect-[16/10] w-full rounded-[clamp(12px,1vw,22px)] isolate transition-transform duration-150 ease-out',
                    isAllAppsFocused ? 'z-10 scale-[1.06]' : 'scale-100 group-hover:scale-102',
                  )}
                >
                  {isAllAppsFocused && (
                    <span
                      aria-hidden="true"
                      className="tv-halo-glow z-0"
                      style={{ '--tv-halo-spread': '-2px', '--tv-halo-blur': '9px' } as React.CSSProperties}
                    />
                  )}
                  {isAllAppsFocused && (
                    <span
                      aria-hidden="true"
                      className="tv-conic-border"
                      style={{ borderRadius: 'clamp(12px,1vw,22px)' } as React.CSSProperties}
                    />
                  )}
                  <span
                    className="relative z-10 flex size-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[inherit]"
                    style={{
                      backgroundColor: isAllAppsFocused
                        ? 'var(--tv-surface, rgba(12, 13, 18, 0.96))'
                        : 'var(--tv-glass, rgba(255,255,255,0.06))',
                      boxShadow: isAllAppsFocused
                        ? 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.24)), 0 18px 40px -10px rgba(0,0,0,0.88)'
                        : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.12))',
                    }}
                  >
                    <div
                      className={cn(
                        'relative z-10 grid size-7 place-items-center rounded-lg transition-colors duration-150',
                        isAllAppsFocused ? '' : 'bg-white/10 group-hover:bg-white/15',
                      )}
                      style={{
                        backgroundColor: isAllAppsFocused ? accentColor : undefined,
                        color: isAllAppsFocused ? accentTextColor : accentColor,
                      }}
                    >
                      <LayoutGrid className="size-4 stroke-[2]" />
                    </div>
                    <span
                      className="relative z-10 text-[clamp(10px,0.72vw,13px)] font-medium tracking-tight text-white/90"
                      style={isAllAppsFocused ? { color: accentColor } : undefined}
                    >
                      All Apps
                    </span>
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-[1.4vh] text-[clamp(11px,0.8vw,16px)] font-medium transition-[opacity,color] duration-200',
                    isAllAppsFocused ? 'opacity-100' : 'opacity-55',
                  )}
                  style={isAllAppsFocused ? { color: accentColor } : { color: '#ffffff' }}
                >
                  App Library
                </span>
              </button>
            )
          })()}
        </li>
      </ul>
    </motion.section>
  )
})
