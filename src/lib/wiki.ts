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
  /** Attribution à conserver avec l'image : auteur, licence, source. */
  credit: string | null
}

interface ApiPage {
  index?: number
  title: string
  description?: string
  pageimage?: string
  thumbnail?: { source: string }
}

interface FilePage {
  title: string
  imagerepository?: string
  imageinfo?: { extmetadata?: Record<string, { value?: string } | undefined> }[]
}

const fileKey = (name: string) => name.replace(/^[^:]+:/, '').replace(/_/g, ' ').trim()

/** Texte brut d'un champ HTML des métadonnées Commons. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .trim()
}

/** « Auteur · Licence · Wikimedia Commons (fichier) » */
export function formatCredit(file: string, artist: string | null, license: string | null, shared: boolean): string {
  const author = artist ? plainText(artist).slice(0, 160) : null
  return [author, license ? plainText(license) : null, `${shared ? 'Wikimedia Commons' : 'Wikipédia'}, « ${fileKey(file)} »`]
    .filter(Boolean)
    .join(' · ')
}

/** Auteurs et licences des fichiers, en une requête. */
async function fetchCredits(lang: 'fr' | 'en', files: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (files.length === 0) return out
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: files.map((f) => `File:${f}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  })
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal })
  if (!res.ok) return out
  const data = (await res.json()) as { query?: { pages?: Record<string, FilePage> } }
  for (const p of Object.values(data.query?.pages ?? {})) {
    const meta = p.imageinfo?.[0]?.extmetadata
    if (!meta) continue
    out.set(fileKey(p.title), formatCredit(p.title, meta.Artist?.value ?? null, meta.LicenseShortName?.value ?? null, p.imagerepository === 'shared'))
  }
  return out
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
    piprop: 'thumbnail|name',
    pithumbsize: '960',
  })
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal })
  if (!res.ok) throw new Error(`Wikipédia a répondu ${res.status}`)
  const data = (await res.json()) as { query?: { pages?: Record<string, ApiPage> } }
  const pages = Object.values(data.query?.pages ?? {})
    .filter((p): p is ApiPage & { thumbnail: { source: string } } => !!p.thumbnail?.source)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  // l'attribution est facultative pour l'affichage : en cas d'échec, l'image reste proposée
  const credits = await fetchCredits(lang, [...new Set(pages.map((p) => p.pageimage).filter((f): f is string => !!f))], signal).catch(
    () => new Map<string, string>(),
  )
  return pages.map((p) => ({
    title: p.title,
    description: p.description ?? null,
    url: p.thumbnail.source,
    credit: (p.pageimage && credits.get(fileKey(p.pageimage))) || null,
  }))
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

/**
 * Recherche proposée pour une question : la réponse quand c'est un nom
 * (artiste → portrait, monument ou lieu → photo, œuvre → l'œuvre), sinon le
 * sujet de la question (réponse en forme de phrase, de date ou de nombre).
 */
export function defaultImageQuery(answer: string, question: string): string {
  const a = answer.trim()
  const isName = a.length <= 60 && /\p{L}{2}/u.test(a) && !/^(?:en |le |vers )?\d/i.test(a)
  if (isName) return a
  const subject = question
    .replace(/^(?:qui|quels?|quelles?|où|ou)(?:\s+\S+)*?\s+(?:a peint|a écrit|a sculpté|a composé|est|sont|se trouve(?:nt)?)\s+/iu, '')
    .replace(/\s*\?\s*$/, '')
    .trim()
  return subject || a.slice(0, 60)
}

/**
 * Recherche proposée pour l'image de la question (l'indice) : le sujet de la
 * question (« Qui a peint Guernica ? » → « Guernica »). Si la question désigne
 * simplement l'image (« ce tableau »), on part de la réponse.
 */
export function clueImageQuery(question: string, answer: string): string {
  const subject = question
    .replace(/^(?:qui|quels?|quelles?|où|ou|de qui)(?:\s+\S+)*?\s+(?:a peint|a réalisé|a sculpté|a écrit|a composé|a construit|est l'auteur d[eu]|est l’auteur d[eu]|est|sont|se trouve(?:nt)?)\s+/iu, '')
    .replace(/\s*\?\s*$/, '')
    .trim()
  const demonstrative = /^(?:ce|cet|cette|ces)\s/iu.test(subject) || /^qui est-ce/iu.test(question)
  if (subject && subject !== question.replace(/\s*\?\s*$/, '').trim() && !demonstrative) return subject
  return defaultImageQuery(answer, question)
}
