/**
 * Moteur de quiz : sélection des mots, génération des questions, score.
 * Toutes les fonctions sont pures ; l'aléatoire est injecté (`rng`) pour les tests.
 */
import { isDueToday } from './srs'
import { textKey } from './normalize'
import type { QuestionKind, QuizMode, Status, Word, WordProgress } from './types'

export type Rng = () => number

/** Générateur pseudo-aléatoire reproductible (mulberry32), utilisé dans les tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Sélection des mots d'une session
// ---------------------------------------------------------------------------

export type SessionSize = 5 | 10 | 20 | 'all'

export interface SessionFilters {
  /** `null` = toutes les catégories ; `''` = sans catégorie. */
  categoryId: string | null
  onlyUnmastered: boolean
  smart: boolean
}

/** Nombre maximum de mots nouveaux introduits par une session de révision intelligente. */
export const NEW_WORDS_PER_SMART_SESSION = 10

type ProgressMap = ReadonlyMap<string, WordProgress>

const statusOf = (progress: ProgressMap, id: string): Status => progress.get(id)?.status ?? 'new'

/** Mots correspondant aux filtres de catégorie / maîtrise (avant révision intelligente). */
export function filterPool(words: readonly Word[], progress: ProgressMap, f: SessionFilters): Word[] {
  return words.filter((w) => {
    if (f.categoryId !== null && (w.categoryId ?? '') !== f.categoryId) return false
    if (f.onlyUnmastered && statusOf(progress, w.id) === 'mastered') return false
    return true
  })
}

/** Mots à réviser aujourd'hui (nouveaux inclus). */
export function dueWords(words: readonly Word[], progress: ProgressMap, now: Date): Word[] {
  return words.filter((w) => isDueToday(progress.get(w.id), now))
}

const dueTime = (p: WordProgress | undefined) => (p?.dueAt ? new Date(p.dueAt).getTime() : 0)

/**
 * Choisit les mots d'une session, sans doublon.
 *
 * Révision intelligente : uniquement les mots dus aujourd'hui, par priorité
 *   À renforcer → En apprentissage (les plus en retard d'abord) → Nouveaux
 *   (les plus anciens d'abord, au plus NEW_WORDS_PER_SMART_SESSION) → Maîtrisés dus.
 *
 * Session classique : mots non maîtrisés d'abord (dus avant non dus), puis
 *   maîtrisés dus, puis maîtrisés non dus seulement pour compléter. Ainsi les
 *   mots maîtrisés ne monopolisent jamais une session.
 *
 * L'ordre de présentation final est mélangé.
 */
export function selectWords(
  words: readonly Word[],
  progress: ProgressMap,
  filters: SessionFilters,
  size: SessionSize,
  now: Date,
  rng: Rng,
): Word[] {
  const pool = filterPool(words, progress, filters)
  const limit = size === 'all' ? pool.length : size
  let ordered: Word[]

  if (filters.smart) {
    const due = dueWords(pool, progress, now)
    const by = (s: Status) => due.filter((w) => statusOf(progress, w.id) === s)
    const overdueFirst = (a: Word, b: Word) => dueTime(progress.get(a.id)) - dueTime(progress.get(b.id))
    const fresh = by('new')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, NEW_WORDS_PER_SMART_SESSION)
    ordered = [
      ...by('weak').sort(overdueFirst),
      ...by('learning').sort(overdueFirst),
      ...fresh,
      ...by('mastered').sort(overdueFirst),
    ]
  } else {
    const isDue = (w: Word) => isDueToday(progress.get(w.id), now)
    const mastered = (w: Word) => statusOf(progress, w.id) === 'mastered'
    ordered = [
      ...shuffle(pool.filter((w) => !mastered(w) && isDue(w)), rng),
      ...shuffle(pool.filter((w) => !mastered(w) && !isDue(w)), rng),
      ...shuffle(pool.filter((w) => mastered(w) && isDue(w)), rng),
      ...shuffle(pool.filter((w) => mastered(w) && !isDue(w)), rng),
    ]
  }

  return shuffle(ordered.slice(0, limit), rng)
}

// ---------------------------------------------------------------------------
// Génération des questions
// ---------------------------------------------------------------------------

export interface QuestionOption {
  text: string
  /** Mot dont provient la définition (pour l'explication après réponse). */
  term: string
}

export interface Question {
  id: string
  wordId: string
  kind: QuestionKind
  /** Copie du mot au moment de la session : le quiz reste cohérent si le mot est modifié. */
  term: string
  definition: string
  example: string | null
  categoryName: string | null
  /** Mode A : orthographes acceptées (mots enregistrés partageant exactement cette définition). */
  accepted: string[]
  /** Mode B : quatre propositions mélangées. */
  options: QuestionOption[]
  correctIndex: number
}

export const OPTIONS_COUNT = 4

/**
 * Choisit des définitions incorrectes plausibles, tirées du dictionnaire.
 * Exclut : le mot lui-même, toute entrée de même intitulé (homonyme dans une
 * autre catégorie) et toute définition identique à la bonne réponse — il ne
 * peut donc jamais y avoir deux bonnes réponses. Privilégie la même catégorie
 * et une longueur proche, avec une part d'aléatoire.
 */
export function pickDistractors(target: Word, all: readonly Word[], rng: Rng, count = OPTIONS_COUNT - 1): Word[] {
  const targetTerm = textKey(target.term)
  const seen = new Set([textKey(target.definition)])
  const candidates: { w: Word; score: number }[] = []
  for (const w of all) {
    if (w.id === target.id || textKey(w.term) === targetTerm) continue
    const key = textKey(w.definition)
    if (seen.has(key)) continue
    seen.add(key)
    const lenA = target.definition.length
    const lenB = w.definition.length
    const lengthSimilarity = 1 - Math.abs(lenA - lenB) / Math.max(lenA, lenB, 1)
    const sameCategory = target.categoryId !== null && w.categoryId === target.categoryId ? 1 : 0
    candidates.push({ w, score: sameCategory + lengthSimilarity + rng() * 0.8 })
  }
  if (candidates.length < count) return []
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((c) => c.w)
}

/** Peut-on poser une question à choix multiples sur ce mot ? */
export function canAskMultipleChoice(target: Word, all: readonly Word[]): boolean {
  return pickDistractors(target, all, () => 0).length === OPTIONS_COUNT - 1
}

/** Remplace le mot dans sa propre définition pour ne pas souffler la réponse (mode A). */
export function maskTerm(definition: string, term: string): string {
  const t = term.trim()
  if (t.length < 3) return definition
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // pas de lookbehind : non pris en charge par Safari iOS < 16.4
  return definition.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, 'giu'), '$1…')
}

let questionSeq = 0

export function buildQuestions(
  selected: readonly Word[],
  all: readonly Word[],
  mode: QuizMode,
  categoryName: (id: string | null) => string | null,
  rng: Rng,
): Question[] {
  return selected.map((w, i) => {
    let kind: QuestionKind = mode === 'word' ? 'word' : mode === 'definition' ? 'definition' : i % 2 === 0 ? 'word' : 'definition'
    let options: QuestionOption[] = []
    let correctIndex = -1

    if (kind === 'definition') {
      const distractors = pickDistractors(w, all, rng)
      if (distractors.length === 0) {
        kind = 'recall'
      } else {
        options = shuffle([w, ...distractors], rng).map((d) => ({ text: d.definition, term: d.term }))
        correctIndex = options.findIndex((o) => o.text === w.definition && o.term === w.term)
      }
    }

    const defKey = textKey(w.definition)
    const accepted =
      kind === 'word'
        ? [...new Set([w.term, ...all.filter((o) => textKey(o.definition) === defKey).map((o) => o.term)])]
        : []

    return {
      id: `${Date.now().toString(36)}-${(questionSeq++).toString(36)}-${i}`,
      wordId: w.id,
      kind,
      term: w.term,
      definition: w.definition,
      example: w.example,
      categoryName: categoryName(w.categoryId),
      accepted,
      options,
      correctIndex,
    }
  })
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export interface QuestionResult {
  correct: boolean
  given: string | null
}

export interface Score {
  correct: number
  evaluated: number
  total: number
  percent: number
}

/** Score calculé uniquement sur les réponses réellement évaluées. */
export function computeScore(results: readonly (QuestionResult | undefined | null)[], total = results.length): Score {
  const evaluated = results.filter((r): r is QuestionResult => !!r)
  const correct = evaluated.filter((r) => r.correct).length
  return {
    correct,
    evaluated: evaluated.length,
    total,
    percent: evaluated.length === 0 ? 0 : Math.round((correct / evaluated.length) * 100),
  }
}

// ---------------------------------------------------------------------------
// Série de jours
// ---------------------------------------------------------------------------

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Nombre de jours consécutifs d'apprentissage. La série reste active si le
 * dernier jour d'activité est aujourd'hui ou hier (on a encore la journée pour
 * la prolonger).
 */
export function computeStreak(activityDates: readonly (string | Date)[], now: Date): number {
  const days = new Set(activityDates.map((d) => dayKey(new Date(d))))
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Mots les plus difficiles : le plus d'erreurs, en tenant compte des réussites. */
export function hardestWords(words: readonly Word[], progress: ProgressMap, limit = 5): Word[] {
  return words
    .map((w) => ({ w, p: progress.get(w.id) }))
    .filter((x): x is { w: Word; p: WordProgress } => !!x.p && x.p.failures > 0)
    .sort((a, b) => {
      const ra = a.p.failures / (a.p.failures + a.p.successes)
      const rb = b.p.failures / (b.p.failures + b.p.successes)
      return rb - ra || b.p.failures - a.p.failures
    })
    .slice(0, limit)
    .map((x) => x.w)
}
