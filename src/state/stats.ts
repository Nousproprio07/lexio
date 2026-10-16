import { useMemo } from 'react'
import { computeStreak, dueWords } from '../lib/quiz'
import { useData } from './data'

export function useStats() {
  const { words, progress, sessions } = useData()
  return useMemo(() => {
    const now = new Date()
    let mastered = 0
    for (const w of words) if (progress.get(w.id)?.status === 'mastered') mastered++
    const active = sessions.filter((s) => s.answeredCount > 0)
    const answered = active.reduce((n, s) => n + s.answeredCount, 0)
    const correct = active.reduce((n, s) => n + s.correctCount, 0)
    const finished = sessions
      .filter((s) => s.finishedAt && s.answeredCount > 0)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    return {
      total: words.length,
      mastered,
      due: dueWords(words, progress, now).length,
      streak: computeStreak(active.map((s) => s.startedAt), now),
      studiedToday: active.some((s) => new Date(s.startedAt).toDateString() === now.toDateString()),
      successRate: answered === 0 ? null : Math.round((correct / answered) * 100),
      finishedCount: finished.length,
      recent: finished.slice(-12),
    }
  }, [words, progress, sessions])
}
