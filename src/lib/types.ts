// Types du domaine Lexio, indépendants du stockage (Supabase ou démo).

export type Status = 'new' | 'learning' | 'weak' | 'mastered'

export interface Category {
  id: string
  name: string
  createdAt: string
}

export interface Word {
  id: string
  term: string
  definition: string
  example: string | null
  categoryId: string | null
  createdAt: string
  updatedAt: string
}

export interface WordProgress {
  wordId: string
  successes: number
  failures: number
  /** Réussites consécutives (remis à 0 à chaque erreur). */
  streak: number
  /** Révisions espacées réussies : pilote la croissance de l'intervalle. */
  repetitions: number
  ease: number
  intervalDays: number
  lastReviewedAt: string | null
  dueAt: string | null
  status: Status
}

/** Mode choisi par l'utilisateur pour une session. */
export type QuizMode = 'word' | 'definition' | 'mixed'

/**
 * Type d'une question précise :
 *  - word : définition affichée, saisir le mot (mode A) ;
 *  - definition : mot affiché, choisir parmi 4 définitions (mode B) ;
 *  - recall : mot affiché, révéler la définition puis s'auto-évaluer (repli du mode B).
 */
export type QuestionKind = 'word' | 'definition' | 'recall'

export interface QuizSession {
  id: string
  mode: QuizMode
  questionCount: number
  answeredCount: number
  correctCount: number
  startedAt: string
  finishedAt: string | null
}

export interface QuizAnswer {
  id: string
  sessionId: string
  wordId: string | null
  kind: QuestionKind
  givenAnswer: string | null
  expected: string
  isCorrect: boolean
  answeredAt: string
}

export const STATUS_LABELS: Record<Status, string> = {
  new: 'Nouveau',
  learning: 'En apprentissage',
  weak: 'À renforcer',
  mastered: 'Maîtrisé',
}

export const MODE_LABELS: Record<QuizMode, string> = {
  word: 'Retrouver le mot',
  definition: 'Retrouver la définition',
  mixed: 'Mixte',
}
