'use client'

import { memo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { ResolvedQuality } from '@/lib/device-quality'
import type { HeroSlide } from '@/lib/launcher-data'

export const HeroBackdrop = memo(function HeroBackdrop({
  slides,
  activeIndex,
  dimmed,
  immersiveBackdrop = null,
  kenBurns = true,
  liveWallpaper = true,
  paused = false,
  quality = 'high',
}: {
  slides: HeroSlide[]
  activeIndex: number
  dimmed: boolean
  immersiveBackdrop?: string | null
  kenBurns?: boolean
  liveWallpaper?: boolean
  paused?: boolean
  /** LOW skips the wallpaper decoder entirely; MEDIUM keeps the design exactly as HIGH. */
  quality?: ResolvedQuality
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const immersiveActive = Boolean(immersiveBackdrop)
  const videoEnabled = liveWallpaper !== false && quality !== 'low'

  // Manage video playback based on whether user is browsing continue watching / my apps (paused during immersive list)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.defaultMuted = true
    video.muted = true

    if (dimmed && videoEnabled && !paused && !immersiveActive) {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Inline autoplay safe catch
        })
      }
    } else {
      video.pause()
    }
  }, [dimmed, videoEnabled, paused, immersiveActive])

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true" data-tv-paused={paused || undefined}>
      {/* Primary Hero Slide Backdrops */}
      {slides.map((slide, index) => {
        const active = index === activeIndex
        const n = slides.length
        // Only the current, next and previous slides stay mounted to keep decoded image memory low.
        if (!(active || index === (activeIndex + 1) % n || index === (activeIndex - 1 + n) % n)) return null
        return (
          <div
            key={slide.id}
            className={cn(
              'absolute inset-0 transition-opacity duration-500 ease-out',
              active && !immersiveActive ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Image
              src={slide.backdrop || '/placeholder.svg'}
              alt=""
              fill
              priority={index === 0}
              sizes="100vw"
              referrerPolicy="no-referrer"
              // While browsing the shelves the backdrop is dimmed: a static scale avoids keeping a full-screen
              // animated compositor layer alive (it measurably costs frames) without changing how it looks.
              className={cn('object-cover', active && kenBurns && (dimmed ? 'scale-[1.05]' : 'animate-kenburns'))}
            />
          </div>
        )
      })}

      {/* Hero Vignette Gradients — balanced to let hero artwork breathe while keeping bottom-left text crisp */}
      <div className="absolute inset-x-0 top-0 h-[20vh] bg-gradient-to-b from-black/42 to-transparent" />
      <div className="absolute inset-y-0 left-0 w-[54vw] bg-gradient-to-r from-black/58 via-black/20 to-transparent" />
      <div
        className="absolute inset-x-0 bottom-0 h-[52vh]"
        style={{
          background: 'linear-gradient(to top, var(--tv-bg, #000000) 0%, rgba(0,0,0,0.48) 38%, transparent 100%)',
        }}
      />

      {/* Thematic Ambient Aura Layers scaled by Theme Studio intensity */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 'calc(0.85 * var(--tv-glow-scale, 1))',
          background: `
            radial-gradient(ellipse 85% 60% at 70% 25%, var(--tv-glow, rgba(56, 189, 248, 0.24)), transparent 65%),
            radial-gradient(ellipse 70% 50% at 15% 80%, var(--tv-glow-2, rgba(99, 102, 241, 0.18)), transparent 70%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.35) 85%, var(--tv-bg, #000000) 100%)',
          opacity: 0.65,
        }}
      />

      {/* Only mounted when enabled so the video decoder isn't initialised for nothing. */}
      {videoEnabled && (
        <>
          {/* Secondary Live Wallpaper: Goku Black Super Saiyan Rosé (plays when scrolling down to Continue Watching & My Apps) */}
          <div
            className={cn(
              'absolute inset-0 overflow-hidden transition-opacity duration-500 ease-out',
              dimmed && !immersiveActive ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
              <video
                ref={videoRef}
                loop
                muted
                playsInline
                preload="metadata"
                poster="/assets/aistudio/goku-black-poster.jpg"
                className="absolute inset-0 h-full w-full object-cover"
              >
                <source src="/assets/aistudio/goku-black-wallpaper.mp4" type="video/mp4" />
              </video>

              {/* Cinematic Backdrop Scrim Overlays: Balanced for maximum wallpaper visibility and card text legibility */}
              <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-x-0 top-0 h-[22vh] bg-gradient-to-b from-black/75 to-transparent" />
            <div
              className="absolute inset-x-0 bottom-0 h-[48vh]"
              style={{
                background: 'linear-gradient(to top, var(--tv-bg, #000000) 0%, rgba(0,0,0,0.38) 45%, transparent 100%)',
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: 'calc(0.9 * var(--tv-glow-scale, 1))',
                background: `
                  radial-gradient(circle at 50% 45%, transparent 35%, rgba(0, 0, 0, 0.35) 100%),
                  radial-gradient(ellipse 90% 60% at 50% 85%, var(--tv-glow, transparent), transparent 70%),
                  radial-gradient(ellipse 65% 45% at 15% 20%, var(--tv-glow-2, transparent), transparent 70%)
                `,
              }}
            />
          </div>
        </>
      )}

      {/* Standard Fallback Dimmer when live wallpaper is disabled */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-500 ease-out',
          dimmed && !immersiveActive && liveWallpaper === false ? 'opacity-65' : 'pointer-events-none opacity-0',
        )}
        style={{ backgroundColor: 'var(--tv-bg, #000000)' }}
      />

      {/* Android TV Immersive List Full-Viewport Backdrop (opaque base completely blocks underlying backgrounds) */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500 ease-out',
          immersiveActive ? 'opacity-100' : 'opacity-0',
        )}
        style={{ backgroundColor: 'var(--tv-bg, #000000)' }}
      >
        <AnimatePresence mode="sync">
          {immersiveBackdrop && (
            <motion.div
              key={immersiveBackdrop}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1.06 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                scale: { duration: 10, ease: 'easeOut' },
              }}
              className="absolute inset-0 will-change-transform"
            >
              <Image
                src={immersiveBackdrop}
                alt=""
                fill
                sizes="100vw"
                referrerPolicy="no-referrer"
                className="object-cover object-center"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Immersive Stage Scrims & Theme Studio Accent Aura */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 85% 68% at 50% 42%, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.82) 100%),
              linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.34) 28%, rgba(0,0,0,0.38) 68%, var(--tv-bg, #000000) 100%)
            `,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 'calc(0.75 * var(--tv-glow-scale, 1))',
            background: `
              radial-gradient(ellipse 68% 52% at 50% 24%, var(--tv-glow, rgba(56,189,248,0.2)), transparent 70%),
              radial-gradient(ellipse 58% 46% at 50% 80%, var(--tv-glow-2, rgba(99,102,241,0.16)), transparent 72%)
            `,
          }}
        />
      </div>
    </div>
  )
})
