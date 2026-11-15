/**
 * Correction des réponses écrites en culture générale.
 *
 * Réponse courte (un nom, un titre) : comparaison exacte, tolérante (voir normalize.ts).
 * Réponse longue (une phrase) : personne ne la retape mot pour mot. On vérifie
 * plutôt qu'elle contient l'essentiel :
 *  - les mots-clés choisis par l'utilisateur pour cette question, tous requis ;
 *  - sinon des mots-clés détectés automatiquement : noms propres et dates
 *    (années, siècles en chiffres romains ou arabes), dont 70 % suffisent ;
 *  - à défaut de noms et de dates, les mots porteurs de sens, dont 60 % suffisent.
 * Accents, majuscules et petites fautes de frappe sont tolérés ; « XII », « 12e »
 * et « XIIe » désignent le même siècle.
 */
import { isCorrectAnswer, stripAccents } from './normalize'

/** Nombre de mots à partir duquel une réponse est corrigée par mots-clés. */
export const LONG_ANSWER_WORDS = 4

const STOPWORDS = new Set(
  (
    "le la les l un une des de du d et ou est sont a à au aux en dans par pour sur avec sans sous qui que qu quoi dont ce cet cette ces " +
    'son sa ses leur leurs il elle ils elles on se s ne pas plus mais donc car ni comme tout tous toute toutes y lui jusqu jusque ' +
    'nos notre vos votre mon ma mes ton ta tes the of and'
  ).split(' '),
)

// siècles et rangs : chiffres romains jusqu'à C (on écarte D et M, trop proches de mots courants)
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }

function romanValue(s: string): number | null {
  if (!/^[ivxlc]+$/.test(s)) return null
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]]
    const next = ROMAN[s[i + 1]] ?? 0
    total += v < next ? -v : v
  }
  // rejette les suites invalides (« iiii », « vx »…) en réécrivant le nombre
  return toRoman(total) === s ? total : null
}

function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ]
  let out = ''
  for (const [v, r] of table) while (n >= v) (out += r), (n -= v)
  return out
}

interface Token {
  /** Texte d'origine, pour l'affichage. */
  raw: string
  /** Minuscules, sans accents. */
  lower: string
  /** Forme comparable : minuscules, sans accents, sans « s » final. */
  key: string
  /** Siècle, rang ou année : valeur numérique, comparée exactement. */
  num: number | null
  capitalized: boolean
}

const ORDINAL = /^(.+?)(?:e|er|re|eme|ieme|em)$/

/**
 * Valeur d'une date ou d'un rang : « 1789 », « 12e », « XIIe », « xix ».
 * `strict` (réponse attendue) : un chiffre romain doit être écrit en majuscules
 * ou suivi de « siècle », pour ne pas lire « vie » comme VI.
 */
function numberOf(raw: string, word: string, nextWord: string | undefined, strict: boolean): number | null {
  if (/^\d+$/.test(word)) return Number(word)
  const ord = ORDINAL.exec(word)
  if (ord && /^\d+$/.test(ord[1])) return Number(ord[1])
  const base = ord && romanValue(ord[1]) !== null ? ord[1] : word
  const value = romanValue(base)
  if (value === null) return null
  const beforeCentury = !!nextWord?.startsWith('siecl')
  if (strict) return beforeCentury || (base.length >= 2 && raw.startsWith(base.toUpperCase())) ? value : null
  // réponse saisie : « xixe », « xx », ou « xix siècle » ; une lettre seule (« i », « v ») n'est pas un nombre
  return base !== word || base.length >= 2 || beforeCentury ? value : null
}

export function tokenize(text: string, strict = false): Token[] {
  const words = text
    .normalize('NFC')
    .replace(/[’`´]/g, "'")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const plain = words.map((w) => stripAccents(w.toLocaleLowerCase('fr')))
  return words.map((raw, i) => {
    const lower = plain[i]
    return {
      raw,
      lower,
      key: lower.length > 3 ? lower.replace(/[sx]$/, '') : lower,
      num: numberOf(raw, lower, plain[i + 1], strict),
      capitalized: /^\p{Lu}/u.test(raw),
    }
  })
}

/** Distance d'édition bornée (petites fautes de frappe). */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true
  const max = Math.min(a.length, b.length) >= 7 ? 2 : Math.min(a.length, b.length) >= 5 ? 1 : 0
  if (max === 0 || Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] <= max
}

function tokenFound(expected: Token, given: Token[]): boolean {
  if (expected.num !== null) return given.some((g) => g.num === expected.num)
  return given.some((g) => g.num === null && closeEnough(g.key, expected.key))
}

export interface Keyword {
  label: string
  /** Tous les mots de l'expression doivent être présents (« Reina Sofía »). */
  tokens: Token[]
}

const isContent = (t: Token) => t.num !== null || (!STOPWORDS.has(t.lower) && t.lower.length >= 3)

/** Mots-clés détectés : noms propres et dates ; à défaut, les mots porteurs de sens. */
export function autoKeywords(answer: string): { keywords: Keyword[]; essential: boolean } {
  const tokens = tokenize(answer, true).filter(isContent)
  const unique = (list: Token[]) => {
    const seen = new Set<string>()
    return list.filter((t) => {
      const k = t.num !== null ? `#${t.num}` : t.key
      return !seen.has(k) && seen.add(k)
    })
  }
  const essentials = unique(tokens.filter((t) => t.num !== null || t.capitalized))
  if (essentials.length >= 2) return { keywords: essentials.map((t) => ({ label: t.raw, tokens: [t] })), essential: true }
  return { keywords: unique(tokens).map((t) => ({ label: t.raw, tokens: [t] })), essential: false }
}

export const isLongAnswer = (answer: string) => answer.trim().split(/\s+/).length >= LONG_ANSWER_WORDS

export interface Grade {
  correct: boolean
  /** Correction par mots-clés : ce qui a été trouvé ou non. */
  keywords?: { label: string; found: boolean }[]
}

/**
 * Corrige une réponse écrite. `keywords` : mots-clés imposés par l'utilisateur
 * (tous requis) ; sinon, détection automatique pour les réponses longues.
 */
export function gradeAnswer(given: string, accepted: readonly string[], keywords: readonly string[], ignoreAccents: boolean): Grade {
  if (isCorrectAnswer(given, [...accepted], ignoreAccents)) return { correct: true }
  const answer = accepted[0] ?? ''
  if (keywords.length === 0 && !isLongAnswer(answer)) return { correct: false }

  const givenTokens = tokenize(given)
  let list: Keyword[]
  let ratio: number
  if (keywords.length > 0) {
    list = keywords.map((k) => ({ label: k, tokens: tokenize(k, true).filter(isContent) })).filter((k) => k.tokens.length > 0)
    ratio = 1
  } else {
    const auto = autoKeywords(answer)
    list = auto.keywords
    ratio = auto.essential ? 0.7 : 0.6
  }
  if (list.length === 0) return { correct: false }
  const detail = list.map((k) => ({ label: k.label, found: k.tokens.every((t) => tokenFound(t, givenTokens)) }))
  const found = detail.filter((d) => d.found).length
  return { correct: found >= Math.ceil(list.length * ratio - 1e-9), keywords: detail }
}
