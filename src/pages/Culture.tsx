import { ArrowRightLeft, Globe, ImageIcon, Landmark, Play, Plus, Search, SearchX, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ImageFillDialog } from '../components/ImageFillDialog'
import { QuestionImage } from '../components/QuestionImage'
import { useWordDialogs } from '../components/WordDialogs'
import { EmptyState, PageHeader, plural, StatusBadge } from '../components/ui'
import { looksLikeQuestion } from '../lib/entries'
import { searchKey } from '../lib/normalize'
import { isQuestion, type Status, type Word } from '../lib/types'
import { useData } from '../state/data'

export function CulturePage() {
  const { words, categories, progress, categoryName } = useData()
  const { openNewQuestion, openDetail, openConvert } = useWordDialogs()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filling, setFilling] = useState(false)

  const questions = useMemo(() => words.filter(isQuestion).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [words])
  // questions saisies dans « Mots » avant l'arrivée de cette section
  const misplaced = useMemo(() => words.filter((w) => looksLikeQuestion(w, categoryName(w.categoryId))), [words, categoryName])
  const withoutImage = questions.filter((q) => !q.imageId).length
  const usedCategories = useMemo(() => {
    const used = new Set(questions.map((q) => q.categoryId))
    return categories.filter((c) => used.has(c.id))
  }, [questions, categories])

  const results = useMemo(() => {
    const q = searchKey(deferredQuery.trim())
    return questions.filter((w) => {
      if (category === '__none' ? w.categoryId !== null : category && w.categoryId !== category) return false
      return !q || searchKey(`${w.term} ${w.definition} ${(w.alternates ?? []).join(' ')} ${w.example ?? ''}`).includes(q)
    })
  }, [questions, deferredQuery, category])

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Culture générale"
        subtitle={questions.length > 0 ? plural(questions.length, 'question') : 'Artistes, œuvres, monuments… retrouvez-les grâce aux images.'}
        action={
          <div className="hidden gap-2 md:flex">
            {questions.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/quiz?section=culture')}>
                <Play className="size-4.5 text-brand" aria-hidden />
                S'entraîner
              </button>
            )}
            <button type="button" className="btn-primary" onClick={openNewQuestion}>
              <Plus className="size-4.5" aria-hidden />
              Ajouter une question
            </button>
          </div>
        }
      />

      {misplaced.length > 0 && (
        <section className="card mb-5 border-amber-200 bg-amber-50/60 p-4 md:p-5" aria-labelledby="misplaced-title">
          <h2 id="misplaced-title" className="flex items-center gap-2 font-semibold text-amber-950">
            <ArrowRightLeft className="size-4.5" aria-hidden />
            {misplaced.length > 1 ? `${misplaced.length} questions rangées dans Mots` : '1 question rangée dans Mots'}
          </h2>
          <p className="mt-0.5 text-sm text-amber-900">
            Ces entrées ressemblent à des questions de culture générale. Transformez-les pour les retrouver ici, avec une image si vous le souhaitez.
          </p>
          <ul className="mt-3 divide-y divide-amber-200/70">
            {misplaced.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{w.term}</span>
                  <span className="block truncate text-sm text-muted">{w.definition}</span>
                </span>
                <button type="button" className="btn-secondary h-9 shrink-0 px-3 text-sm" onClick={() => openConvert(w)}>
                  Transformer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {withoutImage > 0 && (
        <button
          type="button"
          onClick={() => setFilling(true)}
          className="card mb-5 flex w-full items-center gap-3 border-brand/30 bg-brand-soft/50 p-4 text-left transition-colors hover:bg-brand-soft"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <Globe className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Ajouter de vraies images</span>
            <span className="block text-sm text-muted">
              {withoutImage > 1 ? `${withoutImage} questions n’ont pas d’image` : '1 question n’a pas d’image'} : portraits d’artistes, œuvres, lieux, depuis
              Wikipédia.
            </span>
          </span>
        </button>
      )}
      <ImageFillDialog open={filling} onClose={() => setFilling(false)} />

      {questions.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-7" />}
          title="Aucune question pour l'instant"
          action={
            <button type="button" className="btn-primary px-6" onClick={openNewQuestion}>
              <Plus className="size-4.5" aria-hidden />
              Ajouter une question
            </button>
          }
        >
          Ajoutez la photo d'un tableau, d'un monument ou d'un portrait, la question et la bonne réponse. Lexio vous la reposera en quiz.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_14rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                className="field pr-10 pl-10"
                placeholder="Rechercher une réponse ou une question"
                aria-label="Rechercher dans la culture générale"
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
            <select aria-label="Catégorie" className="field select py-2 pr-8 pl-3 text-base md:text-[15px]" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Toutes catégories</option>
              {usedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {questions.some((q) => !q.categoryId) && <option value="__none">Sans catégorie</option>}
            </select>
          </div>

          {results.length === 0 ? (
            <EmptyState icon={<SearchX className="size-7" />} title="Aucune question ne correspond">
              Essayez un autre terme ou une autre catégorie.
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {results.map((w) => (
                <li key={w.id}>
                  <QuestionCard word={w} category={categoryName(w.categoryId)} status={progress.get(w.id)?.status ?? 'new'} onOpen={() => openDetail(w)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Ajout rapide (mobile) */}
      <button
        type="button"
        onClick={openNewQuestion}
        aria-label="Ajouter une question"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-2xl bg-brand text-white shadow-(--shadow-pop) transition-transform active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </button>
      {questions.length > 0 && (
        <button type="button" className="btn-secondary mt-5 w-full md:hidden" onClick={() => navigate('/quiz?section=culture')}>
          <Play className="size-4.5 text-brand" aria-hidden />
          S'entraîner sur la culture générale
        </button>
      )}
    </div>
  )
}

function QuestionCard({ word, category, status, onOpen }: { word: Word; category: string | null; status: Status; onOpen: () => void }) {
  return (
    <article className="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-(--shadow-pop)">
      {word.imageId ? (
        <QuestionImage imageId={word.imageId} alt="" fit="cover" className="aspect-[4/3] w-full bg-slate-100" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-brand-soft/60 text-brand/40">
          <ImageIcon className="size-8" aria-hidden />
        </div>
      )}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-3 font-semibold break-words">
          {/* le bouton couvre toute la carte pour ouvrir la fiche */}
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand"
          >
            {word.term}
          </button>
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug break-words text-muted">{word.definition}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <StatusBadge status={status} />
          {category && <span className="truncate rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">{category}</span>}
        </div>
      </div>
    </article>
  )
}
