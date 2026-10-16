/**
 * Mode démonstration : stockage local au navigateur, totalement séparé des
 * données Supabase (clé dédiée, aucune synchronisation). Sert à essayer
 * l'application et aux tests de bout en bout. Ce n'est PAS un mode de
 * conservation fiable : l'application l'indique en permanence.
 */
import type { Category, QuizAnswer, QuizSession, Word, WordProgress } from '../lib/types'
import { textKey } from '../lib/normalize'
import { DuplicateError, uuid, type Repository, type Snapshot, type WordInput } from './repository'

export const DEMO_STORAGE_KEY = 'lexio-demo:v1'

interface DemoDb extends Snapshot {
  answers: QuizAnswer[]
}

const empty = (): DemoDb => ({ categories: [], words: [], progress: [], sessions: [], answers: [] })

export class DemoRepository implements Repository {
  readonly kind = 'demo' as const
  private db: DemoDb

  constructor() {
    this.db = empty()
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY)
      if (raw) this.db = { ...empty(), ...(JSON.parse(raw) as Partial<DemoDb>) }
    } catch {
      /* stockage indisponible (navigation privée) : démo en mémoire */
    }
  }

  private save() {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      /* ignoré : la démo continue en mémoire */
    }
  }

  private assertUnique(input: WordInput, ignoreId?: string) {
    const key = textKey(input.term)
    if (this.db.words.some((w) => w.id !== ignoreId && textKey(w.term) === key && w.categoryId === input.categoryId))
      throw new DuplicateError()
  }

  async loadAll(): Promise<Snapshot> {
    const { categories, words, progress, sessions } = structuredClone(this.db)
    return { categories, words, progress, sessions }
  }

  async createCategory(name: string): Promise<Category> {
    if (this.db.categories.some((c) => textKey(c.name) === textKey(name))) throw new DuplicateError()
    const c = { id: uuid(), name, createdAt: new Date().toISOString() }
    this.db.categories.push(c)
    this.save()
    return c
  }

  async renameCategory(id: string, name: string): Promise<void> {
    if (this.db.categories.some((c) => c.id !== id && textKey(c.name) === textKey(name))) throw new DuplicateError()
    this.db.categories = this.db.categories.map((c) => (c.id === id ? { ...c, name } : c))
    this.save()
  }

  async deleteCategory(id: string): Promise<void> {
    const moved = this.db.words.filter((w) => w.categoryId === id)
    for (const w of moved) this.assertUnique({ ...w, categoryId: null }, w.id)
    this.db.categories = this.db.categories.filter((c) => c.id !== id)
    this.db.words = this.db.words.map((w) => (w.categoryId === id ? { ...w, categoryId: null } : w))
    this.save()
  }

  async createWord(input: WordInput): Promise<Word> {
    this.assertUnique(input)
    const now = new Date().toISOString()
    const w: Word = { id: uuid(), ...input, createdAt: now, updatedAt: now }
    this.db.words.push(w)
    this.save()
    return w
  }

  async updateWord(id: string, input: WordInput): Promise<Word> {
    this.assertUnique(input, id)
    const prev = this.db.words.find((w) => w.id === id)
    if (!prev) throw new Error('Mot introuvable.')
    const w: Word = { ...prev, ...input, updatedAt: new Date().toISOString() }
    this.db.words = this.db.words.map((x) => (x.id === id ? w : x))
    this.save()
    return w
  }

  async deleteWord(id: string): Promise<void> {
    this.db.words = this.db.words.filter((w) => w.id !== id)
    this.db.progress = this.db.progress.filter((p) => p.wordId !== id)
    this.db.answers = this.db.answers.map((a) => (a.wordId === id ? { ...a, wordId: null } : a))
    this.save()
  }

  async createWords(inputs: WordInput[]): Promise<Word[]> {
    const out: Word[] = []
    for (const input of inputs) out.push(await this.createWord(input))
    return out
  }

  async upsertProgress(items: WordProgress[]): Promise<void> {
    const ids = new Set(this.db.words.map((w) => w.id))
    for (const p of items) {
      if (!ids.has(p.wordId)) continue
      this.db.progress = [...this.db.progress.filter((x) => x.wordId !== p.wordId), p]
    }
    this.save()
  }

  async upsertSession(s: QuizSession): Promise<void> {
    this.db.sessions = [...this.db.sessions.filter((x) => x.id !== s.id), s]
    this.save()
  }

  async insertAnswers(answers: QuizAnswer[]): Promise<void> {
    const known = new Set(this.db.answers.map((a) => a.id))
    this.db.answers.push(...answers.filter((a) => !known.has(a.id)))
    this.save()
  }
}

/** Jeu d'exemples proposé uniquement en mode démonstration. */
export const DEMO_SAMPLE: { term: string; definition: string; example: string | null; category: string }[] = [
  { term: 'Résilience', definition: "Capacité à surmonter une difficulté et à retrouver un équilibre après une épreuve.", example: 'Elle a fait preuve d’une grande résilience face aux difficultés.', category: 'Français' },
  { term: 'Éphémère', definition: 'Qui ne dure que très peu de temps.', example: 'Un succès éphémère.', category: 'Français' },
  { term: 'Sérendipité', definition: 'Découverte heureuse faite par hasard, en cherchant autre chose.', example: null, category: 'Culture générale' },
  { term: 'Ubiquité', definition: 'Faculté d’être présent en plusieurs lieux à la fois.', example: null, category: 'Français' },
  { term: 'Inflation', definition: 'Hausse générale et durable du niveau des prix.', example: 'L’inflation réduit le pouvoir d’achat.', category: 'Économie' },
  { term: 'Liquidité', definition: 'Facilité avec laquelle un actif peut être converti en monnaie sans perte de valeur.', example: null, category: 'Finance' },
  { term: 'Dividende', definition: 'Part des bénéfices d’une entreprise versée à ses actionnaires.', example: null, category: 'Finance' },
  { term: 'Épistémologie', definition: 'Étude critique des sciences et de la formation des connaissances.', example: null, category: 'Philosophie' },
]
