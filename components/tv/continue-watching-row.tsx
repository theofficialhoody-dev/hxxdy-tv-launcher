'use client'

import Image from 'next/image'
import { Clock, Film, Play, Sparkles } from 'lucide-react'
import { memo, useEffect, type Ref } from 'react'
import { motion } from 'motion/react'
import { cn, signedOffset } from '@/lib/utils'
import { services, type ContinueItem } from '@/lib/launcher-data'
import { ServiceLogo } from './service-logo'
import { TitleLockup } from './title-lockup'
import { FlowFill } from './flow-fill'

type ContinueWatchingRowProps = {
  items: ContinueItem[]
  activeIndex: number
  rowFocused: boolean
  revealed?: boolean
  sectionRef: Ref<HTMLElement>
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onSelect: (index: number) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
}

function tileImage(src: string, small: boolean) {
  if (!src) return src
  // Side cards are drawn at 20vw, so they ask for the smaller poster: the shell caps a `/w500/` path at
  // 500 px instead of the 1280 px backdrop cap, which is roughly half the decoded bitmap per card.
  return src.replace('image.tmdb.org/t/p/w1280/', `image.tmdb.org/t/p/${small ? 'w500' : 'w780'}/`)
}

/** Same artwork preload strategy as Your Taste row: decode up front so D-pad presses never land image fetches mid-swipe. */
const preloadedArtwork = new Map<string, HTMLImageElement>()

function preloadArtwork(items: ContinueItem[], safeIndex: number) {
  if (typeof window === 'undefined') return
  const keep = new Set<string>()
  items.forEach((item, index) => {
    const abs = Math.abs(signedOffset(index, safeIndex, items.length))
    if (abs > 3) return
    // The card mounts the exact URL the browser will request, so the decode is already warm.
    const src = tileImage(item.image, abs >= 1)
    if (!src) return
    keep.add(src)
    if (preloadedArtwork.has(src)) return
    const image = new window.Image()
    image.decoding = 'async'
    image.src = src
    preloadedArtwork.set(src, image)
  })
  // The shelf is capped at 10 items; drop older frames to keep memory bounded.
  for (const src of preloadedArtwork.keys()) if (!keep.has(src)) preloadedArtwork.delete(src)
}

function detailKindLabel(detail: string) {
  return /^(film|movie)\b/i.test(detail.trim()) ? 'Category' : 'Episode'
}

type CarouselCardProps = {
  item: ContinueItem
  index: number
  offset: number
  rowFocused: boolean
  revealed: boolean
  registerRef: (index: number) => (el: HTMLElement | null) => void
  onSelect: (index: number) => void
  onHover: (index: number) => void
  onActivate: (index: number) => void
}

const CarouselCard = memo(function CarouselCard({
  item,
  index,
  offset,
  rowFocused,
  revealed,
  registerRef,
  onSelect,
  onHover,
  onActivate,
}: CarouselCardProps) {
  const abs = Math.abs(offset)
  // Seven cards: the centre, ±1, ±2 peeking in from the screen edges and ±3 waiting off screen. All of
  // them ride the same 205 spring, so a card glides into the arc instead of popping in at ±2 the moment
  // the selection moves.
  if (abs > 3) return null

  const isCenter = offset === 0
  const isLeft = offset < 0
  const focused = isCenter && rowFocused
  const percent = Math.round(item.progress * 100)
  const serviceName = (item.service ? services[item.service]?.name : item.appName) ?? item.appName ?? 'app'

  // Exact Video 2-6s Expanding Hero-Slide Geometry across the 3 mounted cards:
  //   Center (0) expands wide & taller: 38vw wide x 19.4vw tall (spans 31vw..69vw)
  //   Side cards (-1/+1/-2/+2) shrink smaller: 20vw wide x 17.6vw tall
  //   With 1.1vw uniform gaps:
  //     0  ->  0vw      (31.0vw..69.0vw)
  //    -1  -> -30.1vw   (9.9vw..29.9vw)
  //    +1  -> +30.1vw   (70.1vw..90.1vw)
  //    -2  -> -51.2vw   (-11.2vw..8.8vw  -> 11.2vw bleeds past left edge)
  //    +2  -> +51.2vw   (91.2vw..111.2vw -> 11.2vw bleeds past right edge)
  // One geometry for both states: `revealed` used to have a tighter set, so entering the shelf slid the
  // whole arc sideways on the same spring as the focus change (it read as a shuffle, and it re-rastered
  // every card). Only opacity reacts to `revealed` now.
  const xVwMap: Record<number, number> = { 0: 0, 1: 30.1, 2: 51.2, 3: 72.3 }

  const cardWidth = isCenter ? '38vw' : '20vw'
  // The reference box, expressed so the 205 spring can interpolate it: width and height each stay in a
  // single unit, and the clamp bounds ride along as static min/max so a very wide viewport still stops
  // at the reference's 320px / 290px caps.
  const cardHeight = isCenter ? '19.4vw' : '17.6vw'
  const cardMinHeight = isCenter ? '174px' : '156px'
  const cardMaxHeight = isCenter ? '320px' : '290px'

  const sign = offset === 0 ? 0 : offset < 0 ? -1 : 1
  const xVw = `${sign * (xVwMap[abs] ?? 72.3)}vw`

  const rotateYMap: Record<number, number> = { 0: 0, 1: 15, 2: 26, 3: 34 }
  const rotateY = offset === 0 ? 0 : offset < 0 ? rotateYMap[abs] ?? 34 : -(rotateYMap[abs] ?? 34)

  const transformOrigin = offset === 0 ? '50% 78%' : isLeft ? '100% 78%' : '0% 78%'
  const scale = isCenter ? (focused ? 1.02 : 1) : 0.99
  const opacity = abs === 0 ? 1 : abs === 1 ? (revealed ? 1 : 0.85) : abs === 2 ? (revealed ? 0.95 : 0.65) : 0
  const zIndex = abs === 0 ? 30 : abs === 1 ? 20 : abs === 2 ? 10 : 1

  return (
    <motion.div
      initial={{
        x: xVw,
        width: cardWidth,
        height: cardHeight,
        rotateY,
        scale: 0.96,
        opacity: 0,
      }}
      animate={{
        x: xVw,
        width: cardWidth,
        height: cardHeight,
        rotateY,
        scale,
        opacity,
      }}
      transition={{
        type: 'spring',
        stiffness: 205,
        damping: 25,
        mass: 0.92,
      }}
      style={{
        zIndex,
        transformOrigin,
        minHeight: cardMinHeight,
        maxHeight: cardMaxHeight,
        contain: 'layout style',
      }}
      // Only the two cards that can move during a step are promoted, and only while this shelf is the
      // focused one. The ±2/±3 pair never animates in place, so promoting it just pinned seven layers
      // (and their rasters) in Graphics memory for nothing.
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        rowFocused && abs <= 1 && 'will-change-transform',
        abs > 1 && 'pointer-events-none',
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
            ? item.historyOnly
              ? `Open ${item.title}, recently watched on ${serviceName}`
              : `Resume ${item.title}, ${item.detail}, ${item.remaining}, ${percent}% watched, on ${serviceName}`
            : `Select ${item.title}`
        }
        className="group relative block size-full text-left outline-none"
      >
        {/* Hero-Slide Frame with Diffused Sweeping Outer Halo behind card perimeter */}
        {focused && (
          <span
            aria-hidden="true"
            className="tv-halo-glow z-0"
            style={
              {
                '--tv-halo-spread': '-3px',
                '--tv-halo-blur': '8px',
                borderRadius: 'clamp(18px,1.7vw,28px)',
              } as React.CSSProperties
            }
          />
        )}
        {/* Static 1.5px gradient edge. Sibling of the clipped surface (the band it shows is the 1.5px
            overhang), inside the card container, so it tracks the card's scale and tilt on every frame. */}
        {focused && (
          <span
            aria-hidden="true"
            className="tv-conic-border"
            style={{ borderRadius: 'clamp(18px,1.7vw,28px)' } as React.CSSProperties}
          />
        )}
        <div
          className="tv-card-surface relative z-10 size-full overflow-hidden rounded-[clamp(18px,1.7vw,28px)] isolate"
          style={{
            transform: 'translateZ(0)',
            backgroundColor: 'var(--tv-bg, #0a0a0a)',
            boxShadow: focused
              ? 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.24)), 0 28px 64px -14px rgba(0,0,0,0.95)'
              : isCenter
                ? 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.16)), 0 20px 48px -12px rgba(0,0,0,0.88)'
                : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.16)), 0 14px 34px -12px rgba(0,0,0,0.78)',
          }}
        >
          <Image
            src={tileImage(item.image, abs >= 1) || '/placeholder.svg'}
            alt=""
            decoding="async"
            fill
            sizes={isCenter ? '(min-width: 1024px) 40vw, 320px' : '(min-width: 1024px) 22vw, 200px'}
            referrerPolicy="no-referrer"
            className={cn(
              'object-cover transition-transform duration-500 ease-out',
              focused ? 'scale-[1.04]' : 'scale-100',
              !isCenter && 'brightness-[0.94] group-hover:brightness-100',
            )}
          />

          {/* Cinematic bottom vignette scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/18 to-black/22" />

          {/* Service Logo Attribution across Visible Cards (top-left on full cards, inner corner on outer edge cards) */}
          {(item.service || item.appIcon) && (isCenter ? (
            <motion.div
              key={`logo-${item.id}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.12, ease: 'easeOut' }}
              className="pointer-events-none absolute left-[clamp(14px,1.4vw,24px)] top-[clamp(12px,1.25vw,22px)] z-10 flex items-center gap-2"
            >
              {item.pkg === 'com.nuvio.tv' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="https://launcher.local/__app_icon/com.nuvio.tv"
                  alt="Nuvio"
                  className="h-[clamp(18px,1.6vw,30px)] w-auto rounded object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
                />
              ) : (
                <ServiceLogo
                  id={item.service}
                  icon={item.appIcon}
                  className="h-[clamp(16px,1.45vw,26px)] w-auto max-w-[clamp(56px,5.2vw,96px)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
                />
              )}
            </motion.div>
          ) : abs === 1 ? (
            <div className="pointer-events-none absolute left-[clamp(10px,1vw,18px)] top-[clamp(10px,1vw,18px)] z-10 opacity-85">
              <ServiceLogo
                id={item.service}
                icon={item.appIcon}
                className="h-[clamp(12px,1.05vw,18px)] w-auto max-w-[clamp(42px,3.6vw,64px)]"
              />
            </div>
          ) : abs === 2 ? (
            <div
              className={cn(
                'pointer-events-none absolute top-[clamp(10px,1vw,18px)] z-10 opacity-75',
                isLeft ? 'right-[clamp(10px,0.95vw,16px)]' : 'left-[clamp(10px,0.95vw,16px)]',
              )}
            >
              <ServiceLogo
                id={item.service}
                icon={item.appIcon}
                className="h-[clamp(10px,0.9vw,16px)] w-auto max-w-[clamp(34px,3vw,52px)]"
              />
            </div>
          ) : null)}

          {/* Center Play Control. The orbiting bloom lives on the card perimeter only: a second blur here
              was another full Gaussian pass per frame over the same card. */}
          {isCenter && (
            <div
              className={cn(
                'pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-250 ease-out',
                focused ? 'scale-105 opacity-100' : 'scale-95 opacity-80 group-hover:scale-100 group-hover:opacity-100',
              )}
            >
              <div className="relative size-[clamp(36px,2.75vw,50px)] rounded-full isolate">
                {/* Same pattern as the hero Play pill: the hairline is the ring wrapper's 1.5px overhang
                    past the opaque pill, so it can never paint across the button. */}
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
                    // The hero Play pill's own opaque surface, verbatim: same accent bloom + surface.
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

          {/* Staggered Center Hero-Slide Bottom Info Strip */}
          {isCenter && (
            <motion.div
              key={`meta-${item.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.14, ease: 'easeOut' }}
              className={cn(
                'pointer-events-none absolute inset-x-[clamp(14px,1.45vw,26px)] z-10 flex items-end justify-between gap-4',
                !item.historyOnly
                  ? 'bottom-[clamp(22px,2.1vw,34px)]'
                  : 'bottom-[clamp(14px,1.35vw,24px)]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex h-[clamp(28px,3vw,48px)] w-full max-w-[clamp(140px,18.5vw,320px)] items-end">
                  <TitleLockup
                    title={item.title}
                    logo={item.logo}
                    align="left"
                    className="brightness-105 drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]"
                    fallbackClassName="text-[clamp(15px,1.35vw,25px)] font-bold leading-[1.08]"
                  />
                </div>
              </div>

              {/* Stacked Outline Icon Metadata Cluster */}
              <div className="flex shrink-0 items-center gap-[clamp(10px,1.05vw,18px)]">
                {item.remaining && (
                  <div className="flex items-center gap-[0.42vw]">
                    <span
                      className="grid size-[clamp(19px,1.48vw,25px)] place-items-center rounded-[clamp(4px,0.4vw,7px)] border text-white/90"
                      style={{
                        backgroundColor: 'var(--tv-surface, rgba(0,0,0,0.45))',
                        borderColor: 'var(--tv-glass-border, rgba(255,255,255,0.3))',
                      }}
                    >
                      <Clock className="size-[56%]" aria-hidden="true" />
                    </span>
                    <div className="leading-tight">
                      <span className="block text-[clamp(7.5px,0.5vw,9.5px)] font-medium text-white/60">
                        Remaining
                      </span>
                      <span className="block whitespace-nowrap text-[clamp(10px,0.7vw,12.5px)] font-semibold tabular-nums text-white">
                        {item.remaining}
                      </span>
                    </div>
                  </div>
                )}
                {item.detail && (
                  <div className="hidden sm:flex items-center gap-[0.42vw]">
                    <span
                      className="grid size-[clamp(19px,1.48vw,25px)] place-items-center rounded-[clamp(4px,0.4vw,7px)] border text-white/90"
                      style={{
                        backgroundColor: 'var(--tv-surface, rgba(0,0,0,0.45))',
                        borderColor: 'var(--tv-glass-border, rgba(255,255,255,0.3))',
                      }}
                    >
                      <Film className="size-[56%]" aria-hidden="true" />
                    </span>
                    <div className="leading-tight">
                      <span className="block text-[clamp(7.5px,0.5vw,9.5px)] font-medium text-white/60">
                        {detailKindLabel(item.detail)}
                      </span>
                      <span className="block whitespace-nowrap text-[clamp(10px,0.7vw,12.5px)] font-semibold text-white">
                        {item.detail}
                      </span>
                    </div>
                  </div>
                )}
                {item.quality && (
                  <div className="hidden xl:flex items-center gap-[0.42vw]">
                    <span
                      className="grid size-[clamp(19px,1.48vw,25px)] place-items-center rounded-[clamp(4px,0.4vw,7px)] border text-white/90"
                      style={{
                        backgroundColor: 'var(--tv-surface, rgba(0,0,0,0.45))',
                        borderColor: 'var(--tv-glass-border, rgba(255,255,255,0.3))',
                      }}
                    >
                      <Sparkles className="size-[56%]" aria-hidden="true" />
                    </span>
                    <div className="leading-tight">
                      <span className="block text-[clamp(7.5px,0.5vw,9.5px)] font-medium text-white/60">
                        Format
                      </span>
                      <span className="block whitespace-nowrap text-[clamp(10px,0.7vw,12.5px)] font-semibold text-white">
                        {item.quality}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Inner Smaller Flanking Card Title Logos (-1 and +1) */}
          {!isCenter && abs === 1 && (
            <div className="pointer-events-none absolute inset-x-[clamp(10px,1vw,18px)] bottom-[clamp(10px,1.1vw,18px)] z-10 flex h-[clamp(20px,2.1vw,34px)] max-w-[82%] items-end">
              <TitleLockup
                title={item.title}
                logo={item.logo}
                align="left"
                className="opacity-92"
                fallbackClassName="text-[clamp(11px,0.95vw,17px)] text-white/95"
              />
            </div>
          )}

          {/* Outer Edge Flanking Card Title Logos (-2 and +2 visible inside edges) */}
          {!isCenter && abs === 2 && (
            <div
              className={cn(
                'pointer-events-none absolute bottom-[clamp(10px,1.1vw,18px)] z-10 flex h-[clamp(16px,1.65vw,26px)] w-[36%] items-end',
                isLeft ? 'right-[clamp(10px,0.95vw,16px)] justify-end' : 'left-[clamp(10px,0.95vw,16px)] justify-start',
              )}
            >
              <TitleLockup
                title={item.title}
                logo={item.logo}
                align={isLeft ? 'right' : 'left'}
                className="opacity-85"
                fallbackClassName="truncate text-[clamp(10px,0.84vw,15px)] text-white/88"
              />
            </div>
          )}

          {/* Inset Floating Progress Capsule separated cleanly from the card perimeter border */}
          {isCenter && !item.historyOnly && (
            <div
              className="pointer-events-none absolute inset-x-[clamp(14px,1.45vw,26px)] bottom-[clamp(10px,0.9vw,15px)] z-10 h-[clamp(4px,0.28vw,5.5px)] overflow-hidden rounded-full bg-black/60"
              style={{
                boxShadow: 'inset 0 0 0 1px var(--tv-glass-border, rgba(255, 255, 255, 0.18))',
              }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full overflow-hidden rounded-full"
                style={{ width: `${percent}%` }}
              >
                {focused ? (
                  <div className="relative h-full w-full">
                    <FlowFill active={rowFocused} />
                  </div>
                ) : (
                  <div
                    className="h-full w-full"
                    style={{
                      background:
                        'linear-gradient(90deg, var(--tv-accent, #38bdf8) 0%, var(--tv-accent-2, #6366f1) 100%)',
                    }}
                  />
                )}
              </div>
            </div>
          )}

        </div>
      </button>
    </motion.div>
  )
})

function ContinueWatchingRowBase({
  items,
  activeIndex,
  rowFocused,
  revealed = true,
  sectionRef,
  registerRef,
  onSelect,
  onHover,
  onActivate,
}: ContinueWatchingRowProps) {
  const safeIndex = Math.max(0, Math.min(items.length - 1, activeIndex))

  // Decode every card's poster up front so a D-pad step never lands an image fetch mid-spring.
  useEffect(() => {
    preloadArtwork(items, safeIndex)
  }, [items, safeIndex])

  return (
    <motion.section
      ref={sectionRef}
      aria-labelledby="continue-heading"
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: revealed ? 1 : 0.8,
        y: revealed ? 0 : 8,
      }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-h-dvh w-full overflow-x-clip py-[0.8vh]"
    >
      {/* Centered Header matching Your Taste */}
      <div className="relative z-20 mb-[2.4vh] px-[5vw] text-center">
        <h2
          id="continue-heading"
          className="text-[clamp(18px,1.55vw,30px)] font-semibold tracking-tight text-white"
        >
          Continue Watching
        </h2>
        <p className="mt-0.5 text-[clamp(11px,0.8vw,15px)] text-white/55">
          Pick up where you left off · {safeIndex + 1} / {items.length}
        </p>
      </div>

      {/* 5-Card Expanding Hero-Slide Stage (wide center card, narrower curved side cards) */}
      <div
        className="relative mx-auto h-[clamp(192px,21.5vw,356px)] w-full overflow-visible"
        style={{ perspective: '880px', perspectiveOrigin: '50% 78%' }}
      >
        {items.map((item, index) => (
          <CarouselCard
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

      {/* Subtle Progress Dots */}
      {items.length > 1 && (
        <div className="mt-[1.3vh] flex items-center justify-center gap-1.5" aria-hidden="true">
          {items.map((item, idx) => {
            const active = idx === safeIndex
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={-1}
                onClick={() => onSelect(idx)}
                className={cn(
                  'relative h-[clamp(4px,0.28vw,5.5px)] overflow-hidden rounded-full transition-all duration-300',
                  active ? 'w-[clamp(20px,1.65vw,32px)]' : 'w-[clamp(5px,0.34vw,6.5px)] bg-white/25 hover:bg-white/45',
                )}
              >
                {active && <FlowFill active={rowFocused} />}
              </button>
            )
          })}
        </div>
      )}
    </motion.section>
  )
}

export const ContinueWatchingRow = memo(ContinueWatchingRowBase)
