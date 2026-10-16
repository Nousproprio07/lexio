-- ============================================================================
-- Lexio — schéma initial
-- À exécuter une fois dans Supabase (SQL Editor) ou via `supabase db push`.
--
-- Principes :
--  * chaque ligne porte `user_id` (rempli automatiquement par auth.uid()) ;
--  * Row Level Security activée partout : un utilisateur ne voit et ne modifie
--    que ses propres lignes ;
--  * les relations entre tables passent par des clés étrangères composites
--    (id, user_id) : impossible de rattacher une ligne à un mot ou une session
--    appartenant à quelqu'un d'autre, même en forgeant une requête.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Catégories personnalisées
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create unique index categories_user_name_key on public.categories (user_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Mots
-- ---------------------------------------------------------------------------
create table public.words (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term         text not null check (char_length(btrim(term)) between 1 and 120),
  definition   text not null check (char_length(btrim(definition)) between 1 and 2000),
  example      text check (example is null or char_length(example) <= 1000),
  category_id  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  -- la catégorie doit appartenir au même utilisateur ; si elle est supprimée,
  -- le mot devient « sans catégorie » (seule la colonne category_id est remise à NULL)
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id)
);
-- pas de doublon exact (insensible à la casse) dans une même catégorie
create unique index words_user_term_category_key on public.words (
  user_id,
  lower(btrim(term)),
  coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index words_user_created_idx on public.words (user_id, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger words_touch_updated_at before update on public.words
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Progression par mot (répétition espacée). Absente = mot « Nouveau ».
-- ---------------------------------------------------------------------------
create table public.word_progress (
  word_id           uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  successes         integer not null default 0 check (successes >= 0),
  failures          integer not null default 0 check (failures >= 0),
  streak            integer not null default 0 check (streak >= 0),   -- réussites consécutives
  repetitions       integer not null default 0 check (repetitions >= 0), -- révisions espacées réussies
  ease              real    not null default 2.5 check (ease between 1.3 and 3.0),
  interval_days     integer not null default 0 check (interval_days >= 0),
  last_reviewed_at  timestamptz,
  due_at            timestamptz,
  status            text not null default 'new'
                    check (status in ('new', 'learning', 'weak', 'mastered')),
  updated_at        timestamptz not null default now(),
  foreign key (word_id, user_id) references public.words (id, user_id) on delete cascade
);
create index word_progress_user_due_idx on public.word_progress (user_id, due_at);

create trigger word_progress_touch_updated_at before update on public.word_progress
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions de quiz
-- ---------------------------------------------------------------------------
create table public.quiz_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode            text not null check (mode in ('word', 'definition', 'mixed')),
  question_count  integer not null check (question_count between 1 and 10000),
  answered_count  integer not null default 0 check (answered_count >= 0),
  correct_count   integer not null default 0 check (correct_count >= 0),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (id, user_id),
  check (correct_count <= answered_count)
);
create index quiz_sessions_user_started_idx on public.quiz_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Réponses données
-- ---------------------------------------------------------------------------
create table public.quiz_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id   uuid not null,
  word_id      uuid,                       -- NULL si le mot a été supprimé depuis
  kind         text not null check (kind in ('word', 'definition', 'recall')),
  given_answer text check (given_answer is null or char_length(given_answer) <= 2000),
  expected     text not null,
  is_correct   boolean not null,
  answered_at  timestamptz not null default now(),
  foreign key (session_id, user_id) references public.quiz_sessions (id, user_id) on delete cascade,
  foreign key (word_id, user_id) references public.words (id, user_id) on delete set null (word_id)
);
create index quiz_answers_session_idx on public.quiz_answers (session_id);
create index quiz_answers_user_word_idx on public.quiz_answers (user_id, word_id);

-- ---------------------------------------------------------------------------
-- Row Level Security : chaque utilisateur n'accède qu'à ses propres lignes.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'words', 'word_progress', 'quiz_sessions', 'quiz_answers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end $$;

-- Le rôle anonyme n'a besoin d'aucun accès aux données.
revoke all on public.categories, public.words, public.word_progress, public.quiz_sessions, public.quiz_answers from anon;
grant select, insert, update, delete on public.categories, public.words, public.word_progress, public.quiz_sessions, public.quiz_answers to authenticated;
