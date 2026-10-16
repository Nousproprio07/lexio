/**
 * Stockage de Lexio : tout reste sur l'appareil, dans IndexedDB.
 *
 * Chaque espace est ouvert par un code d'accès (voir space.ts) et rangé chiffré
 * sous la clé `space:<identifiant>`. Le contenu de l'espace ouvert est gardé en
 * mémoire et réécrit à chaque modification (une seule écriture à la fois, dans
 * l'ordre). Même avec plusieurs milliers de mots, cela reste instantané.
 *
 * Si IndexedDB est indisponible (navigation privée sur d'anciens navigateurs),
 * l'application fonctionne en mémoire et le signale : `persistent === false`.
 */
import type { Category, QuizAnswer, QuizSession, Word, WordProgress } from '../lib/types'
import { textKey } from '../lib/normalize'
import { DuplicateError, uuid, type Repository, type Snapshot, type WordInput } from './repository'
import { deriveSpaceKey, fromHex, importSpaceKey, open, seal, toHex, type Sealed, type SpaceKey } from './space'

const DB_NAME = 'lexio'
const STORE = 'kv'
const SPACE_PREFIX = 'space:'
/** Dictionnaire d'avant les codes d'accès (non chiffré), rattaché au premier espace créé. */
const UNCLAIMED_KEY = 'db'
/** Ancien stockage du mode démonstration (localStorage), rattaché de la même façon. */
const LEGACY_KEY = 'lexio-demo:v1'
const LEGACY_EXTRA = ['lexio:demo', 'lexio:quiz:demo', 'lexio:outbox:demo', 'lexio:quiz:local', 'lexio:lastBackupAt']
/** Espace ouvert dans cet onglet : le code est redemandé à la fermeture de l'onglet. */
const SESSION_KEY = 'lexio:espace'

interface LocalDb extends Snapshot {
  version: 1
  answers: QuizAnswer[]
  /** Préférences propres à l'espace (session de quiz en cours, date de sauvegarde…). */
  prefs: Record<string, unknown>
}

const empty = (): LocalDb => ({ version: 1, categories: [], words: [], progress: [], sessions: [], answers: [], prefs: {} })

// --- accès clé/valeur : IndexedDB, ou mémoire en repli ------------------------

interface Kv {
  persistent: boolean
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

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

let kvPromise: Promise<Kv> | null = null

function kv(): Promise<Kv> {
  kvPromise ??= openIdb().then(
    (idb): Kv => ({
      persistent: true,
      get: (k) => tx(idb, 'readonly', (s) => s.get(k)),
      put: async (k, v) => void (await tx(idb, 'readwrite', (s) => s.put(v, k))),
      del: async (k) => void (await tx(idb, 'readwrite', (s) => s.delete(k))),
    }),
    (): Kv => {
      const mem = new Map<string, unknown>()
      return {
        persistent: false,
        get: async <T>(k: string) => mem.get(k) as T | undefined,
        put: async (k, v) => void mem.set(k, v),
        del: async (k) => void mem.delete(k),
      }
    },
  )
  return kvPromise
}

/** Prévient les autres onglets ouverts sur le même espace qu'ils doivent relire les données. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lexio') : null

function readLegacy(): Partial<LocalDb> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    return raw ? (JSON.parse(raw) as Partial<LocalDb>) : null
  } catch {
    return null
  }
}

async function readUnclaimed(store: Kv): Promise<Partial<LocalDb> | null> {
  const stored = await store.get<Partial<LocalDb>>(UNCLAIMED_KEY).catch(() => undefined)
  return stored?.words?.length ? stored : readLegacy()
}

function rememberSession(space: SpaceKey | null) {
  try {
    if (space) sessionStorage.setItem(SESSION_KEY, toHex(space.raw))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* le code sera simplement redemandé au rechargement */
  }
}

export type UnlockResult = { ok: true; repo: LocalRepository } | { ok: false; reason: 'not-found' }

export class LocalRepository implements Repository {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private store: Kv,
    private space: SpaceKey,
    private db: LocalDb,
  ) {}

  get persistent() {
    return this.store.persistent
  }

  /** Identifiant de l'espace ouvert (sert aussi à séparer les préférences locales). */
  get spaceId() {
    return this.space.id
  }

  /** Nombre de mots enregistrés avant les codes d'accès, qui rejoindront le premier espace créé. */
  static async unclaimedWordCount(): Promise<number> {
    return (await readUnclaimed(await kv()))?.words?.length ?? 0
  }

  /** Ouvre l'espace correspondant au code ; avec `create`, le crée s'il n'existe pas. */
  static async unlock(code: string, { create = false } = {}): Promise<UnlockResult> {
    const store = await kv()
    const space = await deriveSpaceKey(code)
    const repo = await LocalRepository.load(store, space)
    if (repo) {
      rememberSession(space)
      return { ok: true, repo }
    }
    if (!create) return { ok: false, reason: 'not-found' }

    const unclaimed = await readUnclaimed(store)
    const created = new LocalRepository(store, space, { ...empty(), ...unclaimed, prefs: {}, version: 1 })
    await created.save()
    if (unclaimed) {
      await store.del(UNCLAIMED_KEY).catch(() => {})
      try {
        for (const k of [LEGACY_KEY, ...LEGACY_EXTRA]) localStorage.removeItem(k)
      } catch {
        /* ignoré */
      }
    }
    // demande au navigateur de ne pas effacer ces données en cas de manque d'espace
    void navigator.storage?.persist?.().catch(() => false)
    rememberSession(space)
    return { ok: true, repo: created }
  }

  /** Rouvre l'espace déjà déverrouillé dans cet onglet (rechargement de la page). */
  static async resume(): Promise<LocalRepository | null> {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
    if (!saved || !/^[0-9a-f]{96}$/.test(saved)) return null
    try {
      const repo = await LocalRepository.load(await kv(), await importSpaceKey(fromHex(saved)))
      if (!repo) rememberSession(null)
      return repo
    } catch {
      rememberSession(null)
      return null
    }
  }

  private static async load(store: Kv, space: SpaceKey): Promise<LocalRepository | null> {
    const sealed = await store.get<Sealed>(SPACE_PREFIX + space.id)
    if (!sealed) return null
    const db = await open<LocalDb>(space, sealed).catch(() => {
      throw new Error('Le contenu de cet espace est illisible (données endommagées).')
    })
    return new LocalRepository(store, space, { ...empty(), ...db })
  }

  /** Referme l'espace : le code sera redemandé. */
  lock() {
    rememberSession(null)
  }

  /** Relit le stockage (après une modification faite dans un autre onglet). */
  async refresh(): Promise<void> {
    await this.writing
    const fresh = await LocalRepository.load(this.store, this.space)
    if (fresh) this.db = fresh.db
  }

  onExternalChange(fn: () => void): () => void {
    if (!channel) return () => {}
    const handler = (e: MessageEvent) => {
      if ((e.data as { space?: string } | null)?.space === this.space.id) fn()
    }
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }

  /** Écritures sérialisées ; l'instantané est figé au moment de l'appel (jamais modifié en place). */
  private save(): Promise<void> {
    const snapshot = this.db
    const next = this.writing
      .catch(() => {})
      .then(async () => {
        await this.store.put(SPACE_PREFIX + this.space.id, await seal(this.space, snapshot))
        channel?.postMessage({ space: this.space.id })
      })
    this.writing = next
    return next
  }

  getPref<T>(key: string): T | undefined {
    return this.db.prefs[key] as T | undefined
  }

  async setPref(key: string, value: unknown): Promise<void> {
    const prefs = { ...this.db.prefs }
    if (value === undefined) delete prefs[key]
    else prefs[key] = value
    this.db = { ...this.db, prefs }
    await this.save()
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
