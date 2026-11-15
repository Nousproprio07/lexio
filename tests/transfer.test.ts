import { describe, expect, it } from 'vitest'
import { dedupeImport, entryKey, parseCsv, parseCsvImport, parseJsonImport, toCsv, toJsonExport, wordKey } from '../src/lib/transfer'
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
    const { progress: restored, ...row } = res.rows[0]
    expect(row).toEqual({ term: 'Liquidité', definition: 'Facilité de conversion en monnaie.', category: 'Finance', example: null })
    expect(restored?.successes).toBe(1)
  })

  it('relit la progression des anciennes sauvegardes', () => {
    const old = {
      words: [{ term: 'Liquidité', definition: 'x', category: 'Finance', example: null }],
      progress: [{ ...review(null, 'Liquidité', true, new Date(2026, 9, 1)), term: 'Liquidité', category: 'Finance' }],
    }
    expect(parseJsonImport(JSON.stringify(old)).progress?.get(wordKey('Liquidité', 'Finance'))?.successes).toBe(1)
  })

  it('aller-retour d’une question de culture générale avec son image', () => {
    const q: Word = {
      ...w('Claude Monet', 'Qui a peint ce tableau ?', null),
      kind: 'question',
      imageId: 'img1',
      alternates: ['Monet'],
      example: 'Impression, soleil levant.',
    }
    const json = JSON.stringify(toJsonExport([q], [], new Map(), new Date(), new Map([['img1', 'data:image/jpeg;base64,AAAA']])))
    const [row] = parseJsonImport(json).rows
    expect(row).toMatchObject({
      kind: 'question',
      term: 'Claude Monet',
      definition: 'Qui a peint ce tableau ?',
      alternates: ['Monet'],
      image: 'data:image/jpeg;base64,AAAA',
      example: 'Impression, soleil levant.',
    })
    expect(toCsv([q], () => null)).not.toContain('Monet')
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

  it('deux tableaux du même peintre ne sont pas des doublons', () => {
    const base = { kind: 'question' as const, term: 'Claude Monet', definition: 'Qui a peint ce tableau ?', category: 'Peintres', example: null }
    const rows = [
      { ...base, imageId: 'a' },
      { ...base, imageId: 'b' },
      { ...base, imageId: 'a' },
    ]
    const { fresh, duplicates } = dedupeImport(rows, new Set())
    expect(fresh.map((r) => r.imageId)).toEqual(['a', 'b'])
    expect(duplicates).toBe(1)
    // une question n'entre pas en conflit avec un mot de même intitulé
    expect(entryKey({ ...base, imageId: null })).not.toBe(wordKey('Claude Monet', 'Peintres'))
  })
})
