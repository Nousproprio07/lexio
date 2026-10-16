import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import type { Category, QuizAnswer, QuizSession, Status, Word, WordProgress } from '../lib/types'
import { DuplicateError, type Repository, type Snapshot, type WordInput } from './repository'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

/** Client public : n'utilise que la clé « anon », protégée par les règles RLS. */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

// --- conversions ligne SQL ⇄ objet du domaine --------------------------------

type Row = Record<string, unknown>

const toCategory = (r: Row): Category => ({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string })

const toWord = (r: Row): Word => ({
  id: r.id as string,
  term: r.term as string,
  definition: r.definition as string,
  example: (r.example as string | null) ?? null,
  categoryId: (r.category_id as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

const toProgress = (r: Row): WordProgress => ({
  wordId: r.word_id as string,
  successes: r.successes as number,
  failures: r.failures as number,
  streak: r.streak as number,
  repetitions: r.repetitions as number,
  ease: r.ease as number,
  intervalDays: r.interval_days as number,
  lastReviewedAt: (r.last_reviewed_at as string | null) ?? null,
  dueAt: (r.due_at as string | null) ?? null,
  status: r.status as Status,
})

const toSession = (r: Row): QuizSession => ({
  id: r.id as string,
  mode: r.mode as QuizSession['mode'],
  questionCount: r.question_count as number,
  answeredCount: r.answered_count as number,
  correctCount: r.correct_count as number,
  startedAt: r.started_at as string,
  finishedAt: (r.finished_at as string | null) ?? null,
})

const wordRow = (w: WordInput) => ({
  term: w.term,
  definition: w.definition,
  example: w.example,
  category_id: w.categoryId,
})

function check(error: PostgrestError | null): void {
  if (!error) return
  if (error.code === '23505') throw new DuplicateError()
  throw new Error(error.message)
}

const PAGE = 1000 // limite par défaut de l'API Supabase

/** Lit toutes les lignes d'une table par pages de 1000 (au-delà, l'API tronque). */
async function selectAll(client: SupabaseClient, table: string, order: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(order, { ascending: true })
      .range(from, from + PAGE - 1)
    check(error)
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) return out
  }
}

export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const
  constructor(private client: SupabaseClient) {}

  async loadAll(): Promise<Snapshot> {
    const [categories, words, progress, sessions] = await Promise.all([
      selectAll(this.client, 'categories', 'name'),
      selectAll(this.client, 'words', 'created_at'),
      selectAll(this.client, 'word_progress', 'word_id'),
      selectAll(this.client, 'quiz_sessions', 'started_at'),
    ])
    return {
      categories: categories.map(toCategory),
      words: words.map(toWord),
      progress: progress.map(toProgress),
      sessions: sessions.map(toSession),
    }
  }

  async createCategory(name: string): Promise<Category> {
    const { data, error } = await this.client.from('categories').insert({ name }).select().single()
    check(error)
    return toCategory(data as Row)
  }

  async renameCategory(id: string, name: string): Promise<void> {
    const { error } = await this.client.from('categories').update({ name }).eq('id', id)
    check(error)
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.client.from('categories').delete().eq('id', id)
    check(error)
  }

  async createWord(input: WordInput): Promise<Word> {
    const { data, error } = await this.client.from('words').insert(wordRow(input)).select().single()
    check(error)
    return toWord(data as Row)
  }

  async updateWord(id: string, input: WordInput): Promise<Word> {
    const { data, error } = await this.client.from('words').update(wordRow(input)).eq('id', id).select().single()
    check(error)
    return toWord(data as Row)
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await this.client.from('words').delete().eq('id', id)
    check(error)
  }

  async createWords(inputs: WordInput[]): Promise<Word[]> {
    const out: Word[] = []
    for (let i = 0; i < inputs.length; i += 500) {
      const { data, error } = await this.client
        .from('words')
        .insert(inputs.slice(i, i + 500).map(wordRow))
        .select()
      check(error)
      out.push(...((data ?? []) as Row[]).map(toWord))
    }
    return out
  }

  async upsertProgress(items: WordProgress[]): Promise<void> {
    if (items.length === 0) return
    const { error } = await this.client.from('word_progress').upsert(
      items.map((p) => ({
        word_id: p.wordId,
        successes: p.successes,
        failures: p.failures,
        streak: p.streak,
        repetitions: p.repetitions,
        ease: p.ease,
        interval_days: p.intervalDays,
        last_reviewed_at: p.lastReviewedAt,
        due_at: p.dueAt,
        status: p.status,
      })),
      { onConflict: 'word_id' },
    )
    // mot supprimé entre-temps (clé étrangère) : rien à enregistrer
    if (error?.code === '23503') return
    check(error)
  }

  async upsertSession(s: QuizSession): Promise<void> {
    const { error } = await this.client.from('quiz_sessions').upsert(
      {
        id: s.id,
        mode: s.mode,
        question_count: s.questionCount,
        answered_count: s.answeredCount,
        correct_count: s.correctCount,
        started_at: s.startedAt,
        finished_at: s.finishedAt,
      },
      { onConflict: 'id' },
    )
    check(error)
  }

  async insertAnswers(answers: QuizAnswer[]): Promise<void> {
    if (answers.length === 0) return
    const rows = (wordIdNull: boolean) =>
      answers.map((a) => ({
        id: a.id,
        session_id: a.sessionId,
        word_id: wordIdNull ? null : a.wordId,
        kind: a.kind,
        given_answer: a.givenAnswer,
        expected: a.expected,
        is_correct: a.isCorrect,
        answered_at: a.answeredAt,
      }))
    let { error } = await this.client.from('quiz_answers').upsert(rows(false), { onConflict: 'id', ignoreDuplicates: true })
    // le mot a été supprimé pendant la session : on garde la réponse, sans lien
    if (error?.code === '23503' && error.message.includes('word')) {
      ;({ error } = await this.client.from('quiz_answers').upsert(rows(true), { onConflict: 'id', ignoreDuplicates: true }))
    }
    check(error)
  }
}
