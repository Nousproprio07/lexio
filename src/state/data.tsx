import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LocalRepository } from '../data/local'
import { DuplicateError, type WordInput } from '../data/repository'
import { textKey } from '../lib/normalize'
import type { Category, QuizAnswer, QuizSession, Word, WordProgress } from '../lib/types'
import { useToast } from './toast'

/** Écritures produites par une réponse de quiz. */
export type QuizWrite =
  | { kind: 'session'; session: QuizSession }
  | { kind: 'answers'; answers: QuizAnswer[] }
  | { kind: 'progress'; items: WordProgress[] }

export interface WordDraft {
  term: string
  definition: string
  example: string | null
  /** Nom de catégorie saisi ; créée à la volée si elle n'existe pas. */
  categoryName: string | null
}

interface DataApi {
  repo: LocalRepository
  /** Faux si le navigateur refuse le stockage durable (données perdues à la fermeture). */
  persistent: boolean
  scope: string
  loading: boolean
  error: string | null
  reload(): void
  categories: Category[]
  words: Word[]
  wordById: Map<string, Word>
  progress: Map<string, WordProgress>
  sessions: QuizSession[]
  categoryName(id: string | null): string | null
  /** Mot déjà présent avec le même intitulé dans la même catégorie. */
  findDuplicate(draft: WordDraft, ignoreId?: string): Word | undefined
  saveWord(draft: WordDraft, id?: string): Promise<Word>
  deleteWord(id: string): Promise<void>
  renameCategory(id: string, name: string): Promise<void>
  deleteCategory(id: string): Promise<void>
  importWords(drafts: WordDraft[], progress?: Map<string, Omit<WordProgress, 'wordId'>>, key?: (d: WordDraft) => string): Promise<number>
  /** Écritures de quiz : appliquées à l'écran tout de suite, enregistrées en arrière-plan. */
  recordQuiz(ops: QuizWrite[]): void
}

const DataContext = createContext<DataApi | null>(null)

export function DataProvider({ repo, children }: { repo: LocalRepository; children: ReactNode }) {
  const scope = 'local'
  const notify = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [words, setWords] = useState<Word[]>([])
  const [progress, setProgress] = useState<Map<string, WordProgress>>(new Map())
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  // un autre onglet a modifié les données : on les relit sans écran de chargement
  useEffect(
    () =>
      repo.onExternalChange(async () => {
        await repo.refresh()
        const snap = await repo.loadAll()
        setCategories(snap.categories)
        setWords(snap.words)
        setProgress(new Map(snap.progress.map((p) => [p.wordId, p])))
        setSessions(snap.sessions)
      }),
    [repo],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const snap = await repo.loadAll()
        if (cancelled) return
        setCategories(snap.categories)
        setWords(snap.words)
        setProgress(new Map(snap.progress.map((p) => [p.wordId, p])))
        setSessions(snap.sessions)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repo, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const wordById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words])
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const categoryName = useCallback((id: string | null) => (id ? (catById.get(id)?.name ?? null) : null), [catById])

  // les catégories sont lues via une ref dans les actions asynchrones enchaînées (import)
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories

  const findCategory = useCallback(
    (name: string | null) => (name ? categoriesRef.current.find((c) => textKey(c.name) === textKey(name)) : undefined),
    [],
  )

  const findDuplicate = useCallback(
    (draft: WordDraft, ignoreId?: string) => {
      const cat = findCategory(draft.categoryName)
      if (draft.categoryName && !cat) return undefined // nouvelle catégorie : pas de doublon possible
      const key = textKey(draft.term)
      const catId = cat?.id ?? null
      return words.find((w) => w.id !== ignoreId && w.categoryId === catId && textKey(w.term) === key)
    },
    [words, findCategory],
  )

  const ensureCategory = useCallback(
    async (name: string | null): Promise<string | null> => {
      const clean = name?.trim()
      if (!clean) return null
      const existing = findCategory(clean)
      if (existing) return existing.id
      const created = await repo.createCategory(clean)
      categoriesRef.current = [...categoriesRef.current, created]
      setCategories((cs) => [...cs, created].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      return created.id
    },
    [repo, findCategory],
  )

  const saveWord = useCallback(
    async (draft: WordDraft, id?: string) => {
      if (findDuplicate(draft, id)) throw new DuplicateError()
      const input: WordInput = {
        term: draft.term.trim(),
        definition: draft.definition.trim(),
        example: draft.example?.trim() || null,
        categoryId: await ensureCategory(draft.categoryName),
      }
      const saved = id ? await repo.updateWord(id, input) : await repo.createWord(input)
      setWords((ws) => (id ? ws.map((w) => (w.id === id ? saved : w)) : [...ws, saved]))
      return saved
    },
    [repo, findDuplicate, ensureCategory],
  )

  const deleteWord = useCallback(
    async (id: string) => {
      await repo.deleteWord(id)
      setWords((ws) => ws.filter((w) => w.id !== id))
      setProgress((m) => {
        const next = new Map(m)
        next.delete(id)
        return next
      })
    },
    [repo],
  )

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const clean = name.trim()
      const clash = categoriesRef.current.find((c) => c.id !== id && textKey(c.name) === textKey(clean))
      if (clash) throw new DuplicateError()
      await repo.renameCategory(id, clean)
      setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, name: clean } : c)).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    },
    [repo],
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      await repo.deleteCategory(id)
      setCategories((cs) => cs.filter((c) => c.id !== id))
      setWords((ws) => ws.map((w) => (w.categoryId === id ? { ...w, categoryId: null } : w)))
    },
    [repo],
  )

  const importWords = useCallback(
    async (drafts: WordDraft[], restored?: Map<string, Omit<WordProgress, 'wordId'>>, key?: (d: WordDraft) => string) => {
      const inputs: WordInput[] = []
      for (const d of drafts) {
        inputs.push({
          term: d.term.trim(),
          definition: d.definition.trim(),
          example: d.example?.trim() || null,
          categoryId: await ensureCategory(d.categoryName),
        })
      }
      const created = await repo.createWords(inputs)
      setWords((ws) => [...ws, ...created])
      if (restored && key && restored.size > 0) {
        const items: WordProgress[] = []
        created.forEach((w, i) => {
          const p = restored.get(key(drafts[i]))
          if (p) items.push({ ...p, wordId: w.id })
        })
        if (items.length > 0) {
          await repo.upsertProgress(items)
          setProgress((m) => {
            const next = new Map(m)
            for (const p of items) next.set(p.wordId, p)
            return next
          })
        }
      }
      return created.length
    },
    [repo, ensureCategory],
  )

  const recordQuiz = useCallback(
    (ops: QuizWrite[]) => {
      for (const op of ops) {
        if (op.kind === 'progress') {
          setProgress((m) => {
            const next = new Map(m)
            for (const p of op.items) next.set(p.wordId, p)
            return next
          })
        } else if (op.kind === 'session') {
          setSessions((ss) => [...ss.filter((s) => s.id !== op.session.id), op.session])
        }
      }
      void (async () => {
        try {
          for (const op of ops) {
            if (op.kind === 'session') await repo.upsertSession(op.session)
            else if (op.kind === 'answers') await repo.insertAnswers(op.answers)
            else await repo.upsertProgress(op.items)
          }
        } catch {
          notify("Votre réponse n'a pas pu être enregistrée sur l'appareil (espace plein ?).", 'error')
        }
      })()
    },
    [repo, notify],
  )

  const value: DataApi = {
    repo,
    persistent: repo.persistent,
    scope,
    loading,
    error,
    reload,
    categories,
    words,
    wordById,
    progress,
    sessions,
    categoryName,
    findDuplicate,
    saveWord,
    deleteWord,
    renameCategory,
    deleteCategory,
    importWords,
    recordQuiz,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData hors DataProvider')
  return ctx
}
