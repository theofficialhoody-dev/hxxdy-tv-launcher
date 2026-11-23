'use client'

import Image from 'next/image'
import { Play, Star } from 'lucide-react'
import { memo, useEffect, type Ref } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn, signedOffset } from '@/lib/utils'
import { services, type TasteItem } from '@/lib/launcher-data'
import { ServiceLogo } from './service-logo'
import { TitleLockup } from './title-lockup'
import { FlowFill } from './flow-fill'

type YourTasteRowProps = {
  items: TasteItem[]
  activeIndex: number
  rowFocused: boolean
  revealed?: boolean
  sectionRef: Ref<HTMLElement>
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onSelect: (index: number) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
}

type TasteCardProps = {
  item: TasteItem
  index: number
  offset: number
  rowFocused: boolean
  revealed: boolean
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onSelect: (index: number) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
}

/**
 * HeroBackdrop swaps the immersive full-screen art on every press, so the deck's own artwork is decoded
 * in advance: the cross-fade then always has the next frame ready and never shows the black base.
 */
const preloadedArtwork = new Map<string, HTMLImageElement>()

function preloadArtwork(items: TasteItem[]) {
  if (typeof window === 'undefined') return
  const keep = new Set<string>()
  for (const item of items) {
    for (const src of [item.backdrop, item.image]) {
      if (!src) continue
      keep.add(src)
      if (preloadedArtwork.has(src)) continue
      const image = new window.Image()
      image.decoding = 'async'
      image.src = src
      preloadedArtwork.set(src, image)
    }
  }
  // The deck is capped at six picks, so frames from a previous deck are dropped instead of holding
  // every artwork the session ever decoded (2 GB box).
  for (const src of preloadedArtwork.keys()) if (!keep.has(src)) preloadedArtwork.delete(src)
}

/** Provider mark: a catalogue brand when the pick has one, otherwise a native app's own icon. */
function TasteServiceMark({ item, className }: { item: TasteItem; className?: string }) {
  return (
    <ServiceLogo
      id={item.serviceIcon ? undefined : item.service}
      icon={item.serviceIcon}
      className={className}
    />
  )
}

const TasteDeckCard = memo(function TasteDeckCard({
  item,
  index,
  offset,
  rowFocused,
  revealed,
  registerRef,
  onSelect,
  onHover,
  onActivate,
}: TasteCardProps) {
  const abs = Math.abs(offset)
  // Seven cards: centre, ±1, ±2 and ±3. The outer pair rides the same spring to `opacity: 0`, so a card
  // enters and leaves the visible arc by gliding instead of popping in at ±2.
  if (abs > 3) return null

  const isCenter = offset === 0
  const isLeft = offset < 0
  const focused = isCenter && rowFocused
  const serviceName = (item.service && services[item.service]?.name) || 'Stream'

  const strideMap: Record<number, number> = revealed
    ? { 0: 0, 1: 103, 2: 204, 3: 306 }
    : { 0: 0, 1: 82, 2: 164, 3: 248 }

  const sign = offset === 0 ? 0 : offset < 0 ? -1 : 1
  const xPercent = `${sign * (strideMap[abs] ?? 306)}%`

  const rotateYMap: Record<number, number> = { 0: 0, 1: 16, 2: 28, 3: 36 }
  const rotateY = offset === 0 ? 0 : offset < 0 ? rotateYMap[abs] ?? 36 : -(rotateYMap[abs] ?? 36)

  const transformOrigin = offset === 0 ? '50% 50%' : isLeft ? '100% 50%' : '0% 50%'
  const scale = isCenter ? (focused ? 1.05 : 1.02) : 0.96
  const opacity = abs === 0 ? 1 : abs === 1 ? (revealed ? 0.96 : 0.7) : abs === 2 ? (revealed ? 0.9 : 0.45) : 0
  const zIndex = abs === 0 ? 30 : abs === 1 ? 20 : abs === 2 ? 10 : 1

  return (
    <motion.div
      initial={{
        x: xPercent,
        rotateY,
        scale: scale * 0.95,
        opacity: 0,
      }}
      animate={{
        x: xPercent,
        y: revealed ? 0 : 10,
        rotateY,
        scale,
        opacity,
      }}
      transition={{
        type: 'spring',
        stiffness: 215,
        damping: 25,
        mass: 0.92,
      }}
      style={{ zIndex, transformOrigin }}
      // Only the two cards that move during a step are promoted, and only while this deck is focused:
      // the ±2/±3 pair never animates in place, so promoting it just pinned layers in Graphics memory.
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        rowFocused && abs <= 1 && 'will-change-transform',
        abs > 2 && 'pointer-events-none',
      )}
    >
      <button
        ref={registerRef(index)}
        type="button"
        tabIndex={isCenter ? 0 : -1}
        onMouseEnter={() => {
          if (isCenter) onHover(index)
        }}
        onClick={() => {
          if (isCenter) onActivate(index)
          else onSelect(index)
        }}
        aria-label={
          isCenter
            ? `Play ${item.title} (${item.genre}, ${item.year}) on ${serviceName}`
            : `Select ${item.title}`
        }
        className="group relative block w-[clamp(145px,20.2vw,340px)] text-left outline-none"
      >
        {/* This card's box never changes size (fixed aspect-[3/4] width), so the deck only animates GPU
            transforms and the 13px bloom can sweep continuously at full fidelity, as in the reference. */}
        {focused && (
          <span
            aria-hidden="true"
            className="tv-halo-glow z-0"
            style={
              {
                                  '--tv-halo-spread': '-3px',
                  '--tv-halo-blur': '8px',
                borderRadius: 'clamp(16px,1.5vw,26px)',
              } as React.CSSProperties
            }
          />
        )}
        {/* Static 1.5px gradient edge, sibling of the clipped surface, so it tracks scale and tilt. */}
        {focused && (
          <span
            aria-hidden="true"
            className="tv-conic-border"
            style={{ borderRadius: 'clamp(16px,1.5vw,26px)' } as React.CSSProperties}
          />
        )}
        <div
          className="relative z-10 aspect-[3/4] w-full overflow-hidden rounded-[clamp(16px,1.5vw,26px)] isolate"
          style={{
            transform: 'translateZ(0)',
            backgroundColor: 'var(--tv-bg, #0a0a0a)',
            boxShadow: focused
              ? 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.24)), 0 26px 54px -12px rgba(0,0,0,0.95)'
              : isCenter
                ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.2)), 0 22px 48px -12px rgba(0,0,0,0.9)'
                : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.12)), 0 14px 32px -10px rgba(0,0,0,0.78)',
          }}
        >
          <Image
            src={item.image || '/placeholder.svg'}
            alt={item.title}
            fill
            sizes="(min-width: 1024px) 21vw, 220px"
            referrerPolicy="no-referrer"
            className={cn(
              'object-cover transition-transform duration-500 ease-out',
              focused ? 'scale-[1.05]' : 'scale-100',
              !isCenter && 'brightness-[0.88] group-hover:brightness-100',
            )}
          />

          {/* Breathable Apple TV 4K / Google TV Vignette */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 transition-opacity duration-300',
              isCenter
                ? 'bg-gradient-to-t from-black/86 via-black/18 to-black/16 opacity-100'
                : 'bg-gradient-to-t from-black/68 via-transparent to-black/12 opacity-90',
            )}
          />

          {/* Quiet Service Attribution across Visible Posters (top-left on full cards, inner corner on outer cards) */}
          {isCenter ? (
            <div className="pointer-events-none absolute left-[clamp(12px,1.15vw,20px)] top-[clamp(12px,1.15vw,20px)] z-10">
              <TasteServiceMark
                item={item}
                className="h-[clamp(13px,1.15vw,20px)] w-auto max-w-[clamp(44px,3.8vw,68px)] opacity-92 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
              />
            </div>
          ) : abs === 1 ? (
            <div className="pointer-events-none absolute left-[clamp(10px,1vw,18px)] top-[clamp(10px,1vw,18px)] z-10">
              <TasteServiceMark
                item={item}
                className="h-[clamp(11px,0.98vw,17px)] w-auto max-w-[clamp(36px,3.2vw,56px)] opacity-80"
              />
            </div>
          ) : (
            <div
              className={cn(
                'pointer-events-none absolute top-[clamp(10px,1vw,18px)] z-10',
                isLeft ? 'right-[clamp(10px,0.95vw,16px)]' : 'left-[clamp(10px,0.95vw,16px)]',
              )}
            >
              <TasteServiceMark
                item={item}
                className="h-[clamp(10px,0.86vw,15px)] w-auto max-w-[clamp(32px,2.8vw,48px)] opacity-75"
              />
            </div>
          )}

          {/* Center Play Control matching Continue Watching: static ring only, the bloom is the card's. */}
          {isCenter && (
            <div
              className={cn(
                'pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-250 ease-out',
                focused ? 'scale-105 opacity-100' : 'scale-95 opacity-80 group-hover:scale-100 group-hover:opacity-100',
              )}
            >
              <div className="relative size-[clamp(36px,2.75vw,50px)] rounded-full isolate">
                {/* Same pattern as the hero Play pill: hairline behind, opaque pill on top. */}
                {focused && (
                  <span
                    aria-hidden="true"
                    className="tv-conic-border"
                    style={{ borderRadius: '9999px' } as React.CSSProperties}
                  />
                )}
                <div
                  className="relative z-10 flex size-full items-center justify-center rounded-full shadow-[0_12px_28px_rgba(0,0,0,0.75)]"
                  style={{
                    // Same opaque surface + accent bloom as the hero Play pill.
                    background: focused
                      ? 'radial-gradient(circle at 30% 25%, var(--tv-glow, rgba(56,189,248,0.22)), transparent 72%), var(--tv-surface, rgba(10,11,16,0.96))'
                      : 'rgba(0,0,0,0.62)',
                    boxShadow: focused ? undefined : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.24))',
                  }}
                >
                  <Play
                    className={cn(
                      'relative z-20 size-[44%] translate-x-[1px] fill-white text-white',
                      focused && 'drop-shadow-[0_0_8px_var(--tv-accent,rgba(56,189,248,0.85))]',
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Apple TV / Google TV Official Title Lockup across Visible Cards */}
          {abs <= 1 ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-[11%] bottom-[clamp(14px,1.5vw,26px)] z-10 flex items-end justify-center transition-transform duration-300',
                isCenter ? 'h-[clamp(36px,4.1vw,68px)] scale-100' : 'h-[clamp(28px,3.1vw,50px)] scale-95',
              )}
            >
              <TitleLockup
                title={item.title}
                logo={item.logo}
                logoIsAlpha={item.logoIsAlpha}
                align="center"
                className={cn('transition-opacity duration-300', isCenter ? 'opacity-100 brightness-110' : 'opacity-82')}
                fallbackClassName={
                  isCenter ? 'text-[clamp(14px,1.25vw,22px)]' : 'text-[clamp(11px,0.95vw,17px)] opacity-85'
                }
              />
            </div>
          ) : (
            <div
              className={cn(
                'pointer-events-none absolute bottom-[clamp(12px,1.2vw,20px)] z-10 flex h-[clamp(18px,1.9vw,30px)] w-[36%] items-end',
                isLeft ? 'right-[clamp(10px,0.95vw,16px)] justify-end' : 'left-[clamp(10px,0.95vw,16px)] justify-start',
              )}
            >
              <TitleLockup
                title={item.title}
                logo={item.logo}
                logoIsAlpha={item.logoIsAlpha}
                align={isLeft ? 'right' : 'left'}
                className="opacity-78"
                fallbackClassName="truncate text-[clamp(10px,0.8vw,14px)] opacity-80"
              />
            </div>
          )}

        </div>
      </button>
    </motion.div>
  )
})

function YourTasteRowBase({
  items,
  activeIndex,
  rowFocused,
  revealed = true,
  sectionRef,
  registerRef,
  onSelect,
  onHover,
  onActivate,
}: YourTasteRowProps) {
  const safeIndex = Math.max(0, Math.min(items.length - 1, activeIndex))
  const activeItem = items[safeIndex]

  // Decode the whole deck up front so D-pad presses only ever cross-fade cached frames.
  useEffect(() => {
    preloadArtwork(items)
  }, [items])

  const activeServiceName = activeItem ? (activeItem.service && services[activeItem.service]?.name) || 'Stream' : ''

  return (
    <motion.section
      ref={sectionRef}
      aria-labelledby="your-taste-heading"
      initial={{ opacity: 0, y: 24 }}
      animate={{
        opacity: revealed ? 1 : 0.72,
        y: revealed ? 0 : 12,
      }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-h-dvh w-full overflow-x-clip py-[1.2vh]"
    >
      {/* Clean Anchored Section Header (matches Continue Watching rhythm, separated cleanly from card deck) */}
      <div className="relative z-10 mb-[3vh] px-[5vw] text-center">
        <h2
          id="your-taste-heading"
          className="text-[clamp(18px,1.55vw,30px)] font-semibold tracking-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]"
        >
          Your Taste
        </h2>
        <p className="mt-0.5 text-[clamp(11px,0.8vw,15px)] text-white/55">
          {rowFocused
            ? `Curated picks matched to what you watch · ${safeIndex + 1} / ${items.length}`
            : 'Curated picks matched to what you watch'}
        </p>
      </div>

      {/* Edge-to-Edge 5-Card 3D Concave Cylindrical Panoramic Stage */}
      <div
        className="relative z-10 mx-auto h-[clamp(206px,28.5vw,470px)] w-full overflow-visible"
        style={{ perspective: '950px', perspectiveOrigin: '50% 50%' }}
      >
        {items.map((item, index) => (
          <TasteDeckCard
            key={item.id}
            item={item}
            index={index}
            offset={signedOffset(index, safeIndex, items.length)}
            rowFocused={rowFocused}
            revealed={revealed}
            registerRef={registerRef}
            onSelect={onSelect}
            onHover={onHover}
            onActivate={onActivate}
          />
        ))}
      </div>

      {/* Minimal Dot Indicators synced with Theme Studio FlowFill */}
      {items.length > 1 && (
        <div className="relative z-10 mt-[2vh] flex items-center justify-center gap-1.5" aria-hidden="true">
          {items.map((item, idx) => {
            const active = idx === safeIndex
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={-1}
                onClick={() => onSelect(idx)}
                className={cn(
                  'relative h-[clamp(4px,0.3vw,6px)] overflow-hidden rounded-full transition-all duration-300',
                  active ? 'w-[clamp(22px,1.8vw,34px)]' : 'w-[clamp(5px,0.38vw,7px)] bg-white/25 hover:bg-white/45',
                )}
              >
                {active && <FlowFill active={rowFocused} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Dedicated Immersive List Spotlight Pedestal directly beneath the selected card */}
      <div className="relative z-10 mt-[2.4vh] min-h-[clamp(104px,12.5vh,148px)] px-[5vw] text-center">
        {rowFocused && activeItem && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto flex max-w-[clamp(480px,62vw,880px)] flex-col items-center"
            >
              {/* Dominant Card Display Title */}
              <h3 className="text-balance text-[clamp(24px,2.25vw,40px)] font-bold leading-[1.08] tracking-[-0.02em] text-white [text-shadow:0_4px_20px_rgba(0,0,0,0.92)]">
                {activeItem.title}
              </h3>

              {/* Crisp Unboxed Service + Metadata Strip */}
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[clamp(11.5px,0.85vw,15px)] font-medium text-white/78 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
                <span className="inline-flex items-center gap-1.5 text-white/92">
                  <TasteServiceMark
                    item={activeItem}
                    className="h-[clamp(11px,0.88vw,15px)] w-auto max-w-[clamp(34px,2.8vw,48px)]"
                  />
                  <span>{activeServiceName}</span>
                </span>
                <span className="text-white/35" aria-hidden="true">·</span>
                <span className="tabular-nums">{activeItem.year}</span>
                <span className="text-white/35" aria-hidden="true">·</span>
                <span>{activeItem.genre}</span>
                <span className="text-white/35" aria-hidden="true">·</span>
                <span className="tabular-nums">{activeItem.duration}</span>
                <span className="text-white/35" aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-white/92">
                  <Star className="size-[0.92em] fill-amber-400 text-amber-400" aria-hidden="true" />
                  <span>{activeItem.rating}</span>
                </span>
              </div>

              {/* Concise Editorial Synopsis */}
              <p className="mt-1.5 line-clamp-2 max-w-[58ch] text-pretty text-[clamp(11px,0.82vw,14.5px)] leading-snug text-white/66 [text-shadow:0_1px_10px_rgba(0,0,0,0.9)]">
                {activeItem.synopsis}
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  )
}

export const YourTasteRow = memo(YourTasteRowBase)
