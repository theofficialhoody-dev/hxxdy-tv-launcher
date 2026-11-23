'use client'

import { memo, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HeroSlide } from '@/lib/launcher-data'
import { SHELF_ANCHOR } from '@/lib/layout'
import { ServiceBadge } from './service-logo'
import { FlowFill } from './flow-fill'

type HeroInfoProps = {
  slides: HeroSlide[]
  activeIndex: number
  focused: boolean
  visible: boolean
  paused: boolean
  slideDuration: number
  playRef: (el: HTMLElement | null) => void
  onHover: () => void
  onPlay: () => void
  onSelectSlide: (index: number) => void
}

export const HeroInfo = memo(function HeroInfo({
  slides,
  activeIndex,
  focused,
  visible,
  paused,
  slideDuration,
  playRef,
  onHover,
  onPlay,
  onSelectSlide,
}: HeroInfoProps) {
  const slide = slides[activeIndex]
  if (!slide) return <section aria-hidden="true" className="h-[72dvh]" />

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      data-tv-paused={!visible || paused || undefined}
      className={cn(
        'flex h-dvh flex-col justify-end px-[5vw] pt-[clamp(80px,11vh,120px)] transition-opacity duration-350 ease-out',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div
        key={slide.id}
        aria-live="polite"
        className="flex max-w-[clamp(480px,66vw,1220px)] shrink-0 flex-col items-start gap-[1.4vh] animate-in fade-in slide-in-from-bottom-2 duration-500"
      >
        {/* Eyebrow and Service Badge */}
        <div className="flex items-center gap-[0.8vw] text-[clamp(11px,0.8vw,16px)]">
          <ServiceBadge
            id={slide.service}
            name={slide.appName}
            icon={
              slide.appName === 'Nuvio' && slide.appIcon?.startsWith('https://launcher.local/__icon/')
                ? 'https://launcher.local/__app_icon/com.nuvio.tv'
                : slide.appIcon
            }
            iconClassName={slide.appName === 'Nuvio' ? 'rounded-[25%]' : undefined}
            withName
          />
          <span className="font-medium uppercase tracking-[0.18em] text-white/75">{slide.eyebrow}</span>
        </div>

        {/* Dominant Apple TV-Style Title Logo Focal Point */}
        {slide.logo && slide.logoIsAlpha ? (
          <h2 className="relative h-[clamp(198px,31.5vh,408px)] w-[clamp(470px,64vw,1180px)]">
            <span className="sr-only">{slide.title}</span>
            <TitleLogo key={slide.logo} src={slide.logo} title={slide.title} />
          </h2>
        ) : !slide.logo ? (
          <h2 className="flex h-[clamp(198px,31.5vh,408px)] w-[clamp(470px,64vw,1180px)] items-end text-balance text-[clamp(46px,5.6vw,110px)] font-bold leading-[1.02] tracking-tight text-white [text-shadow:0_6px_28px_rgba(0,0,0,0.75)]">
            <span className="line-clamp-2">{slide.title}</span>
          </h2>
        ) : (
          <h2 className="relative h-[clamp(198px,31.5vh,408px)] w-[clamp(470px,64vw,1180px)] drop-shadow-[0_8px_36px_rgba(0,0,0,0.78)]">
            <span className="sr-only">{slide.title}</span>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-contain bg-left-bottom bg-no-repeat brightness-125"
              style={{
                backgroundImage: `url(${slide.logo})`,
                maskImage: `url(${slide.logo})`,
                WebkitMaskImage: `url(${slide.logo})`,
                maskMode: 'luminance',
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'left bottom',
                WebkitMaskPosition: 'left bottom',
              }}
            />
          </h2>
        )}

        <div className="mt-[0.3vh] flex flex-wrap items-center gap-x-[0.7em] gap-y-2 text-[clamp(12px,0.92vw,18px)] text-white/85">
          {slide.meta.map((item, i) => (
            <span key={item} className="flex items-center gap-[0.7em]">
              {i > 0 && <span className="size-[0.25em] rounded-full bg-white/45" aria-hidden="true" />}
              {item}
            </span>
          ))}
          {slide.badges.length > 0 && (
            <span className="ml-[0.3em] flex gap-[0.4em]">
              {slide.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-[0.35em] px-[0.48em] py-[0.12em] text-[0.76em] font-semibold tracking-wide text-white/95"
                  style={{
                    backgroundColor: 'var(--tv-glass, rgba(0,0,0,0.4))',
                    boxShadow: 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.22))',
                  }}
                >
                  {badge}
                </span>
              ))}
            </span>
          )}
        </div>

        <p className="line-clamp-2 max-w-[clamp(320px,38vw,660px)] text-pretty text-[clamp(13px,0.98vw,19px)] leading-relaxed text-white/78 [text-shadow:0_1px_8px_rgba(0,0,0,0.65)]">
          {slide.synopsis}
        </p>
      </div>

      <div className="mt-[2.8vh] flex shrink-0 items-center justify-between gap-6">
        <div className="flex items-center gap-[1vw]">
          <button
            ref={playRef}
            type="button"
            onMouseEnter={onHover}
            onClick={onPlay}
            aria-label={`Play ${slide.title}`}
            className={cn(
              'relative inline-flex h-[clamp(48px,3.6vw,68px)] items-center justify-center rounded-full isolate outline-none transition-[transform,box-shadow] duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
              focused ? 'scale-[1.05] text-white' : 'scale-100 text-white/90 hover:text-white',
            )}
            style={{
              boxShadow: focused ? '0 14px 36px rgba(0,0,0,0.75)' : undefined,
            }}
          >
            {focused && (
              <span
                aria-hidden="true"
                className="tv-halo-glow z-0"
                style={{ '--tv-halo-spread': '-2.5px', '--tv-halo-blur': '10px' } as React.CSSProperties}
              />
            )}
            {/* The hairline is the ring wrapper's 1.5px overhang past the pill, so it sits behind the
                pill surface and can never paint across the button. */}
            {focused && (
              <span
                aria-hidden="true"
                className="tv-conic-border"
                style={{ borderRadius: '9999px' } as React.CSSProperties}
              />
            )}
            <span
              className="relative z-10 inline-flex h-full items-center justify-center gap-[0.7em] rounded-full px-[2.1em] text-[clamp(15px,1.12vw,22px)] font-bold"
              style={{
                background: focused
                  ? 'radial-gradient(circle at 30% 25%, var(--tv-glow, rgba(56,189,248,0.22)), transparent 72%), var(--tv-surface, rgba(10,11,16,0.96))'
                  : 'var(--tv-surface, rgba(10,11,16,0.82))',
                boxShadow: focused
                  ? undefined
                  : 'inset 0 0 0 1px var(--tv-glass-border, rgba(255,255,255,0.18))',
              }}
            >
              <Play
                className={cn(
                  'relative z-20 size-[1.12em] shrink-0 fill-white text-white transition-all duration-300',
                  focused
                    ? 'drop-shadow-[0_0_10px_var(--tv-accent,rgba(56,189,248,0.9))]'
                    : 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]',
                )}
                aria-hidden="true"
              />
              <span className="relative z-20 whitespace-nowrap font-bold tracking-wide text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                Play
              </span>
            </span>
          </button>
        </div>

        {/* Slide Switcher Indicators with enlarged vertical hit area */}
        <div className="flex items-center gap-[0.35vw]" role="tablist" aria-label="Featured titles">
          {slides.map((s, index) => {
            const active = index === activeIndex
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                tabIndex={-1}
                aria-selected={active}
                aria-label={s.title}
                onClick={() => onSelectSlide(index)}
                className="group py-2 px-0.5 outline-none"
              >
                <span
                  className={cn(
                    'relative block h-[clamp(4px,0.34vw,7px)] overflow-hidden rounded-full bg-white/30 transition-[width,background-color] duration-400 ease-out',
                    active ? 'w-[clamp(28px,2.4vw,52px)]' : 'w-[clamp(6px,0.42vw,9px)] group-hover:bg-white/60',
                  )}
                >
                  {active && (
                    <span
                      key={s.id}
                      className="absolute inset-0 origin-left rounded-full animate-slide-progress overflow-hidden"
                      style={{
                        animationDuration: `${slideDuration}ms`,
                        animationPlayState: paused ? 'paused' : 'running',
                        boxShadow: '0 0 10px var(--tv-accent, #38bdf8), 0 0 16px var(--tv-glow, rgba(56,189,248,0.35))',
                      }}
                    >
                      <FlowFill />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/*
        The hero owns the first screen, so it holds the exact band the next shelf claims when it takes
        focus (same SHELF_ANCHOR the stack scrolls by). The band is an empty flex item rather than
        section padding, so on a short screen it gives way first: the copy keeps its natural size and
        keeps growing upward with the logo or synopsis instead of being clipped.
      */}
      <div
        aria-hidden="true"
        className="min-h-0 shrink"
        style={{ height: `${SHELF_ANCHOR.continue * 100}dvh` }}
      />
    </section>
  )
})

/**
 * Transparent title art, tuned for dark backgrounds. Logos that are mostly dark would vanish on the
 * backdrop, so they are flattened to white; colourful or light logos are left untouched.
 */
/**
 * The verdict is per URL and cached for the session. The hero remounts this component on every
 * slide change, and the readback is a synchronous read of a decoded image plus a fresh canvas.
 */
const LOGO_LUMINANCE = new Map<string, boolean>()
let logoProbe: HTMLCanvasElement | null = null

function probeLogoIsLight(img: HTMLImageElement): boolean | null {
  try {
    logoProbe ??= document.createElement('canvas')
    const c = logoProbe
    c.width = 48
    c.height = Math.max(1, Math.round((48 * img.naturalHeight) / Math.max(1, img.naturalWidth)))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let sum = 0
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue
      sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      n++
    }
    return n > 0 ? sum / n < 0.35 : false
  } catch {
    // tainted canvas (no CORS): leave the logo as is, and remember it so it is not retried
    return false
  }
}

function TitleLogo({ src, title }: { src: string; title: string }) {
  const [light, setLight] = useState(() => LOGO_LUMINANCE.get(src) ?? false)
  const [attempt, setAttempt] = useState(0)
  if (attempt > 1) {
    return (
      <span className="flex h-full items-end text-balance text-[clamp(46px,5.6vw,110px)] font-bold leading-[1.02] tracking-tight text-white [text-shadow:0_6px_28px_rgba(0,0,0,0.75)]">
        {title}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      crossOrigin={attempt === 0 ? 'anonymous' : undefined}
      onError={() => setAttempt((a) => a + 1)}
      className={cn(
        'size-full object-contain object-left-bottom drop-shadow-[0_8px_36px_rgba(0,0,0,0.78)]',
        light && 'brightness-0 invert',
      )}
      decoding="async"
      onLoad={(e) => {
        if (LOGO_LUMINANCE.has(src)) return
        const verdict = probeLogoIsLight(e.currentTarget)
        if (verdict === null) return
        LOGO_LUMINANCE.set(src, verdict)
        if (verdict) setLight(true)
      }}
    />
  )
}