import { describe, expect, it } from 'vitest'
import { dedupeImport, parseCsv, parseCsvImport, parseJsonImport, toCsv, toJsonExport, wordKey } from '../src/lib/transfer'
import { review } from '../src/lib/srs'
import type { Category, Word } from '../src/lib/types'

const w = (term: string, definition: string, categoryId: string | null, example: string | null = null): Word => ({
  id: term,
  term,
  definition,
  example,
  categoryId,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('CSV', () => {
  it('gère guillemets, virgules, retours à la ligne et séparateur « ; »', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,"2\n3",4')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2\n3', '4'],
    ])
    expect(parseCsv('﻿mot;définition\nx;y')).toEqual([
      ['mot', 'définition'],
      ['x', 'y'],
    ])
  })

  it('aller-retour export → import sans perte', () => {
    const cats = new Map([['c1', 'Économie']])
    const words = [w('Inflation', 'Hausse des prix, "durable"; générale', 'c1', 'Elle a dit :\n« l’inflation »'), w('Aléa', 'Événement imprévisible.', null)]
    const csv = toCsv(words, (id) => (id ? cats.get(id)! : null))
    const { rows, issues } = parseCsvImport(csv)
    expect(issues).toEqual([])
    expect(rows).toEqual([
      { term: 'Inflation', definition: 'Hausse des prix, "durable"; générale', category: 'Économie', example: 'Elle a dit :\n« l’inflation »' },
      { term: 'Aléa', definition: 'Événement imprévisible.', category: null, example: null },
    ])
  })

  it('signale les lignes invalides avec leur numéro', () => {
    const { rows, issues } = parseCsvImport('mot,definition\nA,\n,B\nC,D\n' + 'x'.repeat(130) + ',E')
    expect(rows.map((r) => r.term)).toEqual(['C'])
    expect(issues.map((i) => i.line)).toEqual([2, 3, 5])
  })

  it('accepte un fichier sans en-tête', () => {
    expect(parseCsvImport('Mot,Déf').rows).toEqual([{ term: 'Mot', definition: 'Déf', category: null, example: null }])
  })
})

describe('JSON', () => {
  it('aller-retour avec progression', () => {
    const cats: Category[] = [{ id: 'c1', name: 'Finance', createdAt: '' }]
    const words = [w('Liquidité', 'Facilité de conversion en monnaie.', 'c1')]
    const progress = new Map([['Liquidité', review(null, 'Liquidité', true, new Date(2026, 9, 1))]])
    const json = JSON.stringify(toJsonExport(words, cats, progress, new Date()))
    const res = parseJsonImport(json)
    expect(res.issues).toEqual([])
    expect(res.rows).toEqual([{ term: 'Liquidité', definition: 'Facilité de conversion en monnaie.', category: 'Finance', example: null }])
    expect(res.progress?.get(wordKey('Liquidité', 'Finance'))?.successes).toBe(1)
  })

  it('rejette un JSON invalide ou mal formé', () => {
    expect(parseJsonImport('{').issues[0].message).toBe('JSON invalide')
    expect(parseJsonImport('{"foo":1}').rows).toEqual([])
    expect(parseJsonImport('[{"term":42,"definition":"x"}]').issues).toHaveLength(1)
  })
})

describe('doublons', () => {
  it('ignore les doublons exacts dans une même catégorie, insensibles à la casse', () => {
    const rows = [
      { term: 'Aléa', definition: 'a', category: null, example: null },
      { term: 'aléa ', definition: 'b', category: null, example: null },
      { term: 'Aléa', definition: 'c', category: 'Finance', example: null },
      { term: 'Inflation', definition: 'd', category: 'Économie', example: null },
    ]
    const { fresh, duplicates } = dedupeImport(rows, new Set([wordKey('INFLATION', 'économie')]))
    expect(fresh.map((r) => r.definition)).toEqual(['a', 'c'])
    expect(duplicates).toBe(2)
  })
})
