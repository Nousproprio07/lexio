import { describe, expect, it } from 'vitest'
import {
  buildQuestions,
  canAskMultipleChoice,
  computeScore,
  computeStreak,
  hardestWords,
  maskTerm,
  NEW_WORDS_PER_SMART_SESSION,
  pickDistractors,
  seededRng,
  selectWords,
  type SessionFilters,
  type SessionSize,
} from '../src/lib/quiz'
import { isCorrectAnswer, normalizeAnswer } from '../src/lib/normalize'
import { review } from '../src/lib/srs'
import type { Word, WordProgress } from '../src/lib/types'

const now = new Date(2026, 9, 16, 12)

let n = 0
function word(term: string, definition: string, categoryId: string | null = null): Word {
  n++
  const d = new Date(2026, 0, 1, 0, n).toISOString()
  return { id: `id-${n}`, term, definition, example: null, categoryId, createdAt: d, updatedAt: d }
}

const dict = [
  word('Résilience', 'Capacité à surmonter une difficulté et à retrouver un équilibre après une épreuve.', 'fr'),
  word('Éphémère', 'Qui ne dure que très peu de temps.', 'fr'),
  word('Inflation', 'Hausse générale et durable des prix.', 'eco'),
  word('Ubiquité', 'Fait d’être présent en plusieurs lieux à la fois.', 'fr'),
  word('Liquidité', 'Facilité avec laquelle un actif se convertit en monnaie.', 'eco'),
  word('Sérendipité', 'Découverte heureuse faite par hasard.', 'fr'),
]

const noFilter: SessionFilters = { categoryId: null, onlyUnmastered: false, smart: false }
const catName = (id: string | null) => id

describe('validation des réponses (mode A)', () => {
  it('ignore la casse, les espaces superflus et la ponctuation finale', () => {
    expect(isCorrectAnswer('  résilience ', ['Résilience'], false)).toBe(true)
    expect(isCorrectAnswer('RÉSILIENCE.', ['Résilience'], false)).toBe(true)
    expect(isCorrectAnswer('chemin  de   fer', ['Chemin de fer'], false)).toBe(true)
  })

  it('gère les accents selon le réglage', () => {
    expect(isCorrectAnswer('resilience', ['Résilience'], false)).toBe(false)
    expect(isCorrectAnswer('resilience', ['Résilience'], true)).toBe(true)
  })

  it('normalise apostrophes typographiques et ligatures', () => {
    expect(isCorrectAnswer("aujourd'hui", ['Aujourd’hui'], false)).toBe(true)
    expect(isCorrectAnswer('oeuvre', ['Œuvre'], false)).toBe(true)
    expect(normalizeAnswer('arc - en - ciel', false)).toBe('arc-en-ciel')
  })

  it('refuse les réponses vides et les synonymes non enregistrés', () => {
    expect(isCorrectAnswer('   ', ['Résilience'], true)).toBe(false)
    expect(isCorrectAnswer('Endurance', ['Résilience'], true)).toBe(false)
    expect(isCorrectAnswer('Résilienc', ['Résilience'], true)).toBe(false)
  })

  it('masque le mot dans sa propre définition', () => {
    expect(maskTerm('La Résilience désigne…', 'résilience')).toBe('La … désigne…')
    expect(maskTerm('Les résiliences', 'résilience')).toBe('Les résiliences')
  })
})

describe('génération des questions', () => {
  it('mode B : 4 propositions, une seule correcte, tirées du dictionnaire', () => {
    const rng = seededRng(1)
    for (const target of dict) {
      const [q] = buildQuestions([target], dict, 'definition', catName, rng)
      expect(q.kind).toBe('definition')
      expect(q.options).toHaveLength(4)
      expect(q.options[q.correctIndex].text).toBe(target.definition)
      const defs = q.options.map((o) => o.text)
      expect(new Set(defs).size).toBe(4)
      expect(defs.filter((d) => d === target.definition)).toHaveLength(1)
      for (const d of defs) expect(dict.some((w) => w.definition === d)).toBe(true)
    }
  })

  it('n’utilise jamais comme leurre une définition identique ni un homonyme', () => {
    const twin = word('Résilience', 'Capacité d’un matériau à reprendre sa forme.', 'physique')
    const same = word('Endurance', dict[0].definition)
    const all = [...dict, twin, same]
    for (let s = 0; s < 50; s++) {
      const d = pickDistractors(dict[0], all, seededRng(s))
      expect(d.map((w) => w.id)).not.toContain(twin.id)
      expect(d.map((w) => w.id)).not.toContain(same.id)
    }
  })

  it('bascule en exercice de rappel quand le dictionnaire est trop petit', () => {
    const small = dict.slice(0, 3)
    expect(canAskMultipleChoice(small[0], small)).toBe(false)
    const qs = buildQuestions(small, small, 'definition', catName, seededRng(2))
    expect(qs.every((q) => q.kind === 'recall' && q.options.length === 0)).toBe(true)
  })

  it('mode mixte : alterne définition→mot et mot→définition', () => {
    const qs = buildQuestions(dict, dict, 'mixed', catName, seededRng(3))
    expect(qs.map((q) => q.kind)).toEqual(['word', 'definition', 'word', 'definition', 'word', 'definition'])
  })

  it('mode A : accepte les mots enregistrés partageant exactement la définition', () => {
    const syn = word('Ressort', dict[0].definition)
    const [q] = buildQuestions([dict[0]], [...dict, syn], 'word', catName, seededRng(4))
    expect(q.accepted.sort()).toEqual(['Ressort', 'Résilience'])
  })
})

describe('sélection des mots', () => {
  it('ne répète aucun mot dans une session et respecte la taille', () => {
    for (const size of [5, 10, 20, 'all'] as const) {
      const sel = selectWords(dict, new Map(), noFilter, size, now, seededRng(5))
      expect(sel.length).toBe(size === 'all' ? dict.length : Math.min(size, dict.length))
      expect(new Set(sel.map((w) => w.id)).size).toBe(sel.length)
    }
  })

  it('filtre par catégorie et exclut les mots maîtrisés sur demande', () => {
    const progress = new Map<string, WordProgress>()
    progress.set(dict[0].id, { ...review(null, dict[0].id, true, now), status: 'mastered' })
    const eco = selectWords(dict, progress, { ...noFilter, categoryId: 'eco' }, 'all', now, seededRng(6))
    expect(eco.every((w) => w.categoryId === 'eco')).toBe(true)
    const unmastered = selectWords(dict, progress, { ...noFilter, onlyUnmastered: true }, 'all', now, seededRng(6))
    expect(unmastered.map((w) => w.id)).not.toContain(dict[0].id)
  })

  it('les mots maîtrisés ne passent qu’après les autres', () => {
    const progress = new Map<string, WordProgress>()
    for (const w of dict.slice(0, 4)) progress.set(w.id, { ...review(null, w.id, true, now), status: 'mastered', dueAt: new Date(2027, 0, 1).toISOString() })
    const sel = selectWords(dict, progress, noFilter, 2 as unknown as SessionSize, now, seededRng(7))
    expect(sel.map((w) => w.id).sort()).toEqual([dict[4].id, dict[5].id].sort())
  })

  it('révision intelligente : seulement les mots dus, mots à renforcer en priorité, nouveaux limités', () => {
    const many = Array.from({ length: 30 }, (_, i) => word(`Mot${i}`, `Définition ${i}`))
    const progress = new Map<string, WordProgress>()
    // 5 mots revus avec succès aujourd'hui (pas dus avant demain)
    for (const w of many.slice(0, 5)) progress.set(w.id, review(null, w.id, true, now))
    // 2 mots ratés
    for (const w of many.slice(5, 7)) progress.set(w.id, review(null, w.id, false, now))
    const sel = selectWords(many, progress, { ...noFilter, smart: true }, 'all', now, seededRng(8))
    const ids = new Set(sel.map((w) => w.id))
    for (const w of many.slice(0, 5)) expect(ids.has(w.id)).toBe(false)
    for (const w of many.slice(5, 7)) expect(ids.has(w.id)).toBe(true)
    expect(sel.length).toBe(2 + NEW_WORDS_PER_SMART_SESSION)
    const small = selectWords(many, progress, { ...noFilter, smart: true }, 5, now, seededRng(8))
    expect(small.filter((w) => progress.get(w.id)?.status === 'weak')).toHaveLength(2)
  })
})

describe('score', () => {
  it('se calcule sur les réponses réellement évaluées', () => {
    expect(computeScore([{ correct: true, given: 'a' }, { correct: false, given: 'b' }, undefined, undefined])).toEqual({
      correct: 1,
      evaluated: 2,
      total: 4,
      percent: 50,
    })
    expect(computeScore([]).percent).toBe(0)
    expect(computeScore([{ correct: true, given: null }, { correct: true, given: null }, { correct: false, given: null }]).percent).toBe(67)
  })
})

describe('série de jours et mots difficiles', () => {
  const day = (d: number) => new Date(2026, 9, d, 9)
  it('compte les jours consécutifs jusqu’à aujourd’hui ou hier', () => {
    expect(computeStreak([], now)).toBe(0)
    expect(computeStreak([day(16), day(15), day(14), day(12)], now)).toBe(3)
    expect(computeStreak([day(15), day(14)], now)).toBe(2)
    expect(computeStreak([day(14)], now)).toBe(0)
    expect(computeStreak([day(16), day(16)], now)).toBe(1)
  })

  it('classe les mots par taux d’erreur', () => {
    const progress = new Map<string, WordProgress>()
    let p = review(null, dict[0].id, false, now)
    progress.set(dict[0].id, review(p, dict[0].id, true, now))
    p = review(null, dict[1].id, false, now)
    progress.set(dict[1].id, review(p, dict[1].id, false, now))
    progress.set(dict[2].id, review(null, dict[2].id, true, now))
    expect(hardestWords(dict, progress).map((w) => w.term)).toEqual(['Éphémère', 'Résilience'])
  })
})
