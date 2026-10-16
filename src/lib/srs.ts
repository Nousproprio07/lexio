/**
 * Répétition espacée de Lexio — variante simplifiée et déterministe de SM-2.
 *
 * Chaque réponse est binaire (réussie / ratée). Pour un mot :
 *
 *  1. Première rencontre : le mot est « Nouveau » et immédiatement à réviser.
 *  2. Réussite lorsque le mot est dû (échéance aujourd'hui ou dépassée) :
 *       repetitions += 1
 *       intervalle = 1 j, puis 3 j, puis 7 j, puis intervalle × facilité
 *       (plafonné à MAX_INTERVAL_DAYS : un mot maîtrisé revient au moins tous
 *       les 4 mois pour vérifier qu'il est toujours connu)
 *       facilité += 0,05 (max 3,0)
 *  3. Réussite anticipée (mot pas encore dû, ex. session « tous les mots ») :
 *       compte comme réussite mais n'allonge pas l'intervalle — on ne
 *       « maîtrise » pas un mot en le répétant dix fois le même jour.
 *  4. Erreur : repetitions = 0, intervalle = 0, facilité −= 0,2 (min 1,3),
 *       prochaine révision dans RELEARN_MINUTES (donc dès la prochaine session).
 *
 * Statut dérivé :
 *  - Nouveau          : jamais évalué ;
 *  - À renforcer      : la dernière réponse était une erreur ;
 *  - Maîtrisé         : ≥ 4 réussites consécutives ET intervalle ≥ 14 jours ;
 *  - En apprentissage : tous les autres cas.
 *
 * Avec des révisions faites à l'échéance, un mot devient donc maîtrisé à la
 * 4e réussite consécutive (intervalles 1 → 3 → 7 → ~18 jours).
 */
import type { Status, WordProgress } from './types'

export const SRS = {
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,
  MAX_EASE: 3.0,
  EASE_UP: 0.05,
  EASE_DOWN: 0.2,
  FIRST_INTERVALS: [1, 3, 7] as const,
  MAX_INTERVAL_DAYS: 120,
  RELEARN_MINUTES: 10,
  MASTERED_STREAK: 4,
  MASTERED_INTERVAL: 14,
}

const DAY_MS = 86_400_000

export function emptyProgress(wordId: string): WordProgress {
  return {
    wordId,
    successes: 0,
    failures: 0,
    streak: 0,
    repetitions: 0,
    ease: SRS.INITIAL_EASE,
    intervalDays: 0,
    lastReviewedAt: null,
    dueAt: null,
    status: 'new',
  }
}

/** Fin de la journée locale contenant `now`. */
export function endOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Un mot est à réviser aujourd'hui s'il est nouveau ou si son échéance tombe avant ce soir. */
export function isDueToday(p: WordProgress | undefined | null, now: Date): boolean {
  if (!p || p.dueAt === null) return true
  return new Date(p.dueAt).getTime() <= endOfDay(now).getTime()
}

export function deriveStatus(p: Pick<WordProgress, 'successes' | 'failures' | 'streak' | 'intervalDays'>): Status {
  if (p.successes + p.failures === 0) return 'new'
  if (p.streak === 0) return 'weak'
  if (p.streak >= SRS.MASTERED_STREAK && p.intervalDays >= SRS.MASTERED_INTERVAL) return 'mastered'
  return 'learning'
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Calcule la nouvelle progression d'un mot après une réponse. Fonction pure. */
export function review(prev: WordProgress | null | undefined, wordId: string, correct: boolean, now: Date): WordProgress {
  const p = prev ? { ...prev } : emptyProgress(wordId)
  const nowIso = now.toISOString()

  if (!correct) {
    p.failures += 1
    p.streak = 0
    p.repetitions = 0
    p.intervalDays = 0
    p.ease = round2(Math.max(SRS.MIN_EASE, p.ease - SRS.EASE_DOWN))
    p.dueAt = new Date(now.getTime() + SRS.RELEARN_MINUTES * 60_000).toISOString()
  } else {
    const due = isDueToday(prev, now)
    p.successes += 1
    p.streak += 1
    if (due) {
      p.repetitions += 1
      const fixed = SRS.FIRST_INTERVALS[p.repetitions - 1]
      const next = fixed ?? Math.round(Math.max(p.intervalDays, 1) * p.ease)
      p.intervalDays = Math.min(SRS.MAX_INTERVAL_DAYS, next)
      p.ease = round2(Math.min(SRS.MAX_EASE, p.ease + SRS.EASE_UP))
      p.dueAt = new Date(now.getTime() + p.intervalDays * DAY_MS).toISOString()
    }
    // réussite anticipée : intervalle et échéance inchangés
  }

  p.lastReviewedAt = nowIso
  p.status = deriveStatus(p)
  return p
}
