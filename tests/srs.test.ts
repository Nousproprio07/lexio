import { describe, expect, it } from 'vitest'
import { deriveStatus, emptyProgress, isDueToday, review, SRS } from '../src/lib/srs'
import type { WordProgress } from '../src/lib/types'

const DAY = 86_400_000
const t0 = new Date(2026, 9, 16, 12, 0, 0) // 16 oct. 2026, midi (heure locale)
const at = (days: number, base = t0) => new Date(base.getTime() + days * DAY)

/** Enchaîne des réponses, chacune au moment où le mot devient dû. */
function playOnTime(answers: boolean[]) {
  let p: WordProgress | null = null
  let now = t0
  for (const ok of answers) {
    p = review(p, 'w', ok, now)
    now = new Date(new Date(p.dueAt!).getTime())
  }
  return p!
}

describe('répétition espacée', () => {
  it('un mot nouveau est immédiatement à réviser', () => {
    expect(isDueToday(undefined, t0)).toBe(true)
    expect(isDueToday(emptyProgress('w'), t0)).toBe(true)
    expect(emptyProgress('w').status).toBe('new')
  })

  it('les réussites à l’échéance espacent les révisions : 1, 3, 7 puis × facilité', () => {
    const intervals: number[] = []
    let p: WordProgress | null = null
    let now = t0
    for (let i = 0; i < 5; i++) {
      p = review(p, 'w', true, now)
      intervals.push(p.intervalDays)
      now = new Date(p.dueAt!)
    }
    expect(intervals.slice(0, 3)).toEqual([1, 3, 7])
    expect(intervals[3]).toBeGreaterThan(14)
    expect(intervals[4]).toBeGreaterThan(intervals[3])
  })

  it('un mot devient maîtrisé à la 4e réussite consécutive à l’échéance', () => {
    expect(playOnTime([true, true, true]).status).toBe('learning')
    expect(playOnTime([true, true, true, true]).status).toBe('mastered')
  })

  it('une erreur rapproche la prochaine révision et marque le mot « à renforcer »', () => {
    const before = playOnTime([true, true, true])
    const now = new Date(before.dueAt!)
    const after = review(before, 'w', false, now)
    expect(after.status).toBe('weak')
    expect(after.streak).toBe(0)
    expect(after.repetitions).toBe(0)
    expect(after.failures).toBe(1)
    expect(new Date(after.dueAt!).getTime() - now.getTime()).toBe(SRS.RELEARN_MINUTES * 60_000)
    expect(after.ease).toBeLessThan(before.ease)
    expect(isDueToday(after, now)).toBe(true)
  })

  it('après une erreur, le mot repart sur un intervalle court', () => {
    const p = review(review(null, 'w', false, t0), 'w', true, at(0.01))
    expect(p.intervalDays).toBe(1)
    expect(p.status).toBe('learning')
  })

  it('répéter un mot plusieurs fois le même jour ne permet pas de le maîtriser', () => {
    let p: WordProgress | null = null
    for (let i = 0; i < 10; i++) p = review(p, 'w', true, new Date(t0.getTime() + i * 60_000))
    expect(p!.successes).toBe(10)
    expect(p!.intervalDays).toBe(1)
    expect(p!.status).toBe('learning')
  })

  it('un mot maîtrisé revient périodiquement (intervalle plafonné)', () => {
    const p = playOnTime(Array(30).fill(true))
    expect(p.status).toBe('mastered')
    expect(p.intervalDays).toBe(SRS.MAX_INTERVAL_DAYS)
    expect(isDueToday(p, at(SRS.MAX_INTERVAL_DAYS, new Date(p.lastReviewedAt!)))).toBe(true)
  })

  it('la facilité reste bornée', () => {
    expect(playOnTime(Array(40).fill(true)).ease).toBeLessThanOrEqual(SRS.MAX_EASE)
    let p: WordProgress | null = null
    for (let i = 0; i < 20; i++) p = review(p, 'w', false, at(i))
    expect(p!.ease).toBe(SRS.MIN_EASE)
  })

  it('est déterministe', () => {
    expect(playOnTime([true, false, true, true])).toEqual(playOnTime([true, false, true, true]))
  })

  it('deriveStatus', () => {
    expect(deriveStatus({ successes: 0, failures: 0, streak: 0, intervalDays: 0 })).toBe('new')
    expect(deriveStatus({ successes: 5, failures: 1, streak: 0, intervalDays: 0 })).toBe('weak')
    expect(deriveStatus({ successes: 4, failures: 0, streak: 4, intervalDays: 7 })).toBe('learning')
    expect(deriveStatus({ successes: 4, failures: 0, streak: 4, intervalDays: 18 })).toBe('mastered')
  })
})
