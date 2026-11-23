'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { ResolvedQuality } from '@/lib/device-quality'
import type { HeroSlide } from '@/lib/launcher-data'
import { hasNativeLiveWallpaper, pauseLiveWallpaper, playLiveWallpaper, stopLiveWallpaper } from '@/lib/native-bridge'

/** Immersive art that has already been requested, kept alive so a decoded frame is ready to show. */
const decodedImmersive = new Map<string, HTMLImageElement>()

/** Same asset the <video> fallback plays; the shell maps it onto the APK's www/ assets. */
const WALLPAPER_URL = '/assets/aistudio/goku-black-wallpaper.mp4'

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
  /** The shell decodes the wallpaper on a native SurfaceView; a browser keeps the <video> path. */
  const [nativeVideo, setNativeVideo] = useState(false)
  /** The wallpaper belongs on screen only on the dimmed hero: never in a shelf, modal or overlay. */
  const wallpaperActive = dimmed && videoEnabled && !paused && !immersiveActive

  // Layered cross-fade: the previous backdrop stays fully opaque underneath until the next artwork has
  // decoded and faded in, so changing a card can never expose the black base through a gap.
  const [layers, setLayers] = useState<{ src: string; ready: boolean }[]>(() =>
    immersiveBackdrop ? [{ src: immersiveBackdrop, ready: false }] : [],
  )
  const pruneRef = useRef<number | undefined>(undefined)

  const markReady = useCallback((src: string) => {
    setLayers((prev) => prev.map((layer) => (layer.src === src && !layer.ready ? { ...layer, ready: true } : layer)))
    window.clearTimeout(pruneRef.current)
    // The cross-fade runs 450 ms; older frames are dropped once the newest one is fully opaque.
    pruneRef.current = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), 520)
  }, [])

  useEffect(() => {
    if (!immersiveBackdrop) {
      // Hold the last frame while the whole immersive stage fades out above the hero.
      pruneRef.current = window.setTimeout(() => setLayers([]), 560)
      return () => window.clearTimeout(pruneRef.current)
    }
    setLayers((prev) =>
      prev[prev.length - 1]?.src === immersiveBackdrop
        ? prev
        : [...prev, { src: immersiveBackdrop, ready: false }].slice(-2),
    )
  }, [immersiveBackdrop])

  useEffect(() => () => window.clearTimeout(pruneRef.current), [])

  // Ready means decoded, not merely requested: only then does the new layer fade in over the old one.
  useEffect(() => {
    const src = immersiveBackdrop
    if (!src) return
    let image = decodedImmersive.get(src)
    if (!image) {
      image = new window.Image()
      image.decoding = 'async'
      image.src = src
      decodedImmersive.set(src, image)
    }
    const cached = image
    if (cached.complete && cached.naturalWidth > 0) {
      markReady(src)
      return
    }
    const onLoad = () => markReady(src)
    cached.addEventListener('load', onLoad)
    return () => cached.removeEventListener('load', onLoad)
  }, [immersiveBackdrop, markReady])

  useEffect(() => {
    setNativeVideo(hasNativeLiveWallpaper())
  }, [])

  // Manage video playback based on whether user is browsing continue watching / my apps (paused during immersive list).
  // With the native surface the page turns see-through instead of playing anything in the DOM, which is
  // what keeps a 1080p decode out of Chromium while the wallpaper is on screen.
  useEffect(() => {
    if (nativeVideo) {
      document.documentElement.dataset.nativeVideo = wallpaperActive ? 'true' : 'false'
      if (wallpaperActive) playLiveWallpaper(WALLPAPER_URL)
      else pauseLiveWallpaper()
      return
    }
    const video = videoRef.current
    if (!video) return

    video.defaultMuted = true
    video.muted = true

    if (wallpaperActive) {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Inline autoplay safe catch
        })
      }
    } else {
      video.pause()
    }
  }, [nativeVideo, wallpaperActive])

  // Backgrounded launcher: stop the decoder even if the page never gets a chance to re-render, then
  // pick it back up on the shell's own resume event (the effect above only runs when a prop changes,
  // so returning from Home would otherwise leave the last frame frozen).
  useEffect(() => {
    if (!nativeVideo) return
    const resume = () => {
      if (wallpaperActive) playLiveWallpaper(WALLPAPER_URL)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseLiveWallpaper()
      else resume()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('launcher:resume', resume)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('launcher:resume', resume)
    }
  }, [nativeVideo, wallpaperActive])

  useEffect(
    () => () => {
      if (!hasNativeLiveWallpaper()) return
      stopLiveWallpaper()
      delete document.documentElement.dataset.nativeVideo
    },
    [],
  )

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
              // The wallpaper covers this art exactly when it is on screen, so hiding it there is a
              // no-op visually - it just stops Chromium painting a full-bleed image under the video.
              active && !immersiveActive && !(nativeVideo && wallpaperActive) ? 'opacity-100' : 'opacity-0',
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
              {!nativeVideo && (
                <video
                  ref={videoRef}
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  poster="/assets/aistudio/goku-black-poster.jpg"
                  className="absolute inset-0 h-full w-full object-cover"
                >
                  <source src={WALLPAPER_URL} type="video/mp4" />
                </video>
              )}

              {/* Scrim. Over the live video the three passes are ONE element: normal-blend backgrounds
                  composite identically, so it is the same picture with two fewer full-screen surfaces
                  blended into every frame. Everywhere else the original stack is kept untouched. */}
              {nativeVideo && wallpaperActive ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    backgroundImage:
                      'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%), linear-gradient(to top, var(--tv-bg, #000000) 0%, rgba(0,0,0,0.38) 45%, transparent 100%)',
                    backgroundSize: '100% 22vh, 100% 48vh',
                    backgroundPosition: 'left top, left bottom',
                    backgroundRepeat: 'no-repeat, no-repeat',
                  }}
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute inset-x-0 top-0 h-[22vh] bg-gradient-to-b from-black/75 to-transparent" />
                  <div
                    className="absolute inset-x-0 bottom-0 h-[48vh]"
                    style={{
                      background:
                        'linear-gradient(to top, var(--tv-bg, #000000) 0%, rgba(0,0,0,0.38) 45%, transparent 100%)',
                    }}
                  />
                </>
              )}
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
        {layers.map((layer) => (
          <motion.div
            key={layer.src}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: layer.ready ? 1 : 0, scale: 1.06 }}
            transition={{
              opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 10, ease: 'easeOut' },
            }}
            className={cn('absolute inset-0', immersiveActive && 'will-change-transform')}
          >
            <Image
              src={layer.src}
              alt=""
              fill
              sizes="100vw"
              referrerPolicy="no-referrer"
              className="object-cover object-center"
            />
          </motion.div>
        ))}

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
