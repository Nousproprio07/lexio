import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { uuid } from '../data/repository'
import {
  buildQuestions,
  computeScore,
  selectWords,
  shuffle,
  type Question,
  type QuestionResult,
  type SessionFilters,
  type SessionSize,
} from '../lib/quiz'
import { review } from '../lib/srs'
import type { QuizMode, QuizSession } from '../lib/types'
import { useData, type QuizWrite } from './data'

export interface RunConfig {
  mode: QuizMode
  size: SessionSize
  filters: SessionFilters
}

export interface QuizRun {
  version: 1
  sessionId: string
  config: RunConfig
  /** Liste imposée (« Réviser mes erreurs », mots difficiles) : rejouée par « Recommencer ». */
  wordIds: string[] | null
  questions: Question[]
  index: number
  results: (QuestionResult | null)[]
  /** Exercice de rappel : définition révélée, en attente de l'auto-évaluation. */
  revealed: boolean
  startedAt: string
  finishedAt: string | null
}

/** Révision intelligente lancée depuis l'accueil. */
export const SMART_REVIEW: RunConfig = {
  mode: 'mixed',
  size: 20,
  filters: { categoryId: null, onlyUnmastered: false, smart: true },
}

interface QuizApi {
  run: QuizRun | null
  /** Démarre une session. Renvoie false si aucun mot ne correspond. */
  start(config: RunConfig, wordIds?: string[] | null): boolean
  reveal(): void
  /** Enregistre la réponse ; `advance` passe directement à la question suivante. */
  answer(result: QuestionResult, advance?: boolean): void
  next(): void
  abandon(): void
}

const QuizContext = createContext<QuizApi | null>(null)

function loadRun(key: string): QuizRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(key) ?? 'null') as QuizRun | null
    return run?.version === 1 ? run : null
  } catch {
    return null
  }
}

export function QuizProvider({ children }: { children: ReactNode }) {
  const { scope, words, wordById, progress, categoryName, recordQuiz } = useData()
  const storageKey = `lexio:quiz:${scope}`
  const [run, setRun] = useState<QuizRun | null>(() => loadRun(storageKey))

  // conservation de la session en cours (changement de page, rechargement, fermeture)
  useEffect(() => {
    try {
      if (run) localStorage.setItem(storageKey, JSON.stringify(run))
      else localStorage.removeItem(storageKey)
    } catch {
      /* stockage indisponible : la session reste en mémoire */
    }
  }, [run, storageKey])

  const sessionRow = (r: QuizRun): QuizSession => {
    const score = computeScore(r.results)
    return {
      id: r.sessionId,
      mode: r.config.mode,
      questionCount: r.questions.length,
      answeredCount: score.evaluated,
      correctCount: score.correct,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }
  }

  const start = useCallback(
    (config: RunConfig, wordIds: string[] | null = null) => {
      const now = new Date()
      const selected = wordIds
        ? shuffle(
            wordIds.map((id) => wordById.get(id)).filter((w) => w !== undefined),
            Math.random,
          )
        : selectWords(words, progress, config.filters, config.size, now, Math.random)
      if (selected.length === 0) return false
      const questions = buildQuestions(selected, words, config.mode, categoryName, Math.random)
      setRun({
        version: 1,
        sessionId: uuid(),
        config,
        wordIds,
        questions,
        index: 0,
        results: questions.map(() => null),
        revealed: false,
        startedAt: now.toISOString(),
        finishedAt: null,
      })
      return true
    },
    [words, wordById, progress, categoryName],
  )

  const reveal = useCallback(() => setRun((r) => (r ? { ...r, revealed: true } : r)), [])

  const answer = useCallback(
    (result: QuestionResult, advance = false) => {
      if (!run || run.results[run.index]) return
      const q = run.questions[run.index]
      const now = new Date()
      const results = run.results.map((x, i) => (i === run.index ? result : x))
      let next: QuizRun = { ...run, results }
      if (advance) {
        next =
          run.index < run.questions.length - 1
            ? { ...next, index: run.index + 1, revealed: false }
            : { ...next, finishedAt: now.toISOString() }
      }
      const ops: QuizWrite[] = [
        { kind: 'session', session: sessionRow(next) },
        {
          kind: 'answers',
          answers: [
            {
              id: uuid(),
              sessionId: run.sessionId,
              wordId: q.wordId,
              kind: q.kind,
              givenAnswer: result.given,
              expected: q.kind === 'word' ? q.term : q.definition,
              isCorrect: result.correct,
              answeredAt: now.toISOString(),
            },
          ],
        },
      ]
      // le mot a pu être supprimé pendant la session : pas de progression à mettre à jour
      if (wordById.has(q.wordId)) {
        ops.push({ kind: 'progress', items: [review(progress.get(q.wordId), q.wordId, result.correct, now)] })
      }
      setRun(next)
      recordQuiz(ops)
    },
    [run, wordById, progress, recordQuiz],
  )

  const next = useCallback(() => {
    if (!run || !run.results[run.index]) return
    if (run.index < run.questions.length - 1) {
      setRun({ ...run, index: run.index + 1, revealed: false })
      return
    }
    const finished = { ...run, finishedAt: new Date().toISOString() }
    setRun(finished)
    recordQuiz([{ kind: 'session', session: sessionRow(finished) }])
  }, [run, recordQuiz])

  // Les réponses déjà données sont enregistrées : abandonner ne fait que fermer la session.
  const abandon = useCallback(() => setRun(null), [])

  return <QuizContext.Provider value={{ run, start, reveal, answer, next, abandon }}>{children}</QuizContext.Provider>
}

export function useQuiz() {
  const ctx = useContext(QuizContext)
  if (!ctx) throw new Error('useQuiz hors QuizProvider')
  return ctx
}
