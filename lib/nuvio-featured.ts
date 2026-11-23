import type { HeroSlide } from './launcher-data'

export const NUVIO_PACKAGE = 'com.nuvio.tv'

type Featured = {
  tmdbId: string
  type: 'movie' | 'series'
  title: string
  art: string
  meta: string[]
  synopsis: string
}

// Artwork and metadata come from the TMDB data Nuvio itself uses; images are bundled in /public/artwork.
const FEATURED: Featured[] = [
  {
    tmdbId: '82856',
    type: 'series',
    title: 'The Mandalorian',
    art: 'mandalorian',
    meta: ['2019', '3 Seasons', 'Sci-Fi & Fantasy', '8.4'],
    synopsis:
      'After the fall of the Galactic Empire, lawlessness has spread throughout the galaxy. A lone gunfighter makes his way through the outer reaches, earning his keep as a bounty hunter.',
  },
  {
    tmdbId: '693134',
    type: 'movie',
    title: 'Dune: Part Two',
    art: 'dune',
    meta: ['2024', '2h 47m', 'Science Fiction', '8.1'],
    synopsis:
      'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.',
  },
  {
    tmdbId: '119051',
    type: 'series',
    title: 'Wednesday',
    art: 'wednesday',
    meta: ['2022', '2 Seasons', 'Mystery', '8.3'],
    synopsis:
      'Smart, sarcastic and a little dead inside, Wednesday Addams investigates twisted mysteries while making new friends - and foes - at Nevermore Academy.',
  },
  {
    tmdbId: '569094',
    type: 'movie',
    title: 'Spider-Man: Across the Spider-Verse',
    art: 'spiderverse',
    meta: ['2023', '2h 20m', 'Animation', '8.3'],
    synopsis:
      'After reuniting with Gwen Stacy, Miles Morales is catapulted across the Multiverse, where he encounters the Spider Society, a team of Spider-People charged with protecting its very existence.',
  },
  {
    tmdbId: '100088',
    type: 'series',
    title: 'The Last of Us',
    art: 'lastofus',
    meta: ['2023', '2 Seasons', 'Drama', '8.4'],
    synopsis:
      'Twenty years after modern civilization has been destroyed, Joel is hired to smuggle Ellie, a fourteen year old girl, out of an oppressive quarantine zone.',
  },
]

/** Android intent URI that opens a title's detail page in Nuvio (same deep link the old launcher used). */
function nuvioIntent(item: Featured): string {
  const extras = [
    `S.contentId=tmdb%3A${item.tmdbId}`,
    `S.contentType=${item.type}`,
    'S.launchMode=stream',
    `S.name=${encodeURIComponent(item.title)}`,
  ].join(';')
  return `intent://tmdb/${item.type}/${item.tmdbId}#Intent;scheme=nuvio;action=android.intent.action.VIEW;package=${NUVIO_PACKAGE};${extras};end`
}


function toSlide(item: Featured, backdrop: string, logo: string, eyebrow: string, logoIsAlpha: boolean): HeroSlide {
  return {
    id: `nuvio-${item.tmdbId}`,
    title: item.title,
    backdrop,
    logo,
    service: undefined,
    logoIsAlpha,
    appName: 'Nuvio',
    appIcon: `https://launcher.local/__icon/${NUVIO_PACKAGE}`,
    intentUri: nuvioIntent(item),
    eyebrow,
    meta: item.meta,
    badges: [],
    synopsis: item.synopsis,
  }
}

const bundledSlides = (): HeroSlide[] =>
  FEATURED.map((item) =>
    toSlide(item, `/artwork/${item.art}_backdrop.jpg`, `/artwork/${item.art}_logo.png`, 'Trending on Nuvio', false),
  )

// Nuvio's default catalog source is Cinemeta (Stremio); its "top" lists are ranked by current popularity.
const CATALOG = 'https://cinemeta-catalogs.strem.io/top/catalog'
const TMDB_META = 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/meta'
const CACHE_KEY = 'launcher.trending.v4'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const POOL = 20 // candidates fetched per type
const PER_TYPE = 6 // slides shown per type

type CinemetaMeta = {
  moviedb_id?: number
  name?: string
  description?: string
  logo?: string
  year?: string
  releaseInfo?: string
  runtime?: string
  genres?: string[]
  imdbRating?: string
}

let trending: HeroSlide[] | null = null

function readCache(): HeroSlide[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; slides: HeroSlide[] }
    return parsed.slides?.length ? parsed.slides : null
  } catch {
    return null
  }
}

function cacheAge(): number {
  try {
    return Date.now() - (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').at ?? 0)
  } catch {
    return Infinity
  }
}

async function fetchCatalog(type: 'movie' | 'series'): Promise<HeroSlide[]> {
  const res = await fetch(`${CATALOG}/${type}/top.json`)
  if (!res.ok) throw new Error(`catalog ${res.status}`)
  const { metas } = (await res.json()) as { metas: CinemetaMeta[] }
  const candidates = shuffle(metas
    .filter((m) => m.moviedb_id && m.name && m.description && m.logo)
    .slice(0, POOL))
  const slides: HeroSlide[] = []
  for (let offset = 0; offset < candidates.length && slides.length < PER_TYPE; offset += 4) {
    const batch = await Promise.all(candidates.slice(offset, offset + 4).map(async (m) => {
      try {
        const response = await fetch(`${TMDB_META}/${type}/tmdb:${m.moviedb_id}.json`, {
          signal: AbortSignal.timeout(8000),
        })
        if (!response.ok) throw new Error(`metadata ${response.status}`)
        const { meta } = await response.json() as { meta?: { id?: string; background?: string } }
        if (meta?.id !== `tmdb:${m.moviedb_id}` || !meta.background) return null
        const image = new URL(meta.background)
        if (image.protocol !== 'https:' || image.hostname !== 'image.tmdb.org' ||
            !/^\/t\/p\/original\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(image.pathname)) return null
        // TMDB's standard backdrop is usually unbranded, unlike promotional key art.
        image.pathname = image.pathname.replace('/t/p/original/', '/t/p/w1280/')
        const item: Featured = {
          tmdbId: String(m.moviedb_id),
          type,
          title: m.name!,
          art: '',
          meta: [
            (m.year || m.releaseInfo || '').replace(/\D.*$/, ''),
            type === 'movie' ? m.runtime ?? '' : 'Series',
            ...(m.genres ?? []).slice(0, 2),
            m.imdbRating ?? '',
          ].filter(Boolean),
          synopsis: m.description!,
        }
        return toSlide(item, image.toString(), m.logo ?? '', type === 'movie' ? 'Popular Movie' : 'Popular Series', true)
      } catch (error) {
        console.warn(`Could not load ${type} backdrop for ${m.moviedb_id}`, error)
        return null
      }
    }))
    slides.push(...batch.filter((slide): slide is HeroSlide => slide !== null))
  }
  return slides.slice(0, PER_TYPE)
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Random mix of popular shows and movies, interleaved. Chosen once per session so slides stay stable while browsing. */
function pick(pool: HeroSlide[]): HeroSlide[] {
  const shows = shuffle(pool.filter((s) => s.eyebrow === 'Popular Series')).slice(0, PER_TYPE)
  const movies = shuffle(pool.filter((s) => s.eyebrow === 'Popular Movie')).slice(0, PER_TYPE)
  const out: HeroSlide[] = []
  for (let i = 0; i < PER_TYPE; i++) {
    if (shows[i]) out.push(shows[i])
    if (movies[i]) out.push(movies[i])
  }
  return out
}

/** Fetches the popular pool from the network. Returns true when the visible slides changed. */
export async function refreshTrendingSlides(): Promise<boolean> {
  if (cacheAge() < CACHE_TTL_MS && readCache()) return false
  try {
    const [movies, shows] = await Promise.all([fetchCatalog('movie'), fetchCatalog('series')])
    const pool = [...shows, ...movies]
    if (!pool.length) return false
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), slides: pool }))
    if (trending) return false // keep the current session's slides stable; new pool applies next launch
    trending = pick(pool)
    return true
  } catch (error) {
    console.warn('Could not refresh trending slides', error)
    return false
  }
}

export function nuvioFeaturedSlides(): HeroSlide[] {
  if (!trending) {
    const pool = readCache()
    if (pool) trending = pick(pool)
  }
  return trending?.length ? trending : bundledSlides()
}