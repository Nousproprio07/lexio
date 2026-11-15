import { Check, Search, SearchX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { compressImage } from '../lib/image'
import { downloadImage, searchWikiImages, type WikiImage } from '../lib/wiki'
import { Spinner } from './ui'

/**
 * Recherche d'une vraie image sur Wikipédia : la meilleure est proposée en
 * grand (un toucher pour la valider), les autres en dessous pour la remplacer.
 * Rien n'est jamais choisi sans l'utilisateur. Renvoie l'image compressée et son attribution.
 */
export function WikiImagePicker({ initialQuery, onPick }: { initialQuery: string; onPick: (image: Blob, credit: string | null) => void }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<WikiImage[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const run = useCallback(async (q: string) => {
    abort.current?.abort()
    if (!q.trim()) return
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    setError(null)
    try {
      setResults(await searchWikiImages(q, ctrl.signal))
    } catch (e) {
      if (ctrl.signal.aborted) return
      setResults(null)
      setError(navigator.onLine ? `Recherche impossible : ${e instanceof Error ? e.message : String(e)}` : 'Vous êtes hors ligne : la recherche d’images a besoin d’Internet.')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // recherche lancée d'emblée avec la réponse de la question
  useEffect(() => {
    setQuery(initialQuery)
    setResults(null)
    void run(initialQuery)
    return () => abort.current?.abort()
  }, [initialQuery, run])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void run(query)
  }

  const pick = async (img: WikiImage) => {
    setPicking(img.url)
    setError(null)
    try {
      onPick(await compressImage(await downloadImage(img.url)), img.credit)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* pas de <form> : le sélecteur peut être affiché dans le formulaire de la question */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            className="field pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(e)
            }}
            placeholder="Artiste, œuvre, monument, lieu…"
            aria-label="Rechercher une image sur Wikipédia"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={submit} disabled={loading || !query.trim()}>
          Chercher
        </button>
      </div>
      <p className="text-xs text-muted">Images de Wikipédia. Seul le texte recherché est envoyé ; touchez la bonne photo pour l’ajouter.</p>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center" role="status">
          <Spinner className="size-5 text-brand" />
          <span className="sr-only">Recherche…</span>
        </div>
      ) : results && results.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center text-sm text-muted">
          <SearchX className="size-6" aria-hidden />
          Aucune image trouvée. Essayez un autre nom (« Musée Reina Sofía », « La Joconde »…).
        </div>
      ) : (
        results &&
        results.length > 0 && (
          <div className="space-y-3">
            <figure className="overflow-hidden rounded-2xl border border-brand/40 bg-slate-50">
              <img src={results[0].url} alt={`Image proposée : ${results[0].title}`} className="max-h-72 w-full object-contain" />
              <figcaption className="px-3 py-2">
                <span className="block text-[15px] font-semibold">{results[0].title}</span>
                {results[0].description && <span className="block text-sm text-muted">{results[0].description}</span>}
                {results[0].credit && <span className="mt-0.5 block text-xs break-words text-slate-500">{results[0].credit}</span>}
              </figcaption>
            </figure>
            <button type="button" className="btn-primary h-12 w-full text-base" onClick={() => void pick(results[0])} disabled={picking !== null}>
              {picking === results[0].url ? <Spinner /> : <Check className="size-5" aria-hidden />}
              Valider cette image
            </button>
            {results.length > 1 && (
              <>
                <p className="pt-1 text-sm font-medium text-muted">Ou choisissez une autre image :</p>
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Autres images">
                  {results.slice(1).map((img) => (
                    <li key={img.url}>
                      <button
                        type="button"
                        onClick={() => void pick(img)}
                        disabled={picking !== null}
                        className="group relative block w-full overflow-hidden rounded-xl border border-line bg-slate-50 text-left transition-shadow hover:shadow-(--shadow-pop) focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60"
                        aria-label={`Choisir l’image : ${img.title}`}
                      >
                        <img src={img.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                        <span className="block px-2 py-1.5">
                          <span className="block truncate text-[13px] font-medium">{img.title}</span>
                          {img.description && <span className="block truncate text-xs text-muted">{img.description}</span>}
                        </span>
                        {picking === img.url && (
                          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                            <Spinner className="size-5 text-brand" />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      )}
    </div>
  )
}
