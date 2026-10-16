/**
 * Import / export du dictionnaire en CSV ou JSON, avec validation.
 */
import type { Category, Word, WordProgress } from './types'
import { textKey } from './normalize'

export const LIMITS = { term: 120, definition: 2000, example: 1000, category: 60 }

export interface ImportRow {
  term: string
  definition: string
  example: string | null
  category: string | null
}

export interface ImportIssue {
  line: number
  message: string
}

export interface ImportParseResult {
  rows: ImportRow[]
  issues: ImportIssue[]
  /** Progression restaurée depuis un export JSON Lexio, indexée par wordKey(). */
  progress?: Map<string, Omit<WordProgress, 'wordId'>>
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180, séparateur « , » ou « ; » détecté automatiquement)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const csvEscape = (v: string) => (/[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function toCsv(words: readonly Word[], categoryName: (id: string | null) => string | null): string {
  const lines = [['mot', 'definition', 'categorie', 'exemple'].join(',')]
  for (const w of words) {
    lines.push([w.term, w.definition, categoryName(w.categoryId) ?? '', w.example ?? ''].map(csvEscape).join(','))
  }
  // BOM : Excel ouvre ainsi correctement les accents
  return '﻿' + lines.join('\r\n') + '\r\n'
}

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  term: ['mot', 'term', 'word', 'terme'],
  definition: ['definition', 'définition', 'def'],
  category: ['categorie', 'catégorie', 'category'],
  example: ['exemple', 'example', "exemple d'utilisation"],
}

function validateRow(raw: Partial<Record<keyof ImportRow, unknown>>, line: number, issues: ImportIssue[]): ImportRow | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : null)
  const term = str(raw.term)
  const definition = str(raw.definition)
  const example = str(raw.example)
  const category = str(raw.category)
  if (term === null || definition === null || example === null || category === null) {
    issues.push({ line, message: 'valeur non textuelle' })
    return null
  }
  if (!term) return issues.push({ line, message: 'mot manquant' }), null
  if (!definition) return issues.push({ line, message: `définition manquante pour « ${term} »` }), null
  if (term.length > LIMITS.term) return issues.push({ line, message: `mot trop long (${LIMITS.term} caractères max.)` }), null
  if (definition.length > LIMITS.definition)
    return issues.push({ line, message: `définition trop longue pour « ${term} »` }), null
  if (example.length > LIMITS.example) return issues.push({ line, message: `exemple trop long pour « ${term} »` }), null
  if (category.length > LIMITS.category) return issues.push({ line, message: `catégorie trop longue pour « ${term} »` }), null
  return { term, definition, example: example || null, category: category || null }
}

export function parseCsvImport(text: string): ImportParseResult {
  const table = parseCsv(text)
  const issues: ImportIssue[] = []
  if (table.length === 0) return { rows: [], issues: [{ line: 1, message: 'fichier vide' }] }
  const header = table[0].map((h) => h.trim().toLocaleLowerCase('fr'))
  const col = (k: keyof ImportRow) => header.findIndex((h) => HEADER_ALIASES[k].includes(h))
  const idx = { term: col('term'), definition: col('definition'), category: col('category'), example: col('example') }
  let body = table.slice(1)
  let offset = 2
  if (idx.term === -1 || idx.definition === -1) {
    // pas d'en-tête reconnu : colonnes dans l'ordre mot, définition, catégorie, exemple
    Object.assign(idx, { term: 0, definition: 1, category: 2, example: 3 })
    body = table
    offset = 1
  }
  const rows: ImportRow[] = []
  body.forEach((r, i) => {
    const get = (j: number) => (j >= 0 ? (r[j] ?? '') : '')
    const row = validateRow(
      { term: get(idx.term), definition: get(idx.definition), category: get(idx.category), example: get(idx.example) },
      i + offset,
      issues,
    )
    if (row) rows.push(row)
  })
  return { rows, issues }
}

// ---------------------------------------------------------------------------
// JSON (format d'export complet de Lexio, ou simple tableau de mots)
// ---------------------------------------------------------------------------

export interface LexioExport {
  app: 'lexio'
  version: 1
  exportedAt: string
  categories: { name: string }[]
  words: { term: string; definition: string; example: string | null; category: string | null; createdAt: string }[]
  progress: (Omit<WordProgress, 'wordId'> & { term: string; category: string | null })[]
}

export function toJsonExport(
  words: readonly Word[],
  categories: readonly Category[],
  progress: ReadonlyMap<string, WordProgress>,
  now: Date,
): LexioExport {
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  const name = (id: string | null) => (id ? (catName.get(id) ?? null) : null)
  return {
    app: 'lexio',
    version: 1,
    exportedAt: now.toISOString(),
    categories: categories.map((c) => ({ name: c.name })),
    words: words.map((w) => ({
      term: w.term,
      definition: w.definition,
      example: w.example,
      category: name(w.categoryId),
      createdAt: w.createdAt,
    })),
    progress: words.flatMap((w) => {
      const p = progress.get(w.id)
      if (!p) return []
      const { wordId: _omit, ...rest } = p
      void _omit
      return [{ ...rest, term: w.term, category: name(w.categoryId) }]
    }),
  }
}

export function parseJsonImport(text: string): ImportParseResult {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { rows: [], issues: [{ line: 0, message: 'JSON invalide' }] }
  }
  const list = Array.isArray(data) ? data : (data as { words?: unknown })?.words
  if (!Array.isArray(list)) return { rows: [], issues: [{ line: 0, message: 'aucune liste de mots trouvée' }] }
  const issues: ImportIssue[] = []
  const rows: ImportRow[] = []
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') return void issues.push({ line: i + 1, message: 'entrée invalide' })
    const o = item as Record<string, unknown>
    const pick = (keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined)
    const row = validateRow(
      {
        term: pick(HEADER_ALIASES.term),
        definition: pick(HEADER_ALIASES.definition),
        category: pick(HEADER_ALIASES.category),
        example: pick(HEADER_ALIASES.example),
      },
      i + 1,
      issues,
    )
    if (row) rows.push(row)
  })
  const progress = parseProgress((data as { progress?: unknown })?.progress)
  return { rows, issues, progress }
}

const STATUSES = new Set(['new', 'learning', 'weak', 'mastered'])

function parseProgress(list: unknown): Map<string, Omit<WordProgress, 'wordId'>> {
  const out = new Map<string, Omit<WordProgress, 'wordId'>>()
  if (!Array.isArray(list)) return out
  const nat = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
  const date = (v: unknown) => (v === null ? null : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : undefined)
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const [successes, failures, streak, repetitions, intervalDays] = [o.successes, o.failures, o.streak, o.repetitions, o.intervalDays].map(nat)
    const lastReviewedAt = date(o.lastReviewedAt)
    const dueAt = date(o.dueAt)
    if (
      typeof o.term !== 'string' ||
      successes === null || failures === null || streak === null || repetitions === null || intervalDays === null ||
      typeof o.ease !== 'number' || o.ease < 1.3 || o.ease > 3 ||
      lastReviewedAt === undefined || dueAt === undefined ||
      typeof o.status !== 'string' || !STATUSES.has(o.status)
    ) continue
    const category = typeof o.category === 'string' ? o.category : null
    out.set(wordKey(o.term, category), {
      successes, failures, streak, repetitions, intervalDays,
      ease: o.ease, lastReviewedAt, dueAt, status: o.status as WordProgress['status'],
    })
  }
  return out
}

/** Clé d'unicité d'un mot : intitulé + catégorie, insensible à la casse. */
export function wordKey(term: string, categoryName: string | null): string {
  return `${textKey(term)}\u0000${categoryName ? textKey(categoryName) : ''}`
}

/** Retire les doublons internes au fichier et ceux déjà présents dans le dictionnaire. */
export function dedupeImport(rows: readonly ImportRow[], existingKeys: ReadonlySet<string>): { fresh: ImportRow[]; duplicates: number } {
  const seen = new Set(existingKeys)
  const fresh: ImportRow[] = []
  for (const r of rows) {
    const k = wordKey(r.term, r.category)
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(r)
  }
  return { fresh, duplicates: rows.length - fresh.length }
}
