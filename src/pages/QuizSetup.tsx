import { ArrowRight, BookPlus, Info, Play, RotateCcw, Shuffle, SquarePen, ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useWordDialogs } from '../components/WordDialogs'
import { EmptyState, PageHeader, plural, ProgressBar, Toggle } from '../components/ui'
import { dueWords, filterPool, NEW_WORDS_PER_SMART_SESSION, OPTIONS_COUNT, type SessionSize } from '../lib/quiz'
import { textKey } from '../lib/normalize'
import type { QuizMode } from '../lib/types'
import { useData } from '../state/data'
import { useQuiz, type RunConfig } from '../state/quiz'
import { useIgnoreAccents } from '../state/settings'

const configKey = (scope: string) => `lexio:quiz-config:${scope}`
const DEFAULT_CONFIG: RunConfig = { mode: 'mixed', size: 10, filters: { categoryId: null, onlyUnmastered: false, smart: false } }

function loadConfig(scope: string): RunConfig {
  try {
    const c = JSON.parse(localStorage.getItem(configKey(scope)) ?? 'null') as RunConfig | null
    return c ? { ...DEFAULT_CONFIG, ...c, filters: { ...DEFAULT_CONFIG.filters, ...c.filters } } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

const MODES: { value: QuizMode; title: string; desc: string; icon: typeof Play }[] = [
  { value: 'word', title: 'Retrouver le mot', desc: 'Une définition, vous écrivez le mot.', icon: SquarePen },
  { value: 'definition', title: 'Retrouver la définition', desc: 'Un mot, quatre définitions au choix.', icon: ListChecks },
  { value: 'mixed', title: 'Mixte', desc: 'Les deux exercices en alternance.', icon: Shuffle },
]

const SIZES: { value: SessionSize; label: string }[] = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 'all', label: 'Tous' },
]

export function QuizSetupPage() {
  const { words, categories, progress, scope } = useData()
  const { run, start, abandon } = useQuiz()
  const { openNew } = useWordDialogs()
  const navigate = useNavigate()
  const [ignoreAccents, setIgnoreAccents] = useIgnoreAccents()
  const [config, setConfig] = useState<RunConfig>(() => loadConfig(scope))
  const [error, setError] = useState<string | null>(null)

  // catégorie mémorisée mais supprimée depuis
  const categoryId =
    config.filters.categoryId && config.filters.categoryId !== '' && !categories.some((c) => c.id === config.filters.categoryId)
      ? null
      : config.filters.categoryId
  const effective: RunConfig = { ...config, filters: { ...config.filters, categoryId } }

  const available = useMemo(() => {
    const pool = filterPool(words, progress, effective.filters)
    if (!effective.filters.smart) return pool.length
    const due = dueWords(pool, progress, new Date())
    const fresh = due.filter((w) => !progress.get(w.id) || progress.get(w.id)?.status === 'new').length
    return due.length - fresh + Math.min(fresh, NEW_WORDS_PER_SMART_SESSION)
  }, [words, progress, effective.filters])

  const count = effective.size === 'all' ? available : Math.min(effective.size, available)
  const distinctDefinitions = useMemo(() => new Set(words.map((w) => textKey(w.definition))).size, [words])

  const update = (patch: Partial<RunConfig> | ((c: RunConfig) => RunConfig)) =>
    setConfig((c) => (typeof patch === 'function' ? patch(c) : { ...c, ...patch }))
  const setFilter = <K extends keyof RunConfig['filters']>(k: K, v: RunConfig['filters'][K]) =>
    update((c) => ({ ...c, filters: { ...c.filters, [k]: v } }))

  const launch = () => {
    try {
      localStorage.setItem(configKey(scope), JSON.stringify(effective))
    } catch {
      /* ignoré */
    }
    if (!start(effective)) {
      setError('Aucun mot ne correspond à ces critères.')
      return
    }
    navigate('/quiz/session')
  }

  if (run && !run.finishedAt) {
    const answered = run.results.filter(Boolean).length
    return (
      <div className="mx-auto max-w-lg animate-fade-up">
        <PageHeader title="Quiz" />
        <div className="card p-6">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <RotateCcw className="size-6" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold">Une session est en cours</h2>
          <p className="mt-1 text-[15px] text-muted">
            Vous en êtes à la question {run.index + 1} sur {run.questions.length}. Vos réponses déjà données sont enregistrées.
          </p>
          <div className="mt-5">
            <ProgressBar value={(answered / run.questions.length) * 100} label="Progression de la session" />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-primary flex-1" onClick={() => navigate('/quiz/session')}>
              Reprendre
              <ArrowRight className="size-4.5" aria-hidden />
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={abandon}>
              Abandonner la session
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (words.length === 0) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Quiz" />
        <EmptyState
          icon={<BookPlus className="size-7" />}
          title="Ajoutez d'abord quelques mots"
          action={
            <button type="button" className="btn-primary" onClick={openNew}>
              Ajouter un mot
            </button>
          }
        >
          Les quiz sont créés automatiquement à partir de votre dictionnaire.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <PageHeader title="Nouveau quiz" subtitle="Choisissez votre exercice, Lexio s'occupe du reste." />

      <div className="space-y-6">
        <fieldset>
          <legend className="label mb-2.5">Exercice</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {MODES.map(({ value, title, desc, icon: Icon }) => (
              <label
                key={value}
                className="card flex cursor-pointer items-start gap-3 p-4 transition-colors has-checked:border-brand has-checked:bg-brand-soft/60 has-focus-visible:ring-2 has-focus-visible:ring-brand sm:flex-col sm:gap-2"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  className="sr-only"
                  checked={config.mode === value}
                  onChange={() => update({ mode: value })}
                />
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">{desc}</span>
                </span>
              </label>
            ))}
          </div>
          {config.mode !== 'word' && distinctDefinitions < OPTIONS_COUNT && (
            <p className="mt-2.5 flex gap-2 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Il faut au moins 4 définitions différentes pour proposer des choix. En attendant, Lexio vous montrera la définition et vous direz si vous la
              connaissiez.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="label mb-2.5">Nombre de questions</legend>
          <div className="grid grid-cols-4 gap-2">
            {SIZES.map(({ value, label }) => (
              <label
                key={label}
                className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-line bg-white font-semibold text-muted transition-colors has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-dark has-focus-visible:ring-2 has-focus-visible:ring-brand"
              >
                <input type="radio" name="size" className="sr-only" checked={config.size === value} onChange={() => update({ size: value })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="card divide-y divide-line px-4">
          <div className="py-3.5">
            <label htmlFor="quiz-cat" className="label">
              Catégorie
            </label>
            <select
              id="quiz-cat"
              className="field select pr-9"
              value={categoryId ?? '__all'}
              onChange={(e) => setFilter('categoryId', e.target.value === '__all' ? null : e.target.value)}
            >
              <option value="__all">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {words.some((w) => !w.categoryId) && <option value="">Sans catégorie</option>}
            </select>
          </div>
          <div className="py-3.5">
            <Toggle
              label="Révision intelligente"
              description="Uniquement les mots à revoir aujourd'hui, les plus fragiles en premier."
              checked={config.filters.smart}
              onChange={(v) => setFilter('smart', v)}
            />
          </div>
          <div className="py-3.5">
            <Toggle
              label="Uniquement les mots non maîtrisés"
              checked={config.filters.onlyUnmastered}
              onChange={(v) => setFilter('onlyUnmastered', v)}
            />
          </div>
          {config.mode !== 'definition' && (
            <div className="py-3.5">
              <Toggle
                label="Tolérer les accents oubliés"
                description="« resilience » sera accepté pour « résilience »."
                checked={ignoreAccents}
                onChange={setIgnoreAccents}
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 bg-gradient-to-t from-page from-70% px-4 pt-4 pb-2 md:static md:mx-0 md:bg-none md:p-0">
          {count > 0 ? (
            <button type="button" className="btn-primary h-14 w-full text-base" onClick={launch}>
              <Play className="size-5" aria-hidden />
              Commencer · {plural(count, 'question')}
            </button>
          ) : (
            <p className="card p-4 text-center text-[15px] text-muted">
              {config.filters.smart ? "Rien à réviser aujourd'hui avec ces critères. Désactivez la révision intelligente pour vous entraîner quand même." : 'Aucun mot ne correspond à ces critères.'}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
