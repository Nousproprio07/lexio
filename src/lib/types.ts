// Types du domaine Lexio, indépendants du stockage.

export type Status = 'new' | 'learning' | 'weak' | 'mastered'

export interface Category {
  id: string
  name: string
  createdAt: string
}

/**
 * Nature d'une entrée :
 *  - word : un mot et sa définition (section Mots) ;
 *  - question : une question de culture générale, avec une image facultative.
 */
export type EntryKind = 'word' | 'question'

/**
 * Entrée du dictionnaire. Pour une question de culture générale :
 * `term` = la bonne réponse, `definition` = la question posée,
 * `example` = l'explication (« Le saviez-vous ? »).
 */
export interface Word {
  id: string
  /** Absent sur les mots enregistrés avant la culture générale. */
  kind?: EntryKind
  term: string
  definition: string
  example: string | null
  categoryId: string | null
  /** Question : identifiant de l'image (stockée à part, chiffrée). */
  imageId?: string | null
  /** Question : auteur et licence de l'image quand elle vient de Wikipédia / Wikimedia Commons. */
  imageCredit?: string | null
  /**
   * Question : l'image est l'indice (personnage, œuvre à reconnaître) et
   * s'affiche avec la question. Sinon elle illustre la réponse et n'apparaît qu'après.
   */
  imageAsClue?: boolean
  /**
   * Question : seconde image, montrée avec la réponse quand la première est l'indice
   * (le tableau avec la question, le portrait du peintre avec la réponse).
   * Lire et écrire les images via questionImages() / imageFields() (entries.ts).
   */
  answerImageId?: string | null
  answerImageCredit?: string | null
  /** Question : autres réponses acceptées en saisie (« Monet » pour « Claude Monet »). */
  alternates?: string[]
  /** Question à réponse longue : mots-clés à retrouver en saisie (sinon détectés automatiquement). */
  keywords?: string[]
  createdAt: string
  updatedAt: string
}

export const entryKind = (w: Pick<Word, 'kind'>): EntryKind => w.kind ?? 'word'
export const isQuestion = (w: Pick<Word, 'kind'>) => w.kind === 'question'

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
 *  - recall : mot affiché, révéler la définition puis s'auto-évaluer (repli du mode B) ;
 * et pour une question de culture générale (image + question affichées) :
 *  - answer : écrire la réponse ;
 *  - choice : choisir parmi 4 réponses ;
 *  - flash : révéler la réponse puis s'auto-évaluer (repli de choice).
 */
export type QuestionKind = 'word' | 'definition' | 'recall' | 'answer' | 'choice' | 'flash'

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

/** Mêmes modes, appliqués aux questions de culture générale. */
export const CULTURE_MODE_LABELS: Record<QuizMode, string> = {
  word: 'Écrire la réponse',
  definition: 'Choisir la réponse',
  mixed: 'Mixte',
}
