import { services, tasteItems as fallbackTaste, type ContinueItem, type TasteItem } from './launcher-data'
import { NUVIO_PACKAGE } from './nuvio-featured'

/**
 * "Your Taste" is built from what the box has actually been watching: the Watch Next rows the shell
 * exposes (Nuvio and any other player that publishes them) supply genre seeds, and the picks are
 * ranked from the same Cinemeta popularity lists Nuvio browses, deep-linking back into Nuvio.
 */

type Kind = 'movie' | 'series'

type CatalogMeta = {
  id?: string
  imdb_id?: string
  type?: string
  name?: string
  poster?: string
  background?: string
  logo?: string
  description?: string
  releaseInfo?: string
  year?: string
  genres?: string[]
  genre?: string[]
  imdbRating?: string
  runtime?: string
  moviedb_id?: number | string
}

const TOP = 'https://cinemeta-catalogs.strem.io/top/catalog'
const SEARCH = 'https://v3-cinemeta.strem.io/catalog'
const META = 'https://v3-cinemeta.strem.io/meta'
const CACHE_KEY = 'launcher.taste.v2'
const CACHE_TTL_MS = 3 * 60 * 60 * 1000
const COUNT = 7
const SEEDS = 4
const ARTWORK = /^https:\/\/images\.metahub\.space\/|^https:\/\/image\.tmdb\.org\//

const KIND_LABEL: Record<Kind, string> = { movie: 'Movie', series: 'Series' }

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function getJson<T>(url: string, timeout = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function genresOf(meta: CatalogMeta): string[] {
  return meta.genres?.length ? meta.genres : meta.genre ?? []
}

function backdropOf(meta: CatalogMeta): string {
  // Posters carry the title's own wordmark, and the deck prints a logo over every card, so the
  // artwork must be text-free: the backdrop is. Large is what survives a 3:4 crop at TV distance.
  return (meta.background ?? '')
    .replace('/background/small/', '/background/large/')
    .replace('/background/medium/', '/background/large/')
}

function tmdbIdOf(meta: CatalogMeta): string {
  if (meta.moviedb_id) return String(meta.moviedb_id)
  return ''
}

function nuvioIntent(meta: CatalogMeta, kind: Kind, tmdbId: string): string {
  const extras = [
    `S.contentId=tmdb%3A${tmdbId}`,
    `S.contentType=${kind}`,
    'S.launchMode=stream',
    `S.name=${encodeURIComponent(meta.name ?? '')}`,
  ].join(';')
  return `intent://tmdb/${kind}/${tmdbId}#Intent;scheme=nuvio;action=android.intent.action.VIEW;package=${NUVIO_PACKAGE};${extras};end`
}

function toTasteItem(meta: CatalogMeta, kind: Kind): TasteItem | null {
  const title = meta.name
  const image = backdropOf(meta)
  const tmdbId = tmdbIdOf(meta)
  if (!title || !image || !tmdbId || !ARTWORK.test(image)) return null
  return {
    id: `taste-${kind}-${tmdbId}`,
    title,
    genre: genresOf(meta)[0] ?? KIND_LABEL[kind],
    year: (meta.releaseInfo ?? meta.year ?? '').replace(/\D.*$/, '') || '—',
    rating: meta.imdbRating ?? '—',
    duration: kind === 'movie' ? meta.runtime ?? 'Film' : 'Series',
    image,
    backdrop: meta.background,
    logo: meta.logo,
    logoIsAlpha: true,
    intentUri: nuvioIntent(meta, kind, tmdbId),
    synopsis: meta.description ?? '',
  }
}

/** Genres of one watched title: reused from the pool when possible, otherwise looked up. */
async function resolveSeed(title: string, pool: CatalogMeta[], preferSeries: boolean): Promise<string[]> {
  const hit = pool.find((meta) => meta.name && normalize(meta.name) === normalize(title))
  if (hit) return genresOf(hit)

  const query = encodeURIComponent(title.trim())
  if (!query) return []
  const order: Kind[] = preferSeries ? ['series', 'movie'] : ['movie', 'series']
  for (const kind of order) {
    const found = await getJson<{ metas?: CatalogMeta[] }>(`${SEARCH}/${kind}/top/search=${query}.json`)
    const match = found?.metas?.find((meta) => meta.name && normalize(meta.name) === normalize(title))
    if (!match?.id) continue
    const meta = await getJson<{ meta?: CatalogMeta }>(`${META}/${kind}/${encodeURIComponent(match.id)}.json`)
    if (meta?.meta) return genresOf(meta.meta)
  }
  return []
}

async function seedGenres(continueItems: ContinueItem[], pool: CatalogMeta[]): Promise<string[]> {
  const seeds = continueItems.slice(0, SEEDS)
  const resolved = await Promise.all(
    // "S5 · E10" style details mark a series, so its title is looked up there first.
    seeds.map((item) => resolveSeed(item.title, pool, /\b[SE]\d/.test(item.detail))),
  )
  const tally = new Map<string, number>()
  for (const genres of resolved) {
    for (const genre of genres) tally.set(genre, (tally.get(genre) ?? 0) + 1)
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([genre]) => genre)
}

async function buildTaste(continueItems: ContinueItem[]): Promise<TasteItem[]> {
  const [movies, series] = await Promise.all([
    getJson<{ metas?: CatalogMeta[] }>(`${TOP}/movie/top.json`),
    getJson<{ metas?: CatalogMeta[] }>(`${TOP}/series/top.json`),
  ])
  const pools: { kind: Kind; metas: CatalogMeta[] }[] = [
    { kind: 'movie', metas: movies?.metas ?? [] },
    { kind: 'series', metas: series?.metas ?? [] },
  ]
  const all = pools.flatMap((pool) => pool.metas)
  if (!all.length) return []

  const seeds = await seedGenres(continueItems, all)
  const seedSet = new Set(seeds)
  const watched = new Set(continueItems.map((item) => normalize(item.title)))

  const ranked = pools.map((pool) => ({
    kind: pool.kind,
    metas: pool.metas
      .map((meta, order) => ({ meta, order, score: genresOf(meta).filter((genre) => seedSet.has(genre)).length }))
      .filter(
        ({ meta }) =>
          meta.name && !watched.has(normalize(meta.name)) && tmdbIdOf(meta) && ARTWORK.test(backdropOf(meta)),
      )
      // Personalised first, then the list's own popularity order.
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ meta }) => meta),
  }))

  // Interleave movies and series so the deck alternates kinds, then drop duplicate titles.
  const seen = new Set<string>()
  const items: TasteItem[] = []
  for (let i = 0; items.length < COUNT && i < ranked[0].metas.length + ranked[1].metas.length; i++) {
    for (const pool of ranked) {
      const meta = pool.metas[i]
      if (!meta?.name) continue
      const key = normalize(meta.name)
      if (seen.has(key)) continue
      const item = toTasteItem(meta, pool.kind)
      if (!item) continue
      seen.add(key)
      items.push(item)
      if (items.length >= COUNT) break
    }
  }
  return items
}

function readCache(): TasteItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; items: TasteItem[] }
    return parsed.items?.length ? parsed.items : null
  } catch {
    return null
  }
}

/** Synchronous list for the first paint: cached picks, otherwise the bundled demo deck. */
export function tasteItemsForSession(): TasteItem[] {
  return readCache() ?? fallbackTaste
}

/** Rebuilds the deck from the latest watch history. Returns true when the visible picks changed. */
export async function refreshTasteItems(continueItems: ContinueItem[]): Promise<boolean> {
  try {
    const age = (() => {
      try {
        return Date.now() - (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').at ?? 0)
      } catch {
        return Infinity
      }
    })()
    if (readCache() && age < CACHE_TTL_MS) return false

    const items = await buildTaste(continueItems)
    if (!items.length) return false
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }))
    return true
  } catch (error) {
    console.warn('Could not refresh Your Taste', error)
    return false
  }
}

/** Attribution for a pick: Cinemeta picks are not tied to a subscription app. */
export function tasteServiceName(item: TasteItem): string {
  return (item.service && services[item.service]?.name) || 'Nuvio'
}
