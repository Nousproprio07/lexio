import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LocalRepository } from '../data/local'
import { DuplicateError, type WordInput } from '../data/repository'
import { sameEntry } from '../lib/entries'
import { textKey } from '../lib/normalize'
import { entryKind, type Category, type EntryKind, type QuizAnswer, type QuizSession, type Word, type WordProgress } from '../lib/types'
import { useToast } from './toast'

/** Écritures produites par une réponse de quiz. */
export type QuizWrite =
  | { kind: 'session'; session: QuizSession }
  | { kind: 'answers'; answers: QuizAnswer[] }
  | { kind: 'progress'; items: WordProgress[] }

export interface WordDraft {
  kind?: EntryKind
  term: string
  definition: string
  example: string | null
  /** Nom de catégorie saisi ; créée à la volée si elle n'existe pas. */
  categoryName: string | null
  imageId?: string | null
  imageCredit?: string | null
  imageAsClue?: boolean
  alternates?: string[]
  keywords?: string[]
}

interface DataApi {
  repo: LocalRepository
  /** Faux si le navigateur refuse le stockage durable (données perdues à la fermeture). */
  persistent: boolean
  /** Identifiant de l'espace ouvert : sépare les préférences locales de chaque espace. */
  scope: string
  /** Referme l'espace et revient à l'écran du code d'accès. */
  lock(): void
  /** Date du dernier export JSON de cet espace (rappel de sauvegarde). */
  lastBackup: string | null
  markBackup(): void
  loading: boolean
  error: string | null
  reload(): void
  categories: Category[]
  /** Toutes les entrées : mots et questions de culture générale. */
  words: Word[]
  wordById: Map<string, Word>
  progress: Map<string, WordProgress>
  sessions: QuizSession[]
  categoryName(id: string | null): string | null
  /** Mot déjà présent avec le même intitulé dans la même catégorie. */
  findDuplicate(draft: WordDraft, ignoreId?: string): Word | undefined
  saveWord(draft: WordDraft, id?: string): Promise<Word>
  /** Enregistre une image (chiffrée) et renvoie son identifiant. */
  saveImage(blob: Blob): Promise<string>
  /** Ajoute une image à une question qui n'en a pas, sans rien modifier d'autre. */
  addImageToQuestion(id: string, image: Blob, credit: string | null, asClue: boolean): Promise<Word>
  deleteWord(id: string): Promise<void>
  renameCategory(id: string, name: string): Promise<void>
  deleteCategory(id: string): Promise<void>
  /** Import en masse ; `progressOf` restitue la progression sauvegardée de chaque entrée. */
  importWords(drafts: WordDraft[], progressOf?: (d: WordDraft, i: number) => Omit<WordProgress, 'wordId'> | undefined): Promise<number>
  /** Écritures de quiz : appliquées à l'écran tout de suite, enregistrées en arrière-plan. */
  recordQuiz(ops: QuizWrite[]): void
}

const DataContext = createContext<DataApi | null>(null)

function toInput(d: WordDraft, categoryId: string | null): WordInput {
  const base = { term: d.term.trim(), definition: d.definition.trim(), example: d.example?.trim() || null, categoryId }
  if (d.kind !== 'question') return base
  return {
    ...base,
    kind: 'question',
    imageId: d.imageId ?? null,
    imageCredit: d.imageId ? (d.imageCredit ?? null) : null,
    imageAsClue: !!d.imageId && !!d.imageAsClue,
    alternates: d.alternates ?? [],
    keywords: d.keywords ?? [],
  }
}

export function DataProvider({ repo, onLock, children }: { repo: LocalRepository; onLock(): void; children: ReactNode }) {
  const scope = repo.spaceId
  const notify = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [words, setWords] = useState<Word[]>([])
  const [progress, setProgress] = useState<Map<string, WordProgress>>(new Map())
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [lastBackup, setLastBackup] = useState(() => repo.getPref<string>('lastBackupAt') ?? null)

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
        setLastBackup(repo.getPref<string>('lastBackupAt') ?? null)
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
      const entry = { ...draft, categoryId: cat?.id ?? null }
      return words.find((w) => w.id !== ignoreId && sameEntry(w, entry))
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
      if (findDuplicate(draft, id)) throw new DuplicateError(entryKind(draft))
      const input = toInput(draft, await ensureCategory(draft.categoryName))
      const saved = id ? await repo.updateWord(id, input) : await repo.createWord(input)
      setWords((ws) => (id ? ws.map((w) => (w.id === id ? saved : w)) : [...ws, saved]))
      return saved
    },
    [repo, findDuplicate, ensureCategory],
  )

  const saveImage = useCallback((blob: Blob) => repo.putImage(blob), [repo])

  const addImageToQuestion = useCallback(
    async (id: string, image: Blob, credit: string | null, asClue: boolean) => {
      const saved = await repo.addImageToQuestion(id, await repo.putImage(image), credit, asClue)
      setWords((ws) => ws.map((w) => (w.id === id ? saved : w)))
      return saved
    },
    [repo],
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
    async (drafts: WordDraft[], progressOf?: (d: WordDraft, i: number) => Omit<WordProgress, 'wordId'> | undefined) => {
      const inputs: WordInput[] = []
      for (const d of drafts) inputs.push(toInput(d, await ensureCategory(d.categoryName)))
      const created = await repo.createWords(inputs)
      setWords((ws) => [...ws, ...created])
      if (progressOf) {
        const items: WordProgress[] = []
        created.forEach((w, i) => {
          const p = progressOf(drafts[i], i)
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

  const lock = useCallback(() => {
    repo.lock()
    onLock()
  }, [repo, onLock])

  const markBackup = useCallback(() => {
    const at = new Date().toISOString()
    setLastBackup(at)
    void repo.setPref('lastBackupAt', at).catch(() => {})
  }, [repo])

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
    lock,
    lastBackup,
    markBackup,
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
    saveImage,
    addImageToQuestion,
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
