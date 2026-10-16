/**
 * Stockage de Lexio : tout reste sur l'appareil, dans IndexedDB.
 *
 * Le dictionnaire entier est gardé en mémoire et réécrit à chaque
 * modification (une seule écriture IndexedDB à la fois, dans l'ordre). Même
 * avec plusieurs milliers de mots, cela reste instantané.
 *
 * Si IndexedDB est indisponible (navigation privée sur d'anciens navigateurs),
 * l'application fonctionne en mémoire et le signale : `persistent === false`.
 */
import type { Category, QuizAnswer, QuizSession, Word, WordProgress } from '../lib/types'
import { textKey } from '../lib/normalize'
import { DuplicateError, uuid, type Repository, type Snapshot, type WordInput } from './repository'

const DB_NAME = 'lexio'
const STORE = 'kv'
const KEY = 'db'
/** Ancien stockage du mode démonstration, migré une fois au premier lancement. */
const LEGACY_KEY = 'lexio-demo:v1'

interface LocalDb extends Snapshot {
  version: 1
  answers: QuizAnswer[]
}

const empty = (): LocalDb => ({ version: 1, categories: [], words: [], progress: [], sessions: [], answers: [] })

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Base locale bloquée par un autre onglet.'))
  })
}

function tx<T>(idb: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    t.oncomplete = () => resolve(req.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Écriture annulée (espace de stockage plein ?).'))
  })
}

/** Prévient les autres onglets ouverts qu'ils doivent relire les données. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lexio') : null

export class LocalRepository implements Repository {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private idb: IDBDatabase | null,
    private db: LocalDb,
  ) {}

  get persistent() {
    return this.idb !== null
  }

  static async open(): Promise<LocalRepository> {
    let idb: IDBDatabase | null = null
    let db = empty()
    try {
      idb = await openIdb()
      const stored = await tx<LocalDb | undefined>(idb, 'readonly', (s) => s.get(KEY))
      if (stored) db = { ...empty(), ...stored }
    } catch {
      idb = null
    }
    const repo = new LocalRepository(idb, db)
    if (db.words.length === 0) await repo.migrateLegacy()
    // demande au navigateur de ne pas effacer ces données en cas de manque d'espace
    void navigator.storage?.persist?.().catch(() => false)
    return repo
  }

  private async migrateLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY)
      if (!raw) return
      this.db = { ...empty(), ...(JSON.parse(raw) as Partial<LocalDb>), version: 1 }
      await this.save()
      if (this.idb) for (const k of [LEGACY_KEY, 'lexio:demo', 'lexio:quiz:demo', 'lexio:outbox:demo']) localStorage.removeItem(k)
    } catch {
      /* migration impossible : l'ancien stockage est laissé intact */
    }
  }

  /** Relit IndexedDB (après une modification faite dans un autre onglet). */
  async refresh(): Promise<void> {
    if (!this.idb) return
    await this.writing
    const stored = await tx<LocalDb | undefined>(this.idb, 'readonly', (s) => s.get(KEY))
    this.db = stored ? { ...empty(), ...stored } : empty()
  }

  onExternalChange(fn: () => void): () => void {
    if (!channel) return () => {}
    const handler = () => fn()
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }

  /** Écritures sérialisées ; IndexedDB copie l'objet au moment de l'appel. */
  private save(): Promise<void> {
    const idb = this.idb
    if (!idb) return Promise.resolve()
    const snapshot = this.db
    const next = this.writing.catch(() => {}).then(async () => {
      await tx(idb, 'readwrite', (s) => s.put(snapshot, KEY))
      channel?.postMessage('changed')
    })
    this.writing = next
    return next
  }

  private assertUnique(input: WordInput, ignoreId?: string, words = this.db.words) {
    const key = textKey(input.term)
    if (words.some((w) => w.id !== ignoreId && textKey(w.term) === key && w.categoryId === input.categoryId))
      throw new DuplicateError()
  }

  async loadAll(): Promise<Snapshot> {
    const { categories, words, progress, sessions } = structuredClone(this.db)
    return { categories, words, progress, sessions }
  }

  async createCategory(name: string): Promise<Category> {
    if (this.db.categories.some((c) => textKey(c.name) === textKey(name))) throw new DuplicateError()
    const c = { id: uuid(), name, createdAt: new Date().toISOString() }
    this.db = { ...this.db, categories: [...this.db.categories, c] }
    await this.save()
    return c
  }

  async renameCategory(id: string, name: string): Promise<void> {
    if (this.db.categories.some((c) => c.id !== id && textKey(c.name) === textKey(name))) throw new DuplicateError()
    this.db = { ...this.db, categories: this.db.categories.map((c) => (c.id === id ? { ...c, name } : c)) }
    await this.save()
  }

  async deleteCategory(id: string): Promise<void> {
    for (const w of this.db.words.filter((w) => w.categoryId === id)) this.assertUnique({ ...w, categoryId: null }, w.id)
    this.db = {
      ...this.db,
      categories: this.db.categories.filter((c) => c.id !== id),
      words: this.db.words.map((w) => (w.categoryId === id ? { ...w, categoryId: null } : w)),
    }
    await this.save()
  }

  async createWord(input: WordInput): Promise<Word> {
    const [w] = await this.createWords([input])
    return w
  }

  async createWords(inputs: WordInput[]): Promise<Word[]> {
    const now = new Date().toISOString()
    const created: Word[] = []
    const words = [...this.db.words]
    for (const input of inputs) {
      this.assertUnique(input, undefined, words)
      const w: Word = { id: uuid(), ...input, createdAt: now, updatedAt: now }
      words.push(w)
      created.push(w)
    }
    this.db = { ...this.db, words }
    await this.save()
    return created
  }

  async updateWord(id: string, input: WordInput): Promise<Word> {
    this.assertUnique(input, id)
    const prev = this.db.words.find((w) => w.id === id)
    if (!prev) throw new Error('Mot introuvable.')
    const w: Word = { ...prev, ...input, updatedAt: new Date().toISOString() }
    this.db = { ...this.db, words: this.db.words.map((x) => (x.id === id ? w : x)) }
    await this.save()
    return w
  }

  async deleteWord(id: string): Promise<void> {
    this.db = {
      ...this.db,
      words: this.db.words.filter((w) => w.id !== id),
      progress: this.db.progress.filter((p) => p.wordId !== id),
      answers: this.db.answers.map((a) => (a.wordId === id ? { ...a, wordId: null } : a)),
    }
    await this.save()
  }

  async upsertProgress(items: WordProgress[]): Promise<void> {
    const ids = new Set(this.db.words.map((w) => w.id))
    const byId = new Map(this.db.progress.map((p) => [p.wordId, p]))
    for (const p of items) if (ids.has(p.wordId)) byId.set(p.wordId, p)
    this.db = { ...this.db, progress: [...byId.values()] }
    await this.save()
  }

  async upsertSession(s: QuizSession): Promise<void> {
    this.db = { ...this.db, sessions: [...this.db.sessions.filter((x) => x.id !== s.id), s] }
    await this.save()
  }

  async insertAnswers(answers: QuizAnswer[]): Promise<void> {
    const known = new Set(this.db.answers.map((a) => a.id))
    this.db = { ...this.db, answers: [...this.db.answers, ...answers.filter((a) => !known.has(a.id))] }
    await this.save()
  }
}
