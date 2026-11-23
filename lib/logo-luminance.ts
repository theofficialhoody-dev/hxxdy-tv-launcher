'use client'

import { useEffect, useState } from 'react'

/**
 * Some title wordmarks are pure black, which is invisible on the launcher's dark backdrops; those are
 * flattened to crisp white. Everything else - including a colourful logo whose artwork happens to be
 * dark overall (Spider-Man) - is left exactly as authored.
 *
 * Deciding it costs one canvas probe per URL (a synchronous GPU->CPU `getImageData` readback of a
 * just-decoded image), so the verdict is kept in memory for the session and in `localStorage` across
 * launches. The hero and the shelf cards share this one cache: a known wordmark never probes again.
 */
const VERDICTS_KEY = 'launcher.logo.luminance.v2'
/** Older verdict files are wrong (they judged brightness only) and must not survive. */
const LEGACY_VERDICTS_KEYS = ['launcher.logo.luminance.v1']
const VERDICTS_LIMIT = 300
/** Probe canvas width in px: wide enough that thin strokes survive the downscale. */
const PROBE_PX = 192
const PROBEABLE = /^https?:\/\//i

/** Pixels at or below this alpha are edge noise, not ink. */
const ALPHA_MIN = 32
/** "Near black" per channel. */
const BLACK_MAX = 45
/** `max(R,G,B) - min(R,G,B)` at or above this is a coloured pixel. */
const CHROMA_MAX = 28
/** A wordmark is only black when this share of its ink is near-black. */
const BLACK_SHARE = 0.9

const verdicts = new Map<string, boolean>()
/** URLs a probe could not read (tainted canvas, 404): never retried in this session. */
const unreadable = new Set<string>()
const inflight = new Map<string, Promise<boolean | null>>()
let stored: Record<string, boolean> | null = null
let canvas: HTMLCanvasElement | null = null

function storedVerdicts(): Record<string, boolean> {
  if (stored) return stored
  try {
    for (const legacy of LEGACY_VERDICTS_KEYS) window.localStorage.removeItem(legacy)
    const parsed: unknown = JSON.parse(window.localStorage.getItem(VERDICTS_KEY) ?? '{}')
    stored = parsed && typeof parsed === 'object' ? { ...(parsed as Record<string, boolean>) } : {}
  } catch {
    // No storage (or a JSON blob from an older build): probe and rewrite it.
    stored = {}
  }
  return stored
}

/** Memory first, then the persisted map. Never probes: that is only worth doing once per URL. */
export function cachedLogoIsBlack(src: string): boolean {
  const cached = verdicts.get(src)
  if (cached !== undefined) return cached
  const persisted = storedVerdicts()[src]
  if (typeof persisted !== 'boolean') return false
  verdicts.set(src, persisted)
  return persisted
}

function remember(src: string, black: boolean) {
  verdicts.set(src, black)
  const store = storedVerdicts()
  store[src] = black
  const keys = Object.keys(store)
  if (keys.length > VERDICTS_LIMIT) {
    // Insertion-ordered, so the oldest wordmarks go first and the set stays bounded.
    for (const key of keys.slice(0, keys.length - VERDICTS_LIMIT)) delete store[key]
  }
  try {
    window.localStorage.setItem(VERDICTS_KEY, JSON.stringify(store))
  } catch {
    // Full or unavailable storage: the in-memory verdict still holds for this session.
  }
}

/**
 * `true` only for a monochrome black wordmark. One coloured pixel - a red web, a gold edge - settles it
 * as `false` immediately, so artwork like Spider-Man can never be flattened. `null` means the pixels
 * could not be read (CORS), so the caller keeps the logo as authored instead of guessing.
 */
function measure(img: HTMLImageElement): boolean | null {
  try {
    canvas ??= document.createElement('canvas')
    const c = canvas
    const naturalW = Math.max(1, img.naturalWidth)
    const naturalH = Math.max(1, img.naturalHeight)
    const scale = Math.min(PROBE_PX / naturalW, PROBE_PX / naturalH, 1)
    c.width = Math.max(1, Math.round(naturalW * scale))
    c.height = Math.max(1, Math.round(naturalH * scale))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let opaque = 0
    let black = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= ALPHA_MIN) continue
      opaque++
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      const high = r > g ? (r > b ? r : b) : g > b ? g : b
      const low = r < g ? (r < b ? r : b) : g < b ? g : b
      if (high - low >= CHROMA_MAX) return false
      if (r < BLACK_MAX && g < BLACK_MAX && b < BLACK_MAX) black++
    }
    if (opaque === 0) return false
    return black / opaque >= BLACK_SHARE
  } catch {
    // tainted canvas (no CORS): leave the logo as is and stop retrying it this session
    return null
  }
}

/**
 * Judge the `<img>` a component already loaded: no extra request, no extra decode. Returns `null` when
 * the pixels are unreadable, so the caller keeps the logo as authored.
 */
export function probeLoadedLogo(src: string, img: HTMLImageElement): boolean | null {
  const known = verdicts.get(src)
  if (known !== undefined) return known
  if (unreadable.has(src)) return null
  const verdict = measure(img)
  if (verdict === null) unreadable.add(src)
  else remember(src, verdict)
  return verdict
}

/** Offscreen probe for a logo the page has not loaded yet (or draws through a mask). */
function probeSrc(src: string): Promise<boolean | null> {
  if (!PROBEABLE.test(src)) {
    unreadable.add(src)
    return Promise.resolve(null)
  }
  const pending = inflight.get(src)
  if (pending) return pending
  const probe = new Promise<boolean | null>((resolve) => {
    const image = new window.Image()
    image.decoding = 'async'
    // The artwork pipeline answers with `Access-Control-Allow-Origin: *` (metahub and TMDB alike), so
    // the pixels stay readable; a failure resolves `null` and never persists a wrong verdict.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const verdict = measure(image)
      if (verdict === null) unreadable.add(src)
      else remember(src, verdict)
      resolve(verdict)
    }
    image.onerror = () => {
      unreadable.add(src)
      resolve(null)
    }
    image.src = src
  })
  inflight.set(src, probe)
  return probe
}

/**
 * Verdict for a wordmark, seeded from the cache so a known logo paints white on its first frame. An
 * unknown one is probed once, offscreen, and the result only re-renders the lockup itself.
 */
export function useLogoIsBlack(src?: string): boolean {
  const [black, setBlack] = useState(() => (src ? cachedLogoIsBlack(src) : false))

  useEffect(() => {
    if (!src) return
    if (verdicts.has(src) || unreadable.has(src)) {
      setBlack(cachedLogoIsBlack(src))
      return
    }
    let live = true
    probeSrc(src).then((verdict) => {
      if (!live || verdict === null) return
      setBlack(verdict)
    })
    return () => {
      live = false
    }
  }, [src])

  return black
}
