/**
 * Recherche de vraies images (portraits, œuvres, lieux) sur Wikipédia.
 * Seul le texte recherché quitte l'appareil ; l'image choisie est ensuite
 * téléchargée, compressée et chiffrée comme une photo ajoutée à la main.
 */

export interface WikiImage {
  title: string
  description: string | null
  /** Image d'environ 960 px de large, servie par Wikimedia. */
  url: string
}

interface ApiPage {
  index?: number
  title: string
  description?: string
  thumbnail?: { source: string }
}

async function search(lang: 'fr' | 'en', query: string, signal?: AbortSignal): Promise<WikiImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '12',
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '960',
  })
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal })
  if (!res.ok) throw new Error(`Wikipédia a répondu ${res.status}`)
  const data = (await res.json()) as { query?: { pages?: Record<string, ApiPage> } }
  return Object.values(data.query?.pages ?? {})
    .filter((p): p is ApiPage & { thumbnail: { source: string } } => !!p.thumbnail?.source)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({ title: p.title, description: p.description ?? null, url: p.thumbnail.source }))
}

/** Images des articles correspondant à la recherche (français, puis anglais si rien). */
export async function searchWikiImages(query: string, signal?: AbortSignal): Promise<WikiImage[]> {
  const q = query.trim()
  if (!q) return []
  const fr = await search('fr', q, signal)
  return fr.length > 0 ? fr : search('en', q, signal)
}

export async function downloadImage(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error("L'image n'a pas pu être téléchargée.")
  return res.blob()
}

/** Recherche proposée pour une question : la réponse (le nom de l'artiste, du lieu…), ou la question si la réponse est une phrase. */
export function defaultImageQuery(answer: string, question: string): string {
  const a = answer.trim()
  if (a && a.length <= 60) return a
  const subject = question
    .replace(/^(?:qui|quels?|quelles?|où|ou)(?:\s+\S+)*?\s+(?:a peint|a écrit|a sculpté|a composé|est|sont|se trouve(?:nt)?)\s+/iu, '')
    .replace(/\s*\?\s*$/, '')
    .trim()
  return subject || a.slice(0, 60)
}
