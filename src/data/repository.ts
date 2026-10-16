import type { Category, QuizAnswer, QuizSession, Word, WordProgress } from '../lib/types'

export interface WordInput {
  term: string
  definition: string
  example: string | null
  categoryId: string | null
}

export interface Snapshot {
  categories: Category[]
  words: Word[]
  progress: WordProgress[]
  sessions: QuizSession[]
}

/** Levée quand un mot identique existe déjà dans la même catégorie. */
export class DuplicateError extends Error {
  constructor() {
    super('Ce mot existe déjà dans cette catégorie.')
  }
}

/** Accès aux données (implémentation : LocalRepository, stockage sur l'appareil). */
export interface Repository {
  loadAll(): Promise<Snapshot>
  createCategory(name: string): Promise<Category>
  renameCategory(id: string, name: string): Promise<void>
  deleteCategory(id: string): Promise<void>
  createWord(input: WordInput): Promise<Word>
  updateWord(id: string, input: WordInput): Promise<Word>
  deleteWord(id: string): Promise<void>
  /** Insertion en masse (import). Les doublons doivent avoir été filtrés en amont. */
  createWords(inputs: WordInput[]): Promise<Word[]>
  upsertProgress(items: WordProgress[]): Promise<void>
  upsertSession(session: QuizSession): Promise<void>
  /** Idempotent : une réponse déjà enregistrée (même id) est ignorée. */
  insertAnswers(answers: QuizAnswer[]): Promise<void>
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // repli pour les navigateurs anciens / contextes non sécurisés
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
