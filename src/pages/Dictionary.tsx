import { BookPlus, Pencil, Plus, Search, SearchX, Trash2, X } from 'lucide-react'
import { useDeferredValue, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useWordDialogs } from '../components/WordDialogs'
import { EmptyState, PageHeader, plural, StatusBadge } from '../components/ui'
import { searchKey } from '../lib/normalize'
import { STATUS_LABELS, type Status, type Word } from '../lib/types'
import { useData } from '../state/data'

type Sort = 'recent' | 'oldest' | 'az' | 'za'
const PAGE = 60
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

const filtersKey = (scope: string) => `lexio:dictionary-filters:${scope}`
interface Filters {
  sort: Sort
  category: string // '' = toutes, '__none' = sans catégorie, sinon id
  status: Status | ''
}

function loadFilters(scope: string): Filters {
  try {
    return { sort: 'recent', category: '', status: '', ...JSON.parse(sessionStorage.getItem(filtersKey(scope)) ?? '{}') }
  } catch {
    return { sort: 'recent', category: '', status: '' }
  }
}

export function DictionaryPage() {
  const { words, categories, progress, categoryName, scope } = useData()
  const { openNew, openDetail, openEdit, requestDelete } = useWordDialogs()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(() => loadFilters(scope))
  const [limit, setLimit] = useState(PAGE)
  const deferredQuery = useDeferredValue(query)
  // catégorie mémorisée puis supprimée : retour à « toutes »
  if (filters.category && filters.category !== '__none' && !categories.some((c) => c.id === filters.category)) {
    setFilters((f) => ({ ...f, category: '' }))
  }
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(filtersKey(scope), JSON.stringify(filters))
    } catch {
      /* ignoré */
    }
  }, [filters, scope])

  // index de recherche calculé une fois par version du dictionnaire
  const index = useMemo(
    () =>
      words.map((w) => ({
        w,
        term: searchKey(w.term),
        text: searchKey(`${w.definition} ${w.example ?? ''}`),
      })),
    [words],
  )

  const results = useMemo(() => {
    const q = searchKey(deferredQuery.trim())
    const list: { w: Word; rank: number }[] = []
    for (const item of index) {
      const { w } = item
      if (filters.category === '__none' ? w.categoryId !== null : filters.category && w.categoryId !== filters.category) continue
      if (filters.status && (progress.get(w.id)?.status ?? 'new') !== filters.status) continue
      let rank = 0
      if (q) {
        if (item.term.startsWith(q)) rank = 0
        else if (item.term.includes(q)) rank = 1
        else if (item.text.includes(q)) rank = 2
        else continue
      }
      list.push({ w, rank })
    }
    const cmp: Record<Sort, (a: Word, b: Word) => number> = {
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      az: (a, b) => collator.compare(a.term, b.term),
      za: (a, b) => collator.compare(b.term, a.term),
    }
    return list.sort((a, b) => a.rank - b.rank || cmp[filters.sort](a.w, b.w)).map((x) => x.w)
  }, [index, deferredQuery, filters, progress])

  // remise à zéro de la pagination quand la recherche change
  useEffect(() => {
    setLimit(PAGE)
  }, [deferredQuery, filters])

  // chargement progressif au défilement
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length, limit])

  const filtered = query.trim() !== '' || filters.category !== '' || filters.status !== ''
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Mon dictionnaire"
        subtitle={words.length > 0 ? plural(words.length, 'mot') : undefined}
        action={
          <button type="button" className="btn-primary hidden md:inline-flex" onClick={openNew}>
            <Plus className="size-4.5" aria-hidden />
            Ajouter un mot
          </button>
        }
      />

      {words.length === 0 ? (
        <EmptyState
          icon={<BookPlus className="size-7" />}
          title="Aucun mot pour l'instant"
          action={
            <button type="button" className="btn-primary px-6" onClick={openNew}>
              <Plus className="size-4.5" aria-hidden />
              Ajouter un mot
            </button>
          }
        >
          Chaque mot que vous ajoutez devient automatiquement une question de quiz.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                className="field pr-10 pl-10"
                placeholder="Rechercher un mot ou une définition"
                aria-label="Rechercher dans le dictionnaire"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                enterKeyHint="search"
              />
              {query && (
                <button
                  type="button"
                  className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-slate-100"
                  onClick={() => setQuery('')}
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select label="Trier" value={filters.sort} onChange={(v) => set('sort', v as Sort)}>
                <option value="recent">Plus récents</option>
                <option value="oldest">Plus anciens</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
              </Select>
              <Select label="Catégorie" value={filters.category} onChange={(v) => set('category', v)}>
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__none">Sans catégorie</option>
              </Select>
              <Select label="Maîtrise" value={filters.status} onChange={(v) => set('status', v as Status | '')}>
                <option value="">Tous niveaux</option>
                {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {plural(results.length, 'résultat')}
          </p>

          {results.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-7" />}
              title="Aucun mot ne correspond"
              action={
                filtered && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setQuery('')
                      setFilters((f) => ({ ...f, category: '', status: '' }))
                    }}
                  >
                    Réinitialiser la recherche
                  </button>
                )
              }
            >
              Essayez un autre terme ou modifiez les filtres.
            </EmptyState>
          ) : (
            <>
              {filtered && <p className="mb-3 text-sm text-muted">{plural(results.length, 'mot trouvé', 'mots trouvés')}</p>}
              <ul className="grid gap-3 lg:grid-cols-2">
                {results.slice(0, limit).map((w) => (
                  <li key={w.id}>
                    <WordRow
                      word={w}
                      category={categoryName(w.categoryId)}
                      status={progress.get(w.id)?.status ?? 'new'}
                      onOpen={() => openDetail(w)}
                      onEdit={() => openEdit(w)}
                      onDelete={() => requestDelete(w)}
                    />
                  </li>
                ))}
              </ul>
              {limit < results.length && <div ref={sentinel} className="h-10" aria-hidden />}
            </>
          )}
        </>
      )}

      {/* Ajout rapide (mobile) */}
      <button
        type="button"
        onClick={openNew}
        aria-label="Ajouter un mot"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-2xl bg-brand text-white shadow-(--shadow-pop) transition-transform active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </button>
    </div>
  )
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      className="field select truncate py-2 pr-8 pl-3 text-base md:text-[15px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  )
}

function WordRow({
  word,
  category,
  status,
  onOpen,
  onEdit,
  onDelete,
}: {
  word: Word
  category: string | null
  status: Status
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="card group relative flex h-full gap-2 p-4 transition-shadow hover:shadow-(--shadow-pop)">
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-semibold break-words">
          {/* le bouton couvre toute la carte pour ouvrir la fiche */}
          <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand">
            {word.term}
          </button>
        </h3>
        <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed break-words text-muted">{word.definition}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} />
          {category && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">{category}</span>}
        </div>
      </div>
      <div className="relative z-10 -mt-1 -mr-1 flex shrink-0 flex-col">
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Modifier « ${word.term} »`}>
          <Pencil className="size-4.5" />
        </button>
        <button type="button" className="icon-btn hover:text-danger" onClick={onDelete} aria-label={`Supprimer « ${word.term} »`}>
          <Trash2 className="size-4.5" />
        </button>
      </div>
    </article>
  )
}
