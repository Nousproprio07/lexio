/**
 * Vérifie la migration SQL et l'isolation Row Level Security dans un vrai
 * Postgres (PGlite), avec un stub minimal de l'environnement Supabase
 * (schéma auth, fonction auth.uid(), rôles anon / authenticated).
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
let db: PGlite

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : 'set role anon;')
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `)
  for (const f of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
  }
}, 60_000)

describe('schéma Supabase', () => {
  it('remplit user_id automatiquement et empêche les doublons dans une même catégorie', async () => {
    await as(A, async () => {
      await db.query(`insert into words (term, definition) values ('Aléa', 'Événement imprévisible.')`)
      const { rows } = await db.query<{ user_id: string }>('select user_id from words')
      expect(rows[0].user_id).toBe(A)
      await expect(db.query(`insert into words (term, definition) values (' aléa', 'Autre.')`)).rejects.toThrow(/duplicate|unique/)
      const cat = await db.query<{ id: string }>(`insert into categories (name) values ('Finance') returning id`)
      await db.query(`insert into words (term, definition, category_id) values ('Aléa', 'Risque.', $1)`, [cat.rows[0].id])
    })
  })

  it('isole les données de chaque utilisateur (RLS)', async () => {
    await as(B, async () => {
      expect((await db.query('select * from words')).rows).toHaveLength(0)
      expect((await db.query('select * from categories')).rows).toHaveLength(0)
      const upd = await db.query(`update words set term = 'piraté'`)
      expect(upd.affectedRows ?? 0).toBe(0)
      await expect(db.query(`insert into words (user_id, term, definition) values ('${A}', 'x', 'y')`)).rejects.toThrow(/row-level security/)
    })
    await as(A, async () => {
      expect((await db.query('select * from words')).rows).toHaveLength(2)
    })
  })

  it('le rôle anonyme n’a aucun accès', async () => {
    await as(null, async () => {
      await expect(db.query('select * from words')).rejects.toThrow(/permission denied/)
    })
  })

  it('interdit de rattacher progression ou réponses au mot d’un autre utilisateur', async () => {
    const wordA = await as(A, async () => (await db.query<{ id: string }>('select id from words limit 1')).rows[0].id)
    await as(B, async () => {
      await expect(db.query(`insert into word_progress (word_id) values ($1)`, [wordA])).rejects.toThrow(/foreign key/)
      const s = await db.query<{ id: string }>(`insert into quiz_sessions (mode, question_count) values ('word', 1) returning id`)
      await expect(
        db.query(`insert into quiz_answers (session_id, word_id, kind, expected, is_correct) values ($1, $2, 'word', 'x', true)`, [s.rows[0].id, wordA]),
      ).rejects.toThrow(/foreign key/)
    })
  })

  it('cascade et mise à NULL à la suppression', async () => {
    await as(A, async () => {
      const w = (await db.query<{ id: string }>(`insert into words (term, definition) values ('Temp', 'Déf.') returning id`)).rows[0].id
      await db.query(`insert into word_progress (word_id, successes, status) values ($1, 1, 'learning')`, [w])
      const s = (await db.query<{ id: string }>(`insert into quiz_sessions (mode, question_count) values ('mixed', 1) returning id`)).rows[0].id
      await db.query(`insert into quiz_answers (session_id, word_id, kind, expected, is_correct) values ($1, $2, 'word', 'Temp', true)`, [s, w])
      await db.query('delete from words where id = $1', [w])
      expect((await db.query('select * from word_progress where word_id = $1', [w])).rows).toHaveLength(0)
      const ans = await db.query<{ word_id: string | null; user_id: string }>('select word_id, user_id from quiz_answers where session_id = $1', [s])
      expect(ans.rows[0]).toEqual({ word_id: null, user_id: A })
      // suppression d'une catégorie : les mots restent, sans catégorie
      const c = (await db.query<{ id: string }>(`insert into categories (name) values ('Philo') returning id`)).rows[0].id
      await db.query(`insert into words (term, definition, category_id) values ('Doxa', 'Opinion commune.', $1)`, [c])
      await db.query('delete from categories where id = $1', [c])
      const doxa = await db.query<{ category_id: string | null; user_id: string }>(`select category_id, user_id from words where term = 'Doxa'`)
      expect(doxa.rows[0]).toEqual({ category_id: null, user_id: A })
    })
  })
})
